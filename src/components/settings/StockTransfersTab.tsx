import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

interface Transfer {
  id: string;
  transfer_number: string;
  source_location_id: string;
  destination_location_id: string;
  status: string;
  notes: string | null;
  requested_by: string | null;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  dispatched_by: string | null;
  dispatched_at: string | null;
  received_by: string | null;
  received_at: string | null;
  created_at: string;
}

interface TransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  products?: {
    name?: string;
    sku?: string | null;
  } | null;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  is_active: boolean;
}

interface TransferLineDraft {
  product_id: string;
  quantity: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  in_transit: "In Transit",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusVariant(status: string) {
  switch (status) {
    case "completed":
      return "default" as const;

    case "rejected":
    case "cancelled":
      return "destructive" as const;

    case "pending_approval":
      return "secondary" as const;

    default:
      return "outline" as const;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return CheckCircle2;

    case "pending_approval":
      return Clock3;

    case "in_transit":
      return Send;

    case "rejected":
    case "cancelled":
      return XCircle;

    default:
      return ArrowRightLeft;
  }
}

export default function StockTransfersTab() {
  const {
    business,
    locations,
    currentLocation,
  } = useBusiness();

  const { hasPermission } = usePermissions();

  const canCreate =
    hasPermission(
      "multi_location.transfer_stock",
    );

  const canApprove =
    hasPermission(
      "multi_location.approve_transfers",
    );

  const canView =
    hasPermission("multi_location.view") ||
    canCreate ||
    canApprove;

  const [transfers, setTransfers] =
    useState<Transfer[]>([]);

  const [items, setItems] =
    useState<Record<string, TransferItem[]>>({});

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [createOpen, setCreateOpen] =
    useState(false);

  const [detailsOpen, setDetailsOpen] =
    useState(false);

  const [selectedTransfer, setSelectedTransfer] =
    useState<Transfer | null>(null);

  const [sourceLocationId, setSourceLocationId] =
    useState(currentLocation?.id || "");

  const [destinationLocationId, setDestinationLocationId] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [lines, setLines] =
    useState<TransferLineDraft[]>([
      {
        product_id: "",
        quantity: "",
      },
    ]);

  const [saving, setSaving] =
    useState(false);

  const [rejectOpen, setRejectOpen] =
    useState(false);

  const [rejectionReason, setRejectionReason] =
    useState("");

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const activeLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.is_active,
      ),
    [locations],
  );

  const locationName = (
    id: string,
  ) =>
    locations.find(
      (location) => location.id === id,
    )?.name || "Unknown location";

  const loadProducts = async () => {
    if (!business) return;

    const { data, error } =
      await supabase
        .from("products")
        .select("id, name, sku, is_active")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");

    if (error) {
      toast.error(
        error.message ||
          "Unable to load products",
      );
      return;
    }

    setProducts(
      (data || []) as Product[],
    );
  };

  const loadTransfers = async () => {
    if (!business) return;

    setLoading(true);

    try {
      const { data, error } =
        await supabase
          .from("stock_transfers")
          .select("*")
          .eq(
            "business_id",
            business.id,
          )
          .order(
            "created_at",
            {
              ascending: false,
            },
          )
          .limit(200);

      if (error) throw error;

      setTransfers(
        (data || []) as Transfer[],
      );

      const transferIds =
        (data || []).map(
          (row: any) => row.id,
        );

      if (transferIds.length > 0) {
        const { data: itemRows, error: itemError } =
          await supabase
            .from("stock_transfer_items")
            .select(
              "id, transfer_id, product_id, quantity, products(name, sku)",
            )
            .in(
              "transfer_id",
              transferIds,
            );

        if (itemError) throw itemError;

        const grouped: Record<
          string,
          TransferItem[]
        > = {};

        for (const item of
          (itemRows || []) as any[]) {
          if (!grouped[item.transfer_id]) {
            grouped[item.transfer_id] = [];
          }

          grouped[item.transfer_id].push(
            item as TransferItem,
          );
        }

        setItems(grouped);
      } else {
        setItems({});
      }
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to load stock transfers",
      );
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        loadTransfers(),
        loadProducts(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!business) return;

    void refresh();

    const channel = supabase
      .channel(
        `stock-transfers-${business.id}-${crypto.randomUUID()}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_transfers",
          filter: `business_id=eq.${business.id}`,
        },
        () => {
          void loadTransfers();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(
        channel,
      );
    };
  }, [business?.id]);

  useEffect(() => {
    if (
      currentLocation?.id &&
      !sourceLocationId
    ) {
      setSourceLocationId(
        currentLocation.id,
      );
    }
  }, [
    currentLocation?.id,
    sourceLocationId,
  ]);

  const resetCreateForm = () => {
    setSourceLocationId(
      currentLocation?.id ||
        activeLocations[0]?.id ||
        "",
    );

    setDestinationLocationId("");

    setNotes("");

    setLines([
      {
        product_id: "",
        quantity: "",
      },
    ]);
  };

  const addLine = () => {
    setLines((current) => [
      ...current,
      {
        product_id: "",
        quantity: "",
      },
    ]);
  };

  const removeLine = (
    index: number,
  ) => {
    setLines((current) =>
      current.length === 1
        ? current
        : current.filter(
            (_, i) => i !== index,
          ),
    );
  };

  const updateLine = (
    index: number,
    patch: Partial<TransferLineDraft>,
  ) => {
    setLines((current) =>
      current.map((line, i) =>
        i === index
          ? {
              ...line,
              ...patch,
            }
          : line,
      ),
    );
  };

  const createTransfer = async () => {
    if (!business) return;

    if (!canCreate) {
      toast.error(
        "You do not have permission to create stock transfers",
      );
      return;
    }

    if (
      !sourceLocationId ||
      !destinationLocationId
    ) {
      toast.error(
        "Select both source and destination locations",
      );
      return;
    }

    if (
      sourceLocationId ===
      destinationLocationId
    ) {
      toast.error(
        "Source and destination must be different",
      );
      return;
    }

    const normalizedItems = lines
      .map((line) => ({
        product_id: line.product_id,
        quantity: Number(
          line.quantity,
        ),
      }))
      .filter(
        (line) =>
          line.product_id &&
          Number.isFinite(
            line.quantity,
          ) &&
          line.quantity > 0,
      );

    if (
      normalizedItems.length === 0
    ) {
      toast.error(
        "Add at least one product with a valid quantity",
      );
      return;
    }

    const productIds =
      normalizedItems.map(
        (item) => item.product_id,
      );

    if (
      new Set(productIds).size !==
      productIds.length
    ) {
      toast.error(
        "Each product can only appear once in a transfer",
      );
      return;
    }

    setSaving(true);

    try {
      const { data, error } =
        await (supabase as any).rpc(
          "create_stock_transfer",
          {
            _business_id:
              business.id,
            _source_location_id:
              sourceLocationId,
            _destination_location_id:
              destinationLocationId,
            _items: normalizedItems,
            _notes:
              notes.trim() || null,
          },
        );

      if (error) throw error;

      toast.success(
        `Transfer ${data?.transfer_number || ""} submitted for approval`,
      );

      setCreateOpen(false);
      resetCreateForm();

      await loadTransfers();
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to create stock transfer",
      );
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    action:
      | "approve_stock_transfer"
      | "dispatch_stock_transfer"
      | "receive_stock_transfer"
      | "cancel_stock_transfer",
    transferId: string,
    successMessage: string,
  ) => {
    setProcessingId(transferId);

    try {
      const { error } =
        await (supabase as any).rpc(
          action,
          {
            _transfer_id:
              transferId,
          },
        );

      if (error) throw error;

      toast.success(successMessage);

      await loadTransfers();
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to update transfer",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const rejectTransfer = async () => {
    if (!selectedTransfer) return;

    if (
      rejectionReason.trim().length < 2
    ) {
      toast.error(
        "Enter a rejection reason",
      );
      return;
    }

    setProcessingId(
      selectedTransfer.id,
    );

    try {
      const { error } =
        await (supabase as any).rpc(
          "reject_stock_transfer",
          {
            _transfer_id:
              selectedTransfer.id,
            _reason:
              rejectionReason.trim(),
          },
        );

      if (error) throw error;

      toast.success(
        "Stock transfer rejected",
      );

      setRejectOpen(false);
      setRejectionReason("");

      await loadTransfers();
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to reject transfer",
      );
    } finally {
      setProcessingId(null);
    }
  };

  const openDetails = (
    transfer: Transfer,
  ) => {
    setSelectedTransfer(
      transfer,
    );
    setDetailsOpen(true);
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ArrowRightLeft className="mx-auto h-10 w-10 text-muted-foreground" />

          <h3 className="mt-4 font-semibold">
            Stock Transfers
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Your role does not have access to
            inter-location transfers.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pendingCount =
    transfers.filter(
      (t) =>
        t.status ===
        "pending_approval",
    ).length;

  const inTransitCount =
    transfers.filter(
      (t) =>
        t.status ===
        "in_transit",
    ).length;

  const completedCount =
    transfers.filter(
      (t) =>
        t.status ===
        "completed",
    ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />

            <h2 className="text-xl font-semibold">
              Stock Transfers
            </h2>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Move inventory between stores and
            warehouses using an approval-controlled
            workflow.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void refresh()
            }
            disabled={refreshing}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </Button>

          {canCreate && (
            <Button
              size="sm"
              onClick={() => {
                resetCreateForm();
                setCreateOpen(true);
              }}
              disabled={
                activeLocations.length < 2
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Transfer
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Pending Approval
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {pendingCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              In Transit
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {inTransitCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Completed
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {completedCount}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Total Transfers
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {transfers.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {activeLocations.length < 2 && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Create at least two active locations before
            creating an inter-location transfer.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transfer Queue</CardTitle>

          <CardDescription>
            All inter-location inventory movements for
            this business.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading transfers...
            </div>
          ) : transfers.length === 0 ? (
            <div className="py-10 text-center">
              <ArrowRightLeft className="mx-auto h-9 w-9 text-muted-foreground" />

              <p className="mt-3 font-medium">
                No stock transfers yet
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Create a transfer when inventory needs to
                move between locations.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Transfer #
                    </TableHead>

                    <TableHead>
                      Route
                    </TableHead>

                    <TableHead>
                      Items
                    </TableHead>

                    <TableHead>
                      Status
                    </TableHead>

                    <TableHead>
                      Requested
                    </TableHead>

                    <TableHead className="w-[260px]" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {transfers.map(
                    (transfer) => {
                      const Icon =
                        statusIcon(
                          transfer.status,
                        );

                      const transferItems =
                        items[
                          transfer.id
                        ] || [];

                      return (
                        <TableRow
                          key={
                            transfer.id
                          }
                        >
                          <TableCell>
                            <button
                              className="font-medium hover:underline"
                              onClick={() =>
                                openDetails(
                                  transfer,
                                )
                              }
                            >
                              {
                                transfer.transfer_number
                              }
                            </button>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <span>
                                {locationName(
                                  transfer.source_location_id,
                                )}
                              </span>

                              <ArrowRight className="h-4 w-4 text-muted-foreground" />

                              <span>
                                {locationName(
                                  transfer.destination_location_id,
                                )}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            {transferItems.length}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant={statusVariant(
                                transfer.status,
                              )}
                            >
                              <Icon className="mr-1 h-3.5 w-3.5" />

                              {
                                STATUS_LABELS[
                                  transfer.status
                                ] ||
                                transfer.status
                              }
                            </Badge>
                          </TableCell>

                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(
                              transfer.requested_at,
                            ).toLocaleDateString(
                              "en-KE",
                              {
                                day: "2-digit",
                                month:
                                  "short",
                                year:
                                  "numeric",
                              },
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {transfer.status ===
                                "pending_approval" &&
                                canApprove && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        processingId ===
                                        transfer.id
                                      }
                                      onClick={() =>
                                        void runAction(
                                          "approve_stock_transfer",
                                          transfer.id,
                                          "Transfer approved",
                                        )
                                      }
                                    >
                                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                      Approve
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={
                                        processingId ===
                                        transfer.id
                                      }
                                      onClick={() => {
                                        setSelectedTransfer(
                                          transfer,
                                        );
                                        setRejectOpen(
                                          true,
                                        );
                                      }}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}

                              {transfer.status ===
                                "approved" &&
                                canCreate && (
                                  <Button
                                    size="sm"
                                    disabled={
                                      processingId ===
                                      transfer.id
                                    }
                                    onClick={() =>
                                      void runAction(
                                        "dispatch_stock_transfer",
                                        transfer.id,
                                        "Transfer dispatched",
                                      )
                                    }
                                  >
                                    <Send className="mr-1 h-3.5 w-3.5" />
                                    Dispatch
                                  </Button>
                                )}

                              {transfer.status ===
                                "in_transit" &&
                                canCreate && (
                                  <Button
                                    size="sm"
                                    disabled={
                                      processingId ===
                                      transfer.id
                                    }
                                    onClick={() =>
                                      void runAction(
                                        "receive_stock_transfer",
                                        transfer.id,
                                        "Transfer received and completed",
                                      )
                                    }
                                  >
                                    <PackageCheck className="mr-1 h-3.5 w-3.5" />
                                    Receive
                                  </Button>
                                )}

                              {(
                                transfer.status ===
                                  "pending_approval" ||
                                transfer.status ===
                                  "approved"
                              ) &&
                                canCreate && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={
                                      processingId ===
                                      transfer.id
                                    }
                                    onClick={() =>
                                      void runAction(
                                        "cancel_stock_transfer",
                                        transfer.id,
                                        "Transfer cancelled",
                                      )
                                    }
                                  >
                                    Cancel
                                  </Button>
                                )}

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  openDetails(
                                    transfer,
                                  )
                                }
                              >
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    },
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              New Stock Transfer
            </DialogTitle>

            <DialogDescription>
              Create a transfer request. Inventory will
              not change until the transfer is dispatched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Source Location
                </Label>

                <Select
                  value={
                    sourceLocationId
                  }
                  onValueChange={
                    setSourceLocationId
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>

                  <SelectContent>
                    {activeLocations.map(
                      (location) => (
                        <SelectItem
                          key={
                            location.id
                          }
                          value={
                            location.id
                          }
                          disabled={
                            location.id ===
                            destinationLocationId
                          }
                        >
                          {
                            location.name
                          }
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Destination Location
                </Label>

                <Select
                  value={
                    destinationLocationId
                  }
                  onValueChange={
                    setDestinationLocationId
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>

                  <SelectContent>
                    {activeLocations.map(
                      (location) => (
                        <SelectItem
                          key={
                            location.id
                          }
                          value={
                            location.id
                          }
                          disabled={
                            location.id ===
                            sourceLocationId
                          }
                        >
                          {
                            location.name
                          }
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>
                    Transfer Items
                  </Label>

                  <p className="text-xs text-muted-foreground">
                    Select each product once and enter the
                    quantity to move.
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addLine}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              {lines.map(
                (line, index) => (
                  <div
                    key={index}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
                  >
                    <Select
                      value={
                        line.product_id
                      }
                      onValueChange={(
                        value,
                      ) =>
                        updateLine(
                          index,
                          {
                            product_id:
                              value,
                          },
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>

                      <SelectContent>
                        {products
                          .filter(
                            (product) =>
                              !lines.some(
                                (
                                  existing,
                                  existingIndex,
                                ) =>
                                  existingIndex !==
                                    index &&
                                  existing.product_id ===
                                    product.id,
                              ),
                          )
                          .map(
                            (
                              product,
                            ) => (
                              <SelectItem
                                key={
                                  product.id
                                }
                                value={
                                  product.id
                                }
                              >
                                {product.name}
                                {product.sku
                                  ? ` — ${product.sku}`
                                  : ""}
                              </SelectItem>
                            ),
                          )}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      min="0.0001"
                      step="any"
                      value={
                        line.quantity
                      }
                      onChange={(
                        event,
                      ) =>
                        updateLine(
                          index,
                          {
                            quantity:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                      placeholder="Quantity"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        removeLine(
                          index,
                        )
                      }
                      disabled={
                        lines.length ===
                        1
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ),
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Notes
              </Label>

              <Textarea
                value={notes}
                onChange={(event) =>
                  setNotes(
                    event.target
                      .value,
                  )
                }
                placeholder="Optional transfer notes..."
              />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <strong>
                Approval required
              </strong>

              <p className="mt-1 text-muted-foreground">
                The transfer will enter Pending Approval.
                A user with the Approve Stock Transfers
                permission must approve it before it can
                be dispatched.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setCreateOpen(false)
              }
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              onClick={() =>
                void createTransfer()
              }
              disabled={saving}
            >
              {saving
                ? "Submitting..."
                : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onOpenChange={
          setDetailsOpen
        }
      >
        <DialogContent className="sm:max-w-2xl">
          {selectedTransfer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5" />

                  {
                    selectedTransfer.transfer_number
                  }
                </DialogTitle>

                <DialogDescription>
                  {
                    locationName(
                      selectedTransfer.source_location_id,
                    )
                  }

                  {" → "}

                  {
                    locationName(
                      selectedTransfer.destination_location_id,
                    )
                  }
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={statusVariant(
                      selectedTransfer.status,
                    )}
                  >
                    {
                      STATUS_LABELS[
                        selectedTransfer
                          .status
                      ]
                    }
                  </Badge>

                  <span className="text-sm text-muted-foreground">
                    {new Date(
                      selectedTransfer.requested_at,
                    ).toLocaleString(
                      "en-KE",
                    )}
                  </span>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          Product
                        </TableHead>

                        <TableHead>
                          SKU
                        </TableHead>

                        <TableHead className="text-right">
                          Quantity
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {(
                        items[
                          selectedTransfer
                            .id
                        ] || []
                      ).map(
                        (item) => (
                          <TableRow
                            key={
                              item.id
                            }
                          >
                            <TableCell className="font-medium">
                              {
                                item
                                  .products
                                  ?.name
                              }
                            </TableCell>

                            <TableCell className="text-muted-foreground">
                              {
                                item
                                  .products
                                  ?.sku
                              }
                            </TableCell>

                            <TableCell className="text-right">
                              {
                                item.quantity
                              }
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                </div>

                {selectedTransfer.notes && (
                  <div>
                    <Label>
                      Notes
                    </Label>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {
                        selectedTransfer.notes
                      }
                    </p>
                  </div>
                )}

                {selectedTransfer.rejection_reason && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium">
                      Rejection Reason
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {
                        selectedTransfer.rejection_reason
                      }
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Requested
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {selectedTransfer.requested_at
                        ? new Date(
                            selectedTransfer.requested_at,
                          ).toLocaleString(
                            "en-KE",
                          )
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Dispatched
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {selectedTransfer.dispatched_at
                        ? new Date(
                            selectedTransfer.dispatched_at,
                          ).toLocaleString(
                            "en-KE",
                          )
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">
                      Received
                    </p>

                    <p className="mt-1 text-sm font-medium">
                      {selectedTransfer.received_at
                        ? new Date(
                            selectedTransfer.received_at,
                          ).toLocaleString(
                            "en-KE",
                          )
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setDetailsOpen(
                      false,
                    )
                  }
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={
          setRejectOpen
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject Stock Transfer
            </DialogTitle>

            <DialogDescription>
              Explain why this transfer request is being
              rejected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>
              Rejection Reason
            </Label>

            <Textarea
              value={
                rejectionReason
              }
              onChange={(event) =>
                setRejectionReason(
                  event.target
                    .value,
                )
              }
              placeholder="Reason for rejecting this transfer..."
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRejectOpen(
                  false,
                )
              }
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              onClick={() =>
                void rejectTransfer()
              }
              disabled={
                !rejectionReason.trim() ||
                processingId ===
                  selectedTransfer?.id
              }
            >
              Reject Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
