import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Check, Plus, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface Location {
  id: string;
  business_id: string;
  name: string;
  type: string;
  address: string | null;
  is_active: boolean;
}

interface Product {
  id: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  is_active?: boolean;
}

type TransferStatus = "draft" | "pending" | "approved" | "rejected" | "dispatched" | "received" | "cancelled";

interface Transfer {
  id: string;
  business_id: string;
  source_location_id: string;
  destination_location_id: string;
  transfer_number: string | null;
  reference: string | null;
  status: TransferStatus;
  notes: string | null;
  rejection_reason: string | null;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  dispatched_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  source_location?: Location | null;
  destination_location?: Location | null;
  items?: TransferItem[];
}

interface TransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  product?: Product | null;
}

interface DraftLine {
  product_id: string;
  quantity: string;
}

const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: "Draft",
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  dispatched: "Dispatched",
  received: "Received",
  cancelled: "Cancelled",
};

const statusVariant = (status: TransferStatus): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "received") return "default";
  if (status === "rejected" || status === "cancelled") return "destructive";
  if (status === "pending" || status === "approved") return "secondary";
  return "outline";
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function StockTransfersTab() {
  const { business, locations } = useBusiness();
  const { hasPermission } = usePermissions();

  const canCreate = hasPermission("inventory.transfer") || hasPermission("multi_location.transfer_stock");
  const canApprove = hasPermission("inventory.approve_transfer") || hasPermission("multi_location.approve_transfers");
  const canReceive = hasPermission("inventory.receive");

  const activeLocations = useMemo(() => (locations || []).filter((location) => location.is_active), [locations]);

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ product_id: "", quantity: "1" }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const [actionTransfer, setActionTransfer] = useState<Transfer | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | "dispatch" | "receive" | "cancel" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [acting, setActing] = useState(false);

  const locationMap = useMemo(
    () => new Map<string, Location>(activeLocations.map((location) => [location.id, location])),
    [activeLocations],
  );

  const loadTransfers = useCallback(async () => {
    if (!business?.id) {
      setTransfers([]);
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("stock_transfers")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data || []) as Transfer[];
    const transferIds = rows.map((row) => row.id);

    let items: TransferItem[] = [];
    if (transferIds.length) {
      const { data: itemRows, error: itemError } = await (supabase as any)
        .from("stock_transfer_items")
        .select("id, transfer_id, product_id, quantity")
        .in("transfer_id", transferIds);
      if (itemError) throw itemError;
      items = (itemRows || []) as TransferItem[];
    }

    const productIds = Array.from(new Set(items.map((item) => item.product_id)));
    if (productIds.length) {
      const { data: productRows, error: productError } = await (supabase as any)
        .from("products")
        .select("id, name, barcode, sku, is_active")
        .in("id", productIds);
      if (productError) throw productError;

      const productMap = new Map<string, Product>(
        ((productRows || []) as Product[]).map((product) => [product.id, product]),
      );
      items = items.map((item) => ({ ...item, product: productMap.get(item.product_id) || null }));
    }

    const grouped = new Map<string, TransferItem[]>();
    items.forEach((item) => {
      const current = grouped.get(item.transfer_id) || [];
      current.push(item);
      grouped.set(item.transfer_id, current);
    });

    setTransfers(
      rows.map((row) => ({
        ...row,
        source_location: locationMap.get(row.source_location_id) || null,
        destination_location: locationMap.get(row.destination_location_id) || null,
        items: grouped.get(row.id) || [],
      })),
    );
  }, [business?.id, locationMap]);

  const loadProducts = useCallback(async () => {
    if (!business?.id) return;

    const { data, error } = await (supabase as any)
      .from("products")
      .select("id, name, barcode, sku, is_active")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    setProducts((data || []) as Product[]);
  }, [business?.id]);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadTransfers();
    } catch (error: any) {
      toast.error(error?.message || "Failed to load stock transfers");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadTransfers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!createOpen) return;
    void loadProducts().catch((error: any) => {
      toast.error(error?.message || "Failed to load products");
    });
  }, [createOpen, loadProducts]);

  useEffect(() => {
    if (activeLocations.length < 2) return;
    if (!sourceLocationId) setSourceLocationId(activeLocations[0].id);
    if (!destinationLocationId) {
      setDestinationLocationId(activeLocations[1].id);
    }
  }, [activeLocations, destinationLocationId, sourceLocationId]);

  const resetCreateForm = () => {
    setReference("");
    setNotes("");
    setProductSearch("");
    setDraftLines([{ product_id: "", quantity: "1" }]);
    if (activeLocations.length >= 2) {
      setSourceLocationId(activeLocations[0].id);
      setDestinationLocationId(activeLocations[1].id);
    } else {
      setSourceLocationId("");
      setDestinationLocationId("");
    }
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setDraftLines((current) =>
      current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index),
    );
  };

  const addLine = () => {
    setDraftLines((current) => [...current, { product_id: "", quantity: "1" }]);
  };

  const submitCreate = async () => {
    if (!business?.id) return;
    if (!canCreate) {
      toast.error("You do not have permission to create stock transfers");
      return;
    }
    if (!sourceLocationId || !destinationLocationId) {
      toast.error("Select both source and destination locations");
      return;
    }
    if (sourceLocationId === destinationLocationId) {
      toast.error("Source and destination locations must be different");
      return;
    }

    const cleaned = draftLines
      .map((line) => ({ product_id: line.product_id, quantity: Number(line.quantity) }))
      .filter((line) => line.product_id && Number.isFinite(line.quantity) && line.quantity > 0);

    if (!cleaned.length) {
      toast.error("Add at least one product with a quantity greater than zero");
      return;
    }

    const duplicate = new Set<string>();
    for (const line of cleaned) {
      if (duplicate.has(line.product_id)) {
        toast.error("Each product can only appear once in a transfer");
        return;
      }
      duplicate.add(line.product_id);
    }

    try {
      setCreating(true);
      const { data, error } = await (supabase as any).rpc("create_stock_transfer", {
        p_business_id: business.id,
        p_source_location_id: sourceLocationId,
        p_destination_location_id: destinationLocationId,
        p_reference: reference.trim() || null,
        p_notes: notes.trim() || null,
        p_lines: cleaned,
      });

      if (error) throw error;

      toast.success(`Transfer ${data?.transfer_number || "created"}`);
      setCreateOpen(false);
      resetCreateForm();
      await loadTransfers();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create stock transfer");
    } finally {
      setCreating(false);
    }
  };

  const performAction = async () => {
    if (!actionTransfer || !action) return;

    if (action === "approve" && !canApprove) {
      toast.error("You do not have permission to approve transfers");
      return;
    }
    if ((action === "dispatch" || action === "receive" || action === "cancel") && !canCreate && !canReceive) {
      toast.error("You do not have permission to perform this transfer action");
      return;
    }
    if (action === "receive" && !canReceive) {
      toast.error("You do not have permission to receive stock transfers");
      return;
    }
    if (action === "reject" && !canApprove) {
      toast.error("You do not have permission to reject transfers");
      return;
    }
    if (action === "reject" && !rejectionReason.trim()) {
      toast.error("Enter a rejection reason");
      return;
    }

    try {
      setActing(true);
      const { error } = await (supabase as any).rpc("update_stock_transfer_status", {
        p_transfer_id: actionTransfer.id,
        p_action: action,
        p_rejection_reason: action === "reject" ? rejectionReason.trim() : null,
      });
      if (error) throw error;

      const label = action === "approve" ? "approved" : action === "reject" ? "rejected" : `${action}ed`;
      toast.success(`Transfer ${label}`);
      setActionTransfer(null);
      setAction(null);
      setRejectionReason("");
      await loadTransfers();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} transfer`);
    } finally {
      setActing(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 100);
    return products
      .filter(
        (product) =>
          product.name.toLowerCase().includes(q) ||
          String(product.barcode || "")
            .toLowerCase()
            .includes(q) ||
          String(product.sku || "")
            .toLowerCase()
            .includes(q),
      )
      .slice(0, 100);
  }, [productSearch, products]);

  const pendingCount = transfers.filter((transfer) => transfer.status === "pending").length;
  const inTransitCount = transfers.filter((transfer) => transfer.status === "dispatched").length;

  const actionTitle = action ? `${action.charAt(0).toUpperCase()}${action.slice(1)} transfer` : "Transfer action";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Stock Transfers</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Move inventory between active business locations with approval and receiving controls.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)} disabled={activeLocations.length < 2}>
                <Plus className="mr-2 h-4 w-4" />
                New Transfer
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total Transfers</p>
              <p className="mt-1 text-2xl font-semibold">{transfers.length}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Pending Approval</p>
              <p className="mt-1 text-2xl font-semibold">{pendingCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">In Transit</p>
              <p className="mt-1 text-2xl font-semibold">{inTransitCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {activeLocations.length < 2 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Add at least two active locations before creating a stock transfer.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading transfers…
                  </TableCell>
                </TableRow>
              ) : transfers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No stock transfers yet.
                  </TableCell>
                </TableRow>
              ) : (
                transfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell>
                      <div className="font-medium">{transfer.transfer_number || transfer.id.slice(0, 8)}</div>
                      {transfer.reference && <div className="text-xs text-muted-foreground">{transfer.reference}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <span>
                          {transfer.source_location?.name || locationMap.get(transfer.source_location_id)?.name || "—"}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {transfer.destination_location?.name ||
                            locationMap.get(transfer.destination_location_id)?.name ||
                            "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {transfer.items?.length || 0} product{transfer.items?.length === 1 ? "" : "s"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(transfer.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} units
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(transfer.status)}>{STATUS_LABELS[transfer.status]}</Badge>
                      {transfer.rejection_reason && (
                        <div
                          className="mt-1 max-w-[220px] truncate text-xs text-destructive"
                          title={transfer.rejection_reason}
                        >
                          {transfer.rejection_reason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(transfer.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {transfer.status === "pending" && canApprove && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Approve"
                              onClick={() => {
                                setActionTransfer(transfer);
                                setAction("approve");
                              }}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reject"
                              onClick={() => {
                                setActionTransfer(transfer);
                                setAction("reject");
                              }}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {transfer.status === "approved" && canCreate && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActionTransfer(transfer);
                              setAction("dispatch");
                            }}
                          >
                            <ArrowUpFromLine className="mr-2 h-4 w-4" />
                            Dispatch
                          </Button>
                        )}
                        {transfer.status === "dispatched" && canReceive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActionTransfer(transfer);
                              setAction("receive");
                            }}
                          >
                            <ArrowDownToLine className="mr-2 h-4 w-4" />
                            Receive
                          </Button>
                        )}
                        {transfer.status === "pending" && canCreate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActionTransfer(transfer);
                              setAction("cancel");
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Stock Transfer</DialogTitle>
            <DialogDescription>
              Create a transfer request. Stock remains at the source until the transfer is approved and dispatched.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Source Location</Label>
                <Select value={sourceLocationId} onValueChange={setSourceLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Destination Location</Label>
                <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLocations
                      .filter((location) => location.id !== sourceLocationId)
                      .map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Optional reference"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Products</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-2 h-4 w-4" /> Add Product
                </Button>
              </div>

              <div className="rounded-md border">
                <div className="grid grid-cols-[1fr_120px_40px] gap-2 border-b bg-muted/40 p-2 text-xs font-medium text-muted-foreground">
                  <span>Product</span>
                  <span>Quantity</span>
                  <span />
                </div>
                <div className="space-y-2 p-2">
                  {draftLines.map((line, index) => (
                    <div key={`${index}-${line.product_id}`} className="grid grid-cols-[1fr_120px_40px] gap-2">
                      <Select
                        value={line.product_id}
                        onValueChange={(value) => updateLine(index, { product_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          <div className="p-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                value={productSearch}
                                onChange={(event) => setProductSearch(event.target.value)}
                                placeholder="Search products…"
                                className="pl-8"
                                onKeyDown={(event) => event.stopPropagation()}
                              />
                            </div>
                          </div>
                          {filteredProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                              {product.barcode ? ` · ${product.barcode}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(index)}
                        disabled={draftLines.length === 1}
                        title="Remove product"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={creating || activeLocations.length < 2}>
              {creating ? "Creating…" : "Create Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!actionTransfer && !!action}
        onOpenChange={(open) => {
          if (!open && !acting) {
            setActionTransfer(null);
            setAction(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {actionTransfer?.transfer_number || actionTransfer?.id.slice(0, 8)} —{" "}
              {actionTransfer?.source_location?.name ||
                locationMap.get(actionTransfer?.source_location_id || "")?.name ||
                "Source"}{" "}
              to{" "}
              {actionTransfer?.destination_location?.name ||
                locationMap.get(actionTransfer?.destination_location_id || "")?.name ||
                "Destination"}
            </DialogDescription>
          </DialogHeader>

          {action === "reject" ? (
            <div className="space-y-2 py-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Explain why this transfer is being rejected"
                rows={4}
              />
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              This action will update the transfer workflow. Inventory changes occur only when stock is dispatched or
              received.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionTransfer(null);
                setAction(null);
                setRejectionReason("");
              }}
              disabled={acting}
            >
              Cancel
            </Button>
            <Button
              variant={action === "reject" || action === "cancel" ? "destructive" : "default"}
              onClick={() => void performAction()}
              disabled={acting}
            >
              {acting ? "Processing…" : actionTitle}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StockTransfersTab;
