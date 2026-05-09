import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Printer, Download } from "lucide-react";
import { format } from "date-fns";
import type { POSSession } from "@/hooks/usePOSSession";
import { useBusiness } from "@/contexts/BusinessContext";

interface ZReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: POSSession[];
  onLoadSessions: () => Promise<POSSession[]>;
}

export default function ZReportDialog({ open, onOpenChange, sessions: initialSessions, onLoadSessions }: ZReportDialogProps) {
  const { business, currentLocation } = useBusiness();
  const [sessions, setSessions] = useState<POSSession[]>(initialSessions);
  const [selectedId, setSelectedId] = useState<string>("");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      onLoadSessions().then((data) => {
        const closed = data.filter((s) => s.status === "closed");
        setSessions(closed);
        if (closed.length > 0 && !selectedId) {
          setSelectedId(closed[0].id);
        }
      });
    }
  }, [open]);

  const session = sessions.find((s) => s.id === selectedId);

  const handlePrint = () => {
    if (!reportRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Z Report</title>
      <style>
        body { font-family: monospace; max-width: 380px; margin: 0 auto; padding: 20px; font-size: 13px; }
        .header { text-align: center; margin-bottom: 16px; }
        .header h1 { font-size: 18px; margin: 0; }
        .header p { margin: 2px 0; color: #666; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .section { margin: 12px 0; }
        .section-title { font-weight: bold; border-bottom: 1px dashed #ccc; padding-bottom: 4px; margin-bottom: 6px; }
        .total-row { font-weight: bold; font-size: 15px; border-top: 2px solid #000; padding-top: 6px; margin-top: 6px; }
        .variance-pos { color: green; }
        .variance-neg { color: red; }
        hr { border: none; border-top: 1px dashed #ccc; margin: 8px 0; }
      </style>
      </head><body>${reportRef.current.innerHTML}
      <script>window.print();window.close();<\/script></body></html>
    `);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Z Report
          </DialogTitle>
          <DialogDescription>End-of-day summary report for closed sessions.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a session..." />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {format(new Date(s.opened_at), "MMM dd, yyyy HH:mm")} — {format(new Date(s.closed_at!), "HH:mm")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {session && (
            <Button variant="outline" size="icon" onClick={handlePrint} title="Print Z Report">
              <Printer className="h-4 w-4" />
            </Button>
          )}
        </div>

        {!session ? (
          <div className="text-center py-12 text-muted-foreground">
            {sessions.length === 0 ? "No closed sessions found" : "Select a session to view the report"}
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <div ref={reportRef} className="space-y-4 p-1">
              {/* Header */}
              <div className="header text-center">
                <h1 className="text-lg font-bold">{business?.name}</h1>
                <p className="text-sm text-muted-foreground">{currentLocation?.name}</p>
                <p className="text-xs text-muted-foreground">Z Report — {format(new Date(session.opened_at), "MMMM dd, yyyy")}</p>
              </div>

              <Separator />

              {/* Session Info */}
              <div className="section space-y-1 text-sm">
                <p className="section-title font-semibold text-xs uppercase text-muted-foreground">Session Details</p>
                <div className="row flex justify-between"><span>Opened</span><span>{format(new Date(session.opened_at), "HH:mm:ss")}</span></div>
                <div className="row flex justify-between"><span>Closed</span><span>{format(new Date(session.closed_at!), "HH:mm:ss")}</span></div>
              </div>

              <Separator />

              {/* Sales Summary */}
              <div className="section space-y-1 text-sm">
                <p className="section-title font-semibold text-xs uppercase text-muted-foreground">Sales Summary</p>
                <div className="row flex justify-between"><span>Total Transactions</span><span className="font-medium">{session.total_transactions}</span></div>
                <div className="row flex justify-between font-bold text-base">
                  <span>Total Sales</span>
                  <span>KES {Number(session.total_sales).toLocaleString()}</span>
                </div>
              </div>

              <Separator />

              {/* Payment Breakdown */}
              <div className="section space-y-1 text-sm">
                <p className="section-title font-semibold text-xs uppercase text-muted-foreground">Payment Breakdown</p>
                <div className="row flex justify-between"><span>Cash</span><span>KES {Number(session.payments_cash).toLocaleString()}</span></div>
                <div className="row flex justify-between"><span>M-Pesa</span><span>KES {Number(session.payments_mpesa).toLocaleString()}</span></div>
                <div className="row flex justify-between"><span>Card</span><span>KES {Number(session.payments_card).toLocaleString()}</span></div>
                {Number(session.payments_other) > 0 && (
                  <div className="row flex justify-between"><span>Other</span><span>KES {Number(session.payments_other).toLocaleString()}</span></div>
                )}
              </div>

              <Separator />

              {/* Cash Reconciliation */}
              <div className="section space-y-1 text-sm">
                <p className="section-title font-semibold text-xs uppercase text-muted-foreground">Cash Reconciliation</p>
                <div className="row flex justify-between"><span>Opening Float</span><span>KES {Number(session.opening_float).toLocaleString()}</span></div>
                <div className="row flex justify-between"><span>Cash Sales</span><span>KES {Number(session.payments_cash).toLocaleString()}</span></div>
                <div className="row flex justify-between font-medium border-t pt-1 mt-1">
                  <span>Expected Cash</span>
                  <span>KES {Number(session.expected_cash).toLocaleString()}</span>
                </div>
                <div className="row flex justify-between font-medium">
                  <span>Actual Cash</span>
                  <span>KES {Number(session.closing_cash).toLocaleString()}</span>
                </div>
                <div className="row flex justify-between font-bold text-base border-t pt-1 mt-1">
                  <span>Variance</span>
                  <span className={Number(session.cash_difference) >= 0 ? "text-emerald-600" : "text-destructive"}>
                    {Number(session.cash_difference) >= 0 ? "+" : ""}KES {Number(session.cash_difference).toLocaleString()}
                  </span>
                </div>
              </div>

              {session.notes && (
                <>
                  <Separator />
                  <div className="section text-sm">
                    <p className="section-title font-semibold text-xs uppercase text-muted-foreground">Notes</p>
                    <p className="text-muted-foreground">{session.notes}</p>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
