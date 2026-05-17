import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FeatureGate, RequireFeature } from "@/components/FeatureGate";
import InventoryReportTab from "@/components/reports/InventoryReportTab";

vi.mock("@/hooks/useSubscription", () => {
  const state: { keys: string[] } = { keys: [] };
  return {
    __setKeys: (k: string[]) => { state.keys = k; },
    useSubscription: () => ({
      isLoading: false,
      isActive: true,
      tier: "pro",
      hasFeature: () => true,
      hasFeatureKey: (k: string) => state.keys.includes(k),
      currentPackage: { id: "p1", name: "Test", max_products: 0, max_locations: 0, max_users: 0 },
      maxProducts: 0,
      maxLocations: 0,
      maxUsers: 0,
      isCanceling: false,
    }),
  };
});

import * as subMock from "@/hooks/useSubscription";

const setKeys = (keys: string[]) => (subMock as any).__setKeys(keys);

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("FeatureGate / RequireFeature", () => {
  it("blocks accounting content when feature is not in package", () => {
    setKeys([]); // no accounting
    wrap(
      <RequireFeature featureKey="accounting">
        <div>P&amp;L Statement</div>
      </RequireFeature>
    );
    expect(screen.queryByText("P&L Statement")).not.toBeInTheDocument();
    expect(screen.getByText(/Upgrade Required/i)).toBeInTheDocument();
  });

  it("renders accounting content when feature is enabled", () => {
    setKeys(["accounting"]);
    wrap(
      <RequireFeature featureKey="accounting">
        <div>P&amp;L Statement</div>
      </RequireFeature>
    );
    expect(screen.getByText("P&L Statement")).toBeInTheDocument();
  });

  it("FeatureGate fallback respects featureKey", () => {
    setKeys([]);
    wrap(
      <FeatureGate featureKey="batch_tracking" fallback={<div>blocked</div>}>
        <div>batch ui</div>
      </FeatureGate>
    );
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.queryByText("batch ui")).not.toBeInTheDocument();
  });
});

describe("Inventory report batch visibility", () => {
  const inventory = [
    {
      id: "i1",
      quantity: 5,
      low_stock_threshold: 1,
      products: { name: "Paracetamol", sku: "P1", purchase_price: 10, categories: { name: "Drug" } },
      _batches: [{ batch_number: "B1", expiry_date: "2030-01-01", quantity: 5 }],
    },
  ];

  it("shows Batches column when feature is enabled", () => {
    render(<InventoryReportTab inventory={inventory} loading={false} showBatches={true} />);
    expect(screen.getByText("Batches")).toBeInTheDocument();
    expect(screen.getByText(/B1/)).toBeInTheDocument();
  });

  it("hides Batches column when feature is disabled", () => {
    render(<InventoryReportTab inventory={inventory} loading={false} showBatches={false} />);
    expect(screen.queryByText("Batches")).not.toBeInTheDocument();
    expect(screen.queryByText(/B1/)).not.toBeInTheDocument();
  });
});
