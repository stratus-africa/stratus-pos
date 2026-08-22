-- Adds Step 4 product catalogue import to the self-signup workspace creation RPC.
-- Apply after 20260822133700_self_signup_wizard.sql.

CREATE OR REPLACE FUNCTION public.complete_self_signup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _draft public.onboarding_drafts;
  _data jsonb;
  _business_id uuid;
  _location_id uuid;
  _package_id uuid;
  _trial_days integer := 0;
  _email_verified_at timestamptz;
  _permissions text[];
  _email text;
  _full_name text;
  _phone text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _draft FROM public.onboarding_drafts WHERE user_id = _uid FOR UPDATE;
  IF _draft IS NULL THEN
    RAISE EXCEPTION 'Onboarding has not been started';
  END IF;

  _data := COALESCE(_draft.data, '{}'::jsonb);
  _email := lower(trim(COALESCE(_data->'account'->>'email', '')));
  _full_name := trim(COALESCE(_data->'business'->>'contactPerson', ''));
  _phone := trim(COALESCE(_data->'business'->>'contactPhone', ''));

  IF length(trim(COALESCE(_data->'business'->>'companyName', ''))) < 2 THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;
  IF length(_full_name) < 2 THEN
    RAISE EXCEPTION 'Contact person is required';
  END IF;
  IF length(_phone) < 5 THEN
    RAISE EXCEPTION 'Contact phone is required';
  END IF;
  IF length(trim(COALESCE(_data->'location'->>'name', ''))) < 2 THEN
    RAISE EXCEPTION 'First location name is required';
  END IF;

  -- Idempotency: if a business was already created, return it instead of duplicating it.
  SELECT id INTO _business_id
  FROM public.businesses
  WHERE owner_id = _uid
  ORDER BY created_at DESC
  LIMIT 1;

  IF _business_id IS NOT NULL THEN
    UPDATE public.onboarding_drafts
      SET completed_at = COALESCE(completed_at, now()), current_step = 7
      WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'business_id', _business_id, 'already_created', true);
  END IF;

  _package_id := NULLIF(COALESCE(_data->'plan'->>'packageId', ''), '')::uuid;

  SELECT email_confirmed_at INTO _email_verified_at FROM auth.users WHERE id = _uid;

  IF _package_id IS NOT NULL THEN
    SELECT trial_days INTO _trial_days
    FROM public.subscription_packages
    WHERE id = _package_id AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected plan is no longer available';
    END IF;
  END IF;

  _business_id := gen_random_uuid();
  _location_id := gen_random_uuid();

  INSERT INTO public.businesses (
    id, name, business_type, contact_person, contact_phone, phone, email,
    kra_pin, business_reg_no, owner_id, selected_package_id, email_verified_at,
    currency, timezone, tax_rate, vat_enabled, tax_inclusive_pricing,
    mpesa_enabled, mpesa_shortcode, mpesa_paybill_or_till,
    pos_auto_print_receipt, approval_status, approved_at, is_active, status
  ) VALUES (
    _business_id,
    trim(_data->'business'->>'companyName'),
    COALESCE(NULLIF(trim(_data->'business'->>'businessType'), ''), 'general'),
    _full_name,
    _phone,
    _phone,
    NULLIF(_email, ''),
    NULLIF(upper(trim(_data->'business'->>'kraPin')), ''),
    NULLIF(trim(_data->'business'->>'businessRegNo'), ''),
    _uid,
    _package_id,
    _email_verified_at,
    COALESCE(NULLIF(_data->'payments'->>'currency', ''), 'KES'),
    COALESCE(NULLIF(_data->'payments'->>'timezone', ''), 'Africa/Nairobi'),
    COALESCE(NULLIF(_data->'payments'->>'taxRate', '')::numeric, 16),
    COALESCE((_data->'payments'->>'vatEnabled')::boolean, true),
    COALESCE((_data->'payments'->>'taxInclusivePricing')::boolean, true),
    COALESCE((_data->'payments'->>'mpesaEnabled')::boolean, true),
    NULLIF(trim(_data->'payments'->>'mpesaShortcode'), ''),
    NULLIF(trim(_data->'payments'->>'mpesaPaybillOrTill'), ''),
    COALESCE((_data->'payments'->>'autoPrintReceipt')::boolean, false),
    'approved', now(), true, 'active'
  );

  INSERT INTO public.locations (id, business_id, name, type, address, is_active)
  VALUES (
    _location_id,
    _business_id,
    trim(_data->'location'->>'name'),
    COALESCE(NULLIF(_data->'location'->>'type', ''), 'store'),
    NULLIF(trim(concat_ws(', ',
      NULLIF(trim(_data->'location'->>'address'), ''),
      NULLIF(trim(_data->'location'->>'city'), ''),
      NULLIF(trim(_data->'location'->>'county'), '')
    )), ''),
    true
  );

  UPDATE public.profiles
    SET business_id = _business_id,
        full_name = _full_name,
        phone = _phone,
        email = COALESCE(NULLIF(_email, ''), email),
        assigned_location_id = _location_id,
        is_active = true
    WHERE id = _uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, business_id, full_name, phone, email, assigned_location_id, is_active)
    VALUES (_uid, _business_id, _full_name, _phone, NULLIF(_email, ''), _location_id, true);
  END IF;

  INSERT INTO public.user_roles (user_id, business_id, role)
  VALUES (_uid, _business_id, 'admin')
  ON CONFLICT (user_id, role, business_id) DO NOTHING;

  -- Seed the admin role from the current module/feature catalog. This keeps the
  -- self-signup path aligned with the same permission catalog used by Roles & Permissions.
  SELECT array_agg(DISTINCT permission_key ORDER BY permission_key)
    INTO _permissions
  FROM public.module_features
  WHERE is_active = true AND permission_key IS NOT NULL AND length(permission_key) > 0;

  IF _permissions IS NOT NULL THEN
    INSERT INTO public.role_permissions (business_id, role, permission)
    SELECT _business_id, 'admin'::public.app_role, p
    FROM unnest(_permissions) AS p
    ON CONFLICT (business_id, role, permission) DO NOTHING;
  END IF;

  -- If the user chose catalogue import in Step 4, create the staged products now.
  -- The wizard uses the same field mapping as Products -> Data -> Import file.
  IF COALESCE(_data->'products'->>'mode', '') = 'import' THEN
    DECLARE
      _product_row jsonb;
      _category_id uuid;
      _brand_id uuid;
      _unit_id uuid;
      _category_name text;
      _brand_name text;
      _unit_name text;
    BEGIN
      FOR _product_row IN SELECT value FROM jsonb_array_elements(COALESCE(_data->'products'->'importRows', '[]'::jsonb)) LOOP
        _category_id := NULL;
        _brand_id := NULL;
        _unit_id := NULL;
        _category_name := NULLIF(trim(COALESCE(_product_row->>'category', '')), '');
        _brand_name := NULLIF(trim(COALESCE(_product_row->>'brand', '')), '');
        _unit_name := NULLIF(trim(COALESCE(_product_row->>'unit', '')), '');

        IF _category_name IS NOT NULL THEN
          SELECT id INTO _category_id FROM public.categories
          WHERE business_id = _business_id AND lower(name) = lower(_category_name)
          LIMIT 1;
          IF _category_id IS NULL THEN
            INSERT INTO public.categories (business_id, name) VALUES (_business_id, _category_name)
            RETURNING id INTO _category_id;
          END IF;
        END IF;

        IF _brand_name IS NOT NULL THEN
          SELECT id INTO _brand_id FROM public.brands
          WHERE business_id = _business_id AND lower(name) = lower(_brand_name)
          LIMIT 1;
          IF _brand_id IS NULL THEN
            INSERT INTO public.brands (business_id, name) VALUES (_business_id, _brand_name)
            RETURNING id INTO _brand_id;
          END IF;
        END IF;

        IF _unit_name IS NOT NULL THEN
          SELECT id INTO _unit_id FROM public.units
          WHERE business_id = _business_id AND lower(name) = lower(_unit_name)
          LIMIT 1;
          IF _unit_id IS NULL THEN
            INSERT INTO public.units (business_id, name) VALUES (_business_id, _unit_name)
            RETURNING id INTO _unit_id;
          END IF;
        END IF;

        INSERT INTO public.products (
          business_id, name, sku, barcode, category_id, brand_id, unit_id,
          purchase_price, selling_price, tax_rate, is_active
        ) VALUES (
          _business_id,
          trim(COALESCE(_product_row->>'name', 'Unnamed')),
          NULLIF(trim(COALESCE(_product_row->>'sku', '')), ''),
          NULLIF(trim(COALESCE(_product_row->>'barcode', '')), ''),
          _category_id, _brand_id, _unit_id,
          COALESCE(NULLIF(_product_row->>'purchase_price', '')::numeric, 0),
          COALESCE(NULLIF(_product_row->>'selling_price', '')::numeric, 0),
          COALESCE(NULLIF(_product_row->>'tax_rate', '')::numeric, 16),
          COALESCE((_product_row->>'is_active')::boolean, true)
        );
      END LOOP;
    END;
  END IF;

  -- Save the chosen onboarding configuration and mark the wizard complete.
  UPDATE public.onboarding_drafts
    SET completed_at = now(), current_step = 7
    WHERE user_id = _uid;

  -- A free/trial package is initialized immediately. Paid plans can still be
  -- upgraded later through the existing subscription flow.
  IF _package_id IS NOT NULL AND _trial_days > 0 THEN
    INSERT INTO public.subscriptions (
      user_id, product_id, status, environment,
      current_period_start, current_period_end, cancel_at_period_end, payment_provider
    ) VALUES (
      _uid, _package_id::text, 'trialing', 'live',
      now(), now() + (_trial_days || ' days')::interval, true, 'trial'
    )
    ON CONFLICT (user_id, environment) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'business_id', _business_id,
    'location_id', _location_id,
    'already_created', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_self_signup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_self_signup() TO authenticated;
