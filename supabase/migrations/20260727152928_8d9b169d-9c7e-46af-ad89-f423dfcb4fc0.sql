DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_adjustments; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.stock_adjustments REPLICA IDENTITY FULL;