import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInventory } from "@/hooks/useInventory";

const REASONS = ["Damage", "Loss", "Correction", "Return", "Other"];

interface Props {
  productId: string;
  productName: string;
  /** Location pre-selected in the parent view ("all" resolves to the active location) */
  locationId?: string | null;
}

/**
 * Quick stock adjustment + inter-location transfer actions for the item details modal.
 * Transfers are posted as a paired negative/positive adjustment so existing
 * inventory triggers, audit history and reversal logic all keep working.
 */
export default function QuickStockActions({ productId, productName, locationId }: Props) {
  const { locations, currentLocation } = useBusiness();
  const { user } = useAuth();
  const { adjustStock } = useInventory();

  const defaultLocation = (locationId && locationId !== "all" ? locationId : currentLocation?.id) || locations?.[0]?.id || "";

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const [adjLocation, setAdjLocation] = useState(defaultLocation);
  const [adjQty, setAdjQty] = useState("");
  const [adjReason, setAdjReason] = useState("Correction");
  const [adjNotes, setAdjNotes] = useState("");

  const [fromLocation, setFromLocation] = useState(defaultLocation);
  const [toLocation, setToLocation] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  const submitAdjust = () => {
    const qty = Number(adjQty);
    if (!user) return toast.error("You must be signed in");
    if (!adjLocation) return toast.error("Select a location");
    if (!qty || Number.isNaN(qty)) return toast.error("Enter a non-zero quantity change");
    adjustStock.mutate(
      {
        items: [{ product_id: productId, quantity_change: qty }],
        location_id: adjLocation,
        reason: adjReason,
        notes: adjNotes || `Quick adjustment for ${productName}`,
        created_by: user.id,
      },
      {
        onSuccess: () => {
          setAdjustOpen(false);
          setAdjQty("");
          setAdjNotes("");
        },
      },
    );
  };

  const submitTransfer = () => {
    const qty = Number(transferQty);
    if (!user) return toast.error("You must be signed in");
    if (!fromLocation || !toLocation) return toast.error("Select both locations");
    if (fromLocation === toLocation) return toast.error("Source and destination must differ");
    if (!qty || qty <= 0) return toast.error("Enter a quantity greater than zero");

    const fromName = locations?.find((l) => l.id === fromLocation)?.name || "source";
    const toName = locations?.find((l) => l.id === toLocation)?.name || "destination";
    const note = transferNotes || `Transfer ${qty} × ${productName}: ${fromName} → ${toName}`;

    adjustStock.mutate(
      {
        items: [{ product_id: productId, quantity_change: -qty }],
        location_id: fromLocation,
        reason: "Transfer out",
        notes: note,
        created_by: user.id,
      },
      {
        onSuccess: () => {
          adjustStock.mutate(
            {
              items: [{ product_id: productId, quantity_change: qty }],
              location_id: toLocation,
              reason: "Transfer in",
              notes: note,
              created_by: user.id,
            },
            {
              onSuccess: () => {
                setTransferOpen(false);
                setTransferQty("");
                setTransferNotes("");
              },
            },
          );
        },
      },
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
        <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Adjust stock
      </Button>
      <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
        <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Transfer stock
      </Button>

      {/* ADJUST */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>{productName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={adjLocation} onValueChange={setAdjLocation}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {(locations || []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity change</Label>
              <Input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} placeholder="e.g. -2 or 5" />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={adjReason} onValueChange={setAdjReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={adjustStock.isPending}>Post adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TRANSFER */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer stock</DialogTitle>
            <DialogDescription>{productName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Select value={fromLocation} onValueChange={setFromLocation}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {(locations || []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Select value={toLocation} onValueChange={setToLocation}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    {(locations || []).filter((l) => l.id !== fromLocation).map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={transferQty} onChange={(e) => setTransferQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={submitTransfer} disabled={adjustStock.isPending}>Transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
