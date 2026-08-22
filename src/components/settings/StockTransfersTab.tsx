import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { usePermissions } from "@/hooks/usePermissions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type TransferStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "dispatched"
  | "received"
  | "cancelled";

interface Location {
  id: string;
  business_id: string;
  name: string;
  type?: string;
  address?: string | null;
  is_active: boolean;
}

interface Transfer {
  id: string;
  business_id: string;
  transfer_number?: string | null;
  reference?: string | null;
  source_location_id: string;
  destination_location_id: string;
  status: TransferStatus;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  requested_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  dispatched_at?: string | null;
  received_at?: string | null;
  cancelled_at?: string | null;
  requested_by?: string | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  dispatched_by?: string | null;
  received_by?: string | null;
  cancelled_by?: string | null;
  rejection_reason?: string | null;
  source_location?: {
    id: string;
    name: string;
  } | null;
  destination_location?: {
    id: string;
    name: string;
  } | null;
}

interface TransferLine {
  id?: string;
  transfer_id?: string;
  product_id: string;
  quantity: number;
  notes?: string | null;
  product?: {
    id: string;
    name: string;
    sku?: string | null;
  } | null;
}

interface Product {
  id: string;
  name: string;
  sku?: string | null;
  is_active?: boolean;
}

interface NewTransferLine {
  product_id: string;
  quantity: string;
}

interface NewTransferForm {
  source_location_id: string;
  destination_location_id: string;
  reference: string;
  notes: string;
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

const STATUS_VARIANTS: Record<
  TransferStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  pending: "outline",
  approved: "default",
  rejected: "destructive",
  dispatched: "default",
  received: "default",
  cancelled: "destructive",
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortId(id?: string | null) {
  if (!id) return "—";
  return id.slice(0, 8);
}

function getStatusIcon(status: TransferStatus) {
  switch (status) {
    case "pending":
      return Clock3;

    case "approved":
      return CheckCircle2;

    case "rejected":
      return XCircle;

    case "dispatched":
      return Truck;

    case "received":
      return Check;

    case "cancelled":
      return XCircle;

    default:
      return Clock3;
  }
}

export default function StockTransfersTab() {
  const { business, locations, currentLocation } =
    useBusiness();

  const { hasPermission } = usePermissions();

  const canView =
    hasPermission("multi_location.view") ||
    hasPermission("multi_location.transfer_stock") ||
    hasPermission("multi_location.approve_transfers") ||
    hasPermission("inventory.view");

  const canCreate =
    hasPermission("multi_location.transfer_stock") ||
    hasPermission("inventory.transfer");

  const canApprove =
    hasPermission("multi_location.approve_transfers") ||
    hasPermission("inventory.approve_transfer");

  const canReceive =
    hasPermission("multi_location.transfer_stock") ||
    hasPermission("inventory.receive");

  const activeLocations = useMemo(
    () =>
      (locations as Location[]).filter(
        (location) => location.is_active,
      ),
    [locations],
  );

  const [transfers, setTransfers] = useState<Transfer[]>(
    [],
  );

  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);

  const [productsLoading, setProductsLoading] =
    useState(false);

  const [saving, setSaving] = useState(false);

  const [selectedTransfer, setSelectedTransfer] =
    useState<Transfer | null>(null);

  const [selectedLines, setSelectedLines] = useState<
    TransferLine[]
  >([]);

  const [detailOpen, setDetailOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);

  const [rejectionReason, setRejectionReason] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<string>("all");

  const [search, setSearch] = useState("");

  const [form, setForm] = useState<NewTransferForm>({
    source_location_id:
      currentLocation?.id || "",
    destination_location_id: "",
    reference: "",
    notes: "",
  });

  const [newLines, setNewLines] = useState<
    NewTransferLine[]
  >([
    {
      product_id: "",
      quantity: "",
    },
  ]);

