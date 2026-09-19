REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE
  public.stock_adjustments,
  public.stock_adjustment_items,
  public.stock_transfers,
  public.stock_transfer_items
FROM anon, authenticated, PUBLIC;
