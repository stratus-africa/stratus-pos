# StratusPOS — Phase 1 Inventory — Pass 1

Implemented from the existing Inventory.tsx source:

- Fixed the duplicate `<Select>` parser error that was causing Vite to fail.
- Added permission-gated Stock Movements tab using `inventory.view_movements`.
- Added permission-gated Stock Valuation tab using `inventory.view_valuation`.
- Restored/added Stock Transfers tab using the existing `StockTransfersTab` and canonical transfer permissions.
- Preserved existing Stock Levels, Adjustments, Stock Take and Reconciliation tabs.
- No new permission keys were invented.

Files:
- `src/pages/Inventory.tsx`
- `src/components/inventory/StockMovementsTab.tsx`
- `src/components/inventory/StockValuationTab.tsx`
- Existing `src/components/inventory/StockTransfersTab.tsx` is retained unchanged.

Next Inventory pass:
- Stock Issues
- Write-offs
- Adjustment approval workflow
- Variance approval
- Batch management
- Expiry management
- Backend/RPC authorization for state-changing inventory actions