  const loadTransfers = useCallback(async () => {
    if (!business?.id) {
      setTransfers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      /*
       * Keep this query deliberately untyped. This prevents
       * generated Supabase Database types from breaking the
       * settings page when the migration has been added but
       * generated types have not yet been regenerated.
       */
      const { data, error } = await (supabase as any)
        .from("stock_transfers")
        .select(
          `
            *,
            source_location:locations!stock_transfers_source_location_id_fkey(
              id,
              name
            ),
            destination_location:locations!stock_transfers_destination_location_id_fkey(
              id,
              name
            )
          `,
        )
        .eq("business_id", business.id)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setTransfers((data || []) as Transfer[]);
    } catch (error: any) {
      /*
       * If the transfer migration has not been applied yet,
       * don't crash the entire Settings page.
       */
      console.error(
        "Unable to load stock transfers:",
        error,
      );

      toast.error(
        error?.message ||
          "Unable to load stock transfers.",
      );

      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  const loadProducts = useCallback(async () => {
    if (!business?.id) {
      setProducts([]);
      return;
    }

    setProductsLoading(true);

    try {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, sku, is_active")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name", {
          ascending: true,
        })
        .limit(1000);

      if (error) {
        throw error;
      }

      setProducts((data || []) as Product[]);
    } catch (error: any) {
      console.error(
        "Unable to load products:",
        error,
      );

      toast.error(
        error?.message ||
          "Unable to load products.",
      );
    } finally {
      setProductsLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    if (createOpen) {
      void loadProducts();
    }
  }, [createOpen, loadProducts]);

  useEffect(() => {
    if (!currentLocation?.id) return;

    setForm((current) => {
      if (current.source_location_id) {
        return current;
      }

      return {
        ...current,
        source_location_id:
          currentLocation.id,
      };
    });
  }, [currentLocation?.id]);

  const filteredTransfers = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return transfers.filter((transfer) => {
      if (
        statusFilter !== "all" &&
        transfer.status !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        transfer.transfer_number,
        transfer.reference,
        transfer.source_location?.name,
        transfer.destination_location?.name,
        transfer.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [
    transfers,
    search,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: transfers.length,

      pending: transfers.filter(
        (transfer) =>
          transfer.status === "pending",
      ).length,

      approved: transfers.filter(
        (transfer) =>
          transfer.status === "approved",
      ).length,

      dispatched: transfers.filter(
        (transfer) =>
          transfer.status === "dispatched",
      ).length,

      received: transfers.filter(
        (transfer) =>
          transfer.status === "received",
      ).length,
    };
  }, [transfers]);

  const resetCreateForm = () => {
    setForm({
      source_location_id:
        currentLocation?.id || "",
      destination_location_id: "",
      reference: "",
      notes: "",
    });

    setNewLines([
      {
        product_id: "",
        quantity: "",
      },
    ]);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const updateLine = (
    index: number,
    field: keyof NewTransferLine,
    value: string,
  ) => {
    setNewLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
            }
          : line,
      ),
    );
  };

  const addLine = () => {
    setNewLines((current) => [
      ...current,
      {
        product_id: "",
        quantity: "",
      },
    ]);
  };

  const removeLine = (index: number) => {
    setNewLines((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter(
        (_, lineIndex) =>
          lineIndex !== index,
      );
    });
  };

  const createTransfer = async () => {
    if (!business?.id) {
      toast.error("Business not found.");
      return;
    }

    if (!canCreate) {
      toast.error(
        "You do not have permission to create stock transfers.",
      );
      return;
    }

    if (
      !form.source_location_id ||
      !form.destination_location_id
    ) {
      toast.error(
        "Select both the source and destination locations.",
      );
      return;
    }

    if (
      form.source_location_id ===
      form.destination_location_id
    ) {
      toast.error(
        "Source and destination locations must be different.",
      );
      return;
    }

    const validLines = newLines
      .map((line) => ({
        product_id: line.product_id,
        quantity: Number(line.quantity),
      }))
      .filter(
        (line) =>
          line.product_id &&
          Number.isFinite(line.quantity) &&
          line.quantity > 0,
      );

    if (validLines.length === 0) {
      toast.error(
        "Add at least one product with a quantity greater than zero.",
      );
      return;
    }

    setSaving(true);

    try {
      /*
       * Creation is done through an RPC so the database can
       * validate stock, permissions and transfer state
       * atomically.
       *
       * The RPC is intentionally called through `any` so this
       * file compiles even before Supabase generated types
       * contain the new function.
       */
      const { data, error } = await (supabase as any).rpc(
        "create_stock_transfer",
        {
          p_business_id: business.id,
          p_source_location_id:
            form.source_location_id,
          p_destination_location_id:
            form.destination_location_id,
          p_reference:
            form.reference.trim() || null,
          p_notes:
            form.notes.trim() || null,
          p_lines: validLines,
        },
      );

      if (error) {
        throw error;
      }

      const created =
        Array.isArray(data) ? data[0] : data;

      setCreateOpen(false);

      resetCreateForm();

      await loadTransfers();

      toast.success(
        created?.transfer_number
          ? `Transfer ${created.transfer_number} created.`
          : "Stock transfer created.",
      );
    } catch (error: any) {
      console.error(
        "Unable to create stock transfer:",
        error,
      );

      toast.error(
        error?.message ||
          "Unable to create stock transfer.",
      );
    } finally {
      setSaving(false);
    }
  };

  const loadTransferDetails = async (
    transfer: Transfer,
  ) => {
    setSelectedTransfer(transfer);
    setDetailOpen(true);
    setSelectedLines([]);

    try {
      const { data, error } = await (supabase as any)
        .from("stock_transfer_items")
        .select(
          `
            *,
            product:products(
              id,
              name,
              sku
            )
          `,
        )
        .eq("transfer_id", transfer.id)
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      setSelectedLines(
        (data || []) as TransferLine[],
      );
    } catch (error: any) {
      console.error(
        "Unable to load transfer lines:",
        error,
      );

      toast.error(
        error?.message ||
          "Unable to load transfer details.",
      );
    }
  };

  const changeTransferStatus = async (
    transfer: Transfer,
    action:
      | "approve"
      | "reject"
      | "dispatch"
      | "receive"
      | "cancel",
    reason?: string,
  ) => {
    if (!business?.id) {
      toast.error("Business not found.");
      return;
    }

    if (
      action === "approve" &&
      !canApprove
    ) {
      toast.error(
        "You do not have permission to approve transfers.",
      );
      return;
    }

    if (
      (action === "dispatch" ||
        action === "receive") &&
      !canReceive
    ) {
      toast.error(
        "You do not have permission to process this transfer.",
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await (supabase as any).rpc(
        "update_stock_transfer_status",
        {
          p_transfer_id: transfer.id,
          p_action: action,
          p_rejection_reason:
            action === "reject"
              ? reason?.trim() || null
              : null,
        },
      );

      if (error) {
        throw error;
      }

      if (selectedTransfer?.id === transfer.id) {
        setDetailOpen(false);
        setSelectedTransfer(null);
      }

      setRejectOpen(false);
      setRejectionReason("");

      await loadTransfers();

      const messages: Record<
        typeof action,
        string
      > = {
        approve: "Transfer approved.",
        reject: "Transfer rejected.",
        dispatch: "Transfer dispatched.",
        receive: "Transfer received.",
        cancel: "Transfer cancelled.",
      };

      toast.success(messages[action]);
    } catch (error: any) {
      console.error(
        `Unable to ${action} transfer:`,
        error,
      );

      toast.error(
        error?.message ||
          `Unable to ${action} transfer.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const openReject = (
    transfer: Transfer,
  ) => {
    setSelectedTransfer(transfer);
    setRejectionReason("");
    setRejectOpen(true);
  };

  const canApproveTransfer = (
    transfer: Transfer,
  ) => {
    return (
      canApprove &&
      transfer.status === "pending"
    );
  };

  const canDispatchTransfer = (
    transfer: Transfer,
  ) => {
    return (
      canReceive &&
      transfer.status === "approved"
    );
  };

  const canReceiveTransfer = (
    transfer: Transfer,
  ) => {
    return (
      canReceive &&
      transfer.status === "dispatched"
    );
  };

  const canCancelTransfer = (
    transfer: Transfer,
  ) => {
    return (
      canCreate &&
      ["draft", "pending"].includes(
        transfer.status,
      )
    );
  };

  const renderStatus = (
    status: TransferStatus,
  ) => {
    const Icon = getStatusIcon(status);

    return (
      <Badge
        variant={STATUS_VARIANTS[status]}
        className="gap-1"
      >
        <Icon className="h-3.5 w-3.5" />

        {STATUS_LABELS[status]}
      </Badge>
    );
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
            You don't have permission to view stock
            transfers.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Stock Transfers
              </CardTitle>

              <CardDescription>
                Request, approve, dispatch and receive
                inventory between business locations.
              </CardDescription>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void loadTransfers()
                }
                disabled={loading}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${
                    loading
                      ? "animate-spin"
                      : ""
                  }`}
                />

                Refresh
              </Button>

              {canCreate && (
                <Button
                  size="sm"
                  onClick={openCreate}
                  disabled={
                    activeLocations.length < 2
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Transfer
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {activeLocations.length < 2 && (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Add at least two active locations before
              creating an inter-location transfer.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Total
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {stats.total}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Pending
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {stats.pending}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Approved
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {stats.approved}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Dispatched
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {stats.dispatched}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Received
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {stats.received}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search transfer number, reference or location..."
              className="md:max-w-md"
            />

            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="md:w-[220px]">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  All statuses
                </SelectItem>

                {(
                  Object.keys(
                    STATUS_LABELS,
                  ) as TransferStatus[]
                ).map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                  >
                    {STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer Requests</CardTitle>

          <CardDescription>
            Every transfer moves through a controlled
            approval workflow.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    Transfer
                  </TableHead>

                  <TableHead>
                    From
                  </TableHead>

                  <TableHead>
                    To
                  </TableHead>

                  <TableHead>
                    Status
                  </TableHead>

                  <TableHead>
                    Created
                  </TableHead>

                  <TableHead className="w-[230px]" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center"
                    >
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />

                      <p className="mt-2 text-sm text-muted-foreground">
                        Loading transfers...
                      </p>
                    </TableCell>
                  </TableRow>
                ) : filteredTransfers.length ===
                  0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No stock transfers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransfers.map(
                    (transfer) => (
                      <TableRow
                        key={transfer.id}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {transfer.transfer_number ||
                                `TR-${shortId(
                                  transfer.id,
                                )}`}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {transfer.reference ||
                                "No reference"}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          {transfer
                            .source_location
                            ?.name ||
                            "—"}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />

                            {transfer
                              .destination_location
                              ?.name ||
                              "—"}
                          </div>
                        </TableCell>

                        <TableCell>
                          {renderStatus(
                            transfer.status,
                          )}
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(
                            transfer.created_at,
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void loadTransferDetails(
                                  transfer,
                                )
                              }
                            >
                              <Eye className="mr-1.5 h-4 w-4" />
                              View
                            </Button>

                            {canApproveTransfer(
                              transfer,
                            ) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    void changeTransferStatus(
                                      transfer,
                                      "approve",
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <Check className="mr-1.5 h-4 w-4" />
                                  Approve
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    openReject(
                                      transfer,
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <X className="mr-1.5 h-4 w-4" />
                                  Reject
                                </Button>
                              </>
                            )}

                            {canDispatchTransfer(
                              transfer,
                            ) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void changeTransferStatus(
                                    transfer,
                                    "dispatch",
                                  )
                                }
                                disabled={saving}
                              >
                                <Send className="mr-1.5 h-4 w-4" />
                                Dispatch
                              </Button>
                            )}

                            {canReceiveTransfer(
                              transfer,
                            ) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void changeTransferStatus(
                                    transfer,
                                    "receive",
                                  )
                                }
                                disabled={saving}
                              >
                                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                Receive
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setCreateOpen(open);

            if (!open) {
              resetCreateForm();
            }
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Create Stock Transfer
            </DialogTitle>

            <DialogDescription>
              Request inventory to be moved from one
              location to another.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  From Location
                </Label>

                <Select
                  value={
                    form.source_location_id
                  }
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      source_location_id:
                        value,
                    }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>

                  <SelectContent>
                    {activeLocations.map(
                      (location) => (
                        <SelectItem
                          key={location.id}
                          value={location.id}
                        >
                          {location.name}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  To Location
                </Label>

                <Select
                  value={
                    form.destination_location_id
                  }
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      destination_location_id:
                        value,
                    }))
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>

                  <SelectContent>
                    {activeLocations
                      .filter(
                        (location) =>
                          location.id !==
                          form.source_location_id,
                      )
                      .map(
                        (location) => (
                          <SelectItem
                            key={
                              location.id
                            }
                            value={
                              location.id
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

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Reference
                </Label>

                <Input
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reference:
                        event.target.value,
                    }))
                  }
                  placeholder="Optional transfer reference"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Notes
                </Label>

                <Input
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes:
                        event.target.value,
                    }))
                  }
                  placeholder="Optional notes"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">
                    Products
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    Add the products and quantities to
                    transfer.
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addLine}
                  disabled={saving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </div>

              <div className="space-y-2">
                {newLines.map(
                  (line, index) => (
                    <div
                      key={index}
                      className="grid gap-2 md:grid-cols-[1fr_150px_auto]"
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
                            "product_id",
                            value,
                          )
                        }
                        disabled={
                          saving ||
                          productsLoading
                        }
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              productsLoading
                                ? "Loading products..."
                                : "Select product"
                            }
                          />
                        </SelectTrigger>

                        <SelectContent>
                          {products.map(
                            (product) => (
                              <SelectItem
                                key={
                                  product.id
                                }
                                value={
                                  product.id
                                }
                              >
                                <span>
                                  {
                                    product.name
                                  }

                                  {product.sku
                                    ? ` · ${product.sku}`
                                    : ""}
                                </span>
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={
                          line.quantity
                        }
                        onChange={(
                          event,
                        ) =>
                          updateLine(
                            index,
                            "quantity",
                            event.target
                              .value,
                          )
                        }
                        placeholder="Quantity"
                        disabled={
                          saving
                        }
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          removeLine(
                            index,
                          )
                        }
                        disabled={
                          saving ||
                          newLines.length ===
                            1
                        }
                        aria-label="Remove product"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />

                <span>
                  The transfer will enter{" "}
                  <strong>
                    Pending Approval
                  </strong>{" "}
                  after creation.
                </span>
              </div>
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
              disabled={
                saving ||
                activeLocations.length < 2
              }
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Create Transfer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedTransfer?.transfer_number ||
                `Transfer ${shortId(
                  selectedTransfer?.id,
                )}`}
            </DialogTitle>

            <DialogDescription>
              {selectedTransfer
                ? `${selectedTransfer.source_location?.name || "Unknown"} → ${selectedTransfer.destination_location?.name || "Unknown"}`
                : "Transfer details"}
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    Status
                  </p>

                  <div className="mt-2">
                    {renderStatus(
                      selectedTransfer.status,
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    Created
                  </p>

                  <p className="mt-2 text-sm font-medium">
                    {formatDate(
                      selectedTransfer.created_at,
                    )}
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    Reference
                  </p>

                  <p className="mt-2 text-sm font-medium">
                    {selectedTransfer.reference ||
                      "—"}
                  </p>
                </div>
              </div>

              {selectedTransfer.notes && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium">
                    Notes
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedTransfer.notes}
                  </p>
                </div>
              )}

              {selectedTransfer.rejection_reason && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">
                    Rejection Reason
                  </p>

                  <p className="mt-1 text-sm">
                    {
                      selectedTransfer.rejection_reason
                    }
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-3 font-medium">
                  Transfer Lines
                </h3>

                <div className="overflow-x-auto rounded-lg border">
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
                      {selectedLines.length ===
                      0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="py-8 text-center text-muted-foreground"
                          >
                            No transfer lines found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedLines.map(
                          (line, index) => (
                            <TableRow
                              key={
                                line.id ||
                                `${line.product_id}-${index}`
                              }
                            >
                              <TableCell className="font-medium">
                                {line.product
                                  ?.name ||
                                  line.product_id}
                              </TableCell>

                              <TableCell className="text-muted-foreground">
                                {line.product
                                  ?.sku ||
                                  "—"}
                              </TableCell>

                              <TableCell className="text-right font-medium">
                                {Number(
                                  line.quantity,
                                ).toLocaleString(
                                  "en-KE",
                                )}
                              </TableCell>
                            </TableRow>
                          ),
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {canApproveTransfer(
                  selectedTransfer,
                ) && (
                  <>
                    <Button
                      onClick={() =>
                        void changeTransferStatus(
                          selectedTransfer,
                          "approve",
                        )
                      }
                      disabled={saving}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>

                    <Button
                      variant="destructive"
                      onClick={() =>
                        openReject(
                          selectedTransfer,
                        )
                      }
                      disabled={saving}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </>
                )}

                {canDispatchTransfer(
                  selectedTransfer,
                ) && (
                  <Button
                    onClick={() =>
                      void changeTransferStatus(
                        selectedTransfer,
                        "dispatch",
                      )
                    }
                    disabled={saving}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Dispatch
                  </Button>
                )}

                {canReceiveTransfer(
                  selectedTransfer,
                ) && (
                  <Button
                    onClick={() =>
                      void changeTransferStatus(
                        selectedTransfer,
                        "receive",
                      )
                    }
                    disabled={saving}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Receive
                  </Button>
                )}

                {canCancelTransfer(
                  selectedTransfer,
                ) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void changeTransferStatus(
                        selectedTransfer,
                        "cancel",
                      )
                    }
                    disabled={saving}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDetailOpen(false)
              }
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setRejectOpen(open);

            if (!open) {
              setRejectionReason("");
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Reject Stock Transfer
            </DialogTitle>

            <DialogDescription>
              Provide a reason so the transfer requester
              knows why it was rejected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>
              Rejection Reason
            </Label>

            <Textarea
              value={rejectionReason}
              onChange={(event) =>
                setRejectionReason(
                  event.target.value,
                )
              }
              placeholder="Enter the reason for rejecting this transfer..."
              disabled={saving}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRejectOpen(false)
              }
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              onClick={() => {
                if (
                  !rejectionReason.trim()
                ) {
                  toast.error(
                    "Enter a rejection reason.",
                  );
                  return;
                }

                if (!selectedTransfer) {
                  return;
                }

                void changeTransferStatus(
                  selectedTransfer,
                  "reject",
                  rejectionReason,
                );
              }}
              disabled={
                saving ||
                !rejectionReason.trim()
              }
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Reject Transfer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
