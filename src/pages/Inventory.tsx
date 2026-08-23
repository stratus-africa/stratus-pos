const handleAdjust = async (data: AdjustStockSubmit) => {
  setAdjustmentSubmitting(true);

  try {
    /*
     * The current inventory_control_request RPC accepts:
     *   Issue
     *   Write-off
     *   Adjustment
     *
     * The Stock Adjustment UI has more descriptive reasons.
     *
     * Until the database migration is applied, map those
     * descriptive reasons to the canonical Adjustment reason.
     */
    const controlReason = data.reason === "Issue" ? "Issue" : data.reason === "Write-off" ? "Write-off" : "Adjustment";

    await inventoryData.createControlRequest({
      locationId: data.location_id,
      reason: controlReason,
      notes: [`Adjustment reason: ${data.reason}`, data.notes?.trim()].filter(Boolean).join("\n"),
      reference: null,
      items: data.items.map((item) => ({
        product_id: item.product_id,
        quantity_change: Number(item.quantity_change),
        unit_cost: Number(item.unit_cost) || 0,
      })),
    });

    toast.success("Stock adjustment submitted for approval");

    /*
     * Refresh inventory/control-request data.
     */
    await Promise.all([inventoryQuery.refetch?.(), controlRequestsQuery?.refetch?.()].filter(Boolean));

    setAdjDialogOpen(false);
  } catch (error) {
    console.error("Stock adjustment failed:", error);

    toast.error(error instanceof Error ? error.message : "Failed to submit stock adjustment");

    throw error;
  } finally {
    setAdjustmentSubmitting(false);
  }
};
