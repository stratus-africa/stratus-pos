-- Remove duplicate (user_id, product_id) rows keeping the most recent one
DELETE FROM public.subscriptions a
USING public.subscriptions b
WHERE a.user_id = b.user_id
  AND a.product_id IS NOT NULL
  AND b.product_id IS NOT NULL
  AND a.product_id = b.product_id
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_product_unique
  ON public.subscriptions (user_id, product_id)
  WHERE product_id IS NOT NULL;
