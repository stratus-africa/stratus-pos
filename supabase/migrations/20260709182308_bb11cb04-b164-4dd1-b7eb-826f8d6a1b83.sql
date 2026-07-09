
-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  business_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, read_at, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger: notify super admins on new offline payment request; notify submitter on review
CREATE OR REPLACE FUNCTION public.notify_offline_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _biz_name TEXT;
BEGIN
  SELECT name INTO _biz_name FROM public.businesses WHERE id = COALESCE(NEW.business_id, OLD.business_id);

  IF TG_OP = 'INSERT' THEN
    -- Notify all super admins
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    SELECT sa.user_id,
           'offline_payment_pending',
           'New offline payment request',
           COALESCE(_biz_name, 'A tenant') || ' submitted a ' || NEW.billing_interval || ' payment of KES ' || COALESCE(NEW.amount_kes::text, '0'),
           '/super-admin/subscriptions',
           NEW.business_id,
           jsonb_build_object('request_id', NEW.id, 'reference', NEW.reference)
      FROM public.super_admins sa;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, business_id, metadata)
    VALUES (
      NEW.submitted_by,
      'offline_payment_' || NEW.status,
      'Payment ' || NEW.status,
      CASE WHEN NEW.status = 'approved'
        THEN 'Your offline payment for ' || COALESCE(_biz_name, 'your business') || ' was approved.'
        ELSE 'Your offline payment for ' || COALESCE(_biz_name, 'your business') || ' was rejected.' ||
             CASE WHEN NEW.review_notes IS NOT NULL THEN ' Reason: ' || NEW.review_notes ELSE '' END
      END,
      '/settings',
      NEW.business_id,
      jsonb_build_object('request_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_offline_payment ON public.offline_payment_requests;
CREATE TRIGGER trg_notify_offline_payment
AFTER INSERT OR UPDATE ON public.offline_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_offline_payment_change();

-- Trigger: notify user on subscription create/change
CREATE OR REPLACE FUNCTION public.notify_subscription_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _biz_name TEXT;
  _plan_name TEXT;
  _title TEXT;
  _msg TEXT;
BEGIN
  SELECT name INTO _biz_name FROM public.businesses WHERE owner_id = NEW.user_id LIMIT 1;
  BEGIN
    SELECT name INTO _plan_name FROM public.subscription_packages WHERE id::text = NEW.product_id;
  EXCEPTION WHEN OTHERS THEN _plan_name := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    _title := 'Subscription activated';
    _msg := COALESCE(_biz_name, 'Your business') || ' is now on the ' || COALESCE(_plan_name, 'selected') || ' plan.';
  ELSE
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      _title := 'Plan updated';
      _msg := COALESCE(_biz_name, 'Your business') || ' plan changed to ' || COALESCE(_plan_name, 'a new plan') || '.';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      _title := 'Subscription ' || NEW.status;
      _msg := COALESCE(_biz_name, 'Your subscription') || ' status is now ' || NEW.status || '.';
    ELSIF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end THEN
      _title := 'Subscription renewed';
      _msg := COALESCE(_biz_name, 'Your subscription') || ' now valid until ' || to_char(NEW.current_period_end, 'DD Mon YYYY') || '.';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  VALUES (
    NEW.user_id,
    'subscription_' || COALESCE(NEW.status, 'update'),
    _title,
    _msg,
    '/settings',
    jsonb_build_object('subscription_id', NEW.id, 'plan', _plan_name, 'business', _biz_name)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_subscription ON public.subscriptions;
CREATE TRIGGER trg_notify_subscription
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_subscription_change();
