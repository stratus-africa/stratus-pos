ALTER TABLE public.stock_count_items
  ADD CONSTRAINT stock_count_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;