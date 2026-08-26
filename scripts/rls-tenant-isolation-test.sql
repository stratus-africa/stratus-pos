-- Tenant isolation verification for products & stock_adjustments under RLS.
-- Simulates an authenticated user of tenant B and confirms tenant A's rows
-- are invisible and unmodifiable. Raises the results so everything rolls back.
-- stock_adjustments is tenant-scoped via location_id -> locations.business_id.
-- Adjust the IDs below before running.
do $$
declare
  v_biz_a  uuid := '14bebd7b-075f-4f30-aec0-585a86dfaf63'; -- victim tenant
  v_biz_b  uuid := '23dd8341-2cc0-4fe1-8356-32097da5c71c'; -- attacker's tenant
  v_user_b uuid := 'abf15b9d-3cc7-4acc-947f-3e2351f1c001'; -- user of tenant B
  v_loc_a  uuid := 'b752dc66-4a5e-4f86-b828-da0d71acc8a8'; -- tenant A location
  v_count int;
  v_results text := '';
begin
  -- Become an authenticated user of tenant B
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_b, 'role', 'authenticated')::text, true);

  -- 1. SELECT isolation: products
  select count(*) into v_count from public.products where business_id = v_biz_a;
  v_results := v_results || format('[products SELECT other-tenant] rows=%s %s | ',
    v_count, case when v_count = 0 then 'OK' else 'FAIL' end);

  -- 2. UPDATE isolation: products
  update public.products set name = name where business_id = v_biz_a;
  get diagnostics v_count = row_count;
  v_results := v_results || format('[products UPDATE other-tenant] rows=%s %s | ',
    v_count, case when v_count = 0 then 'OK' else 'FAIL' end);

  -- 3. INSERT isolation: products
  begin
    insert into public.products(business_id, name, selling_price, purchase_price)
    values (v_biz_a, 'RLS-TEST', 1, 1);
    v_results := v_results || '[products INSERT other-tenant] FAIL: allowed | ';
  exception when others then
    v_results := v_results || '[products INSERT other-tenant] blocked OK | ';
  end;

  -- 4. SELECT isolation: stock_adjustments (scoped by tenant A location)
  select count(*) into v_count from public.stock_adjustments where location_id = v_loc_a;
  v_results := v_results || format('[stock_adjustments SELECT other-tenant] rows=%s %s | ',
    v_count, case when v_count = 0 then 'OK' else 'FAIL' end);

  -- 5. UPDATE isolation: stock_adjustments
  update public.stock_adjustments set notes = notes where location_id = v_loc_a;
  get diagnostics v_count = row_count;
  v_results := v_results || format('[stock_adjustments UPDATE other-tenant] rows=%s %s | ',
    v_count, case when v_count = 0 then 'OK' else 'FAIL' end);

  -- 6. INSERT isolation: stock_adjustments
  begin
    insert into public.stock_adjustments(product_id, location_id, quantity_change, reason, created_by)
    values (null, v_loc_a, 1, 'rls-test', v_user_b);
    v_results := v_results || '[stock_adjustments INSERT other-tenant] FAIL: allowed | ';
  exception when others then
    v_results := v_results || '[stock_adjustments INSERT other-tenant] blocked OK | ';
  end;

  -- 7. Positive control: own tenant remains readable
  select count(*) into v_count from public.products where business_id = v_biz_b;
  v_results := v_results || format('[products SELECT own-tenant] rows=%s OK | ', v_count);

  -- Raise to force ROLLBACK: role switch and any test writes are discarded.
  raise exception 'TEST_RESULTS_ROLLBACK %', v_results;
end $$;
