import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer } from "lucide-react";
import { useRef } from "react";
import { format } from "date-fns";
import { CartItem, PaymentEntry } from "@/hooks/usePOS";

interface ReceiptData {
  invoiceNumber: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payments: PaymentEntry[];
  totalPaid: number;
  change: number;
  customerName: string | null;
  locationName: string;
  businessName: string;
  date: Date;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptData | null;
}

export default function ReceiptDialog({ open, onOpenChange, data }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=300,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; }
        @media print { body { margin: 0; } }
      </style></head><body>
      ${content.innerHTML}
      <script>window.print();window.close();</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        <div ref={receiptRef} className="text-xs font-mono space-y-2 p-2">
          <div className="text-center">
            <p className="font-bold text-sm">{data.businessName}</p>
            <p>{data.locationName}</p>
            <p>{format(data.date, "PPp")}</p>
          </div>

          <div className="line border-t border-dashed border-foreground/30 my-2" />

          <p>Invoice: {data.invoiceNumber}</p>
          {data.customerName && <p>Customer: {data.customerName}</p>}

          <div className="line border-t border-dashed border-foreground/30 my-2" />

          <table className="w-full">
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.product.name}</td>
                  <td className="text-right whitespace-nowrap">{item.quantity} x {Number(item.unit_price).toLocaleString()}</td>
                  <td className="text-right whitespace-nowrap">{(item.quantity * item.unit_price - item.discount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="line border-t border-dashed border-foreground/30 my-2" />

          <div className="flex justify-between"><span>Subtotal</span><span>{data.subtotal.toLocaleString()}</span></div>
          {data.tax > 0 && <div className="flex justify-between"><span>VAT</span><span>{data.tax.toLocaleString()}</span></div>}
          {data.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{data.discount.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>KES {data.total.toLocaleString()}</span></div>

          <div className="line border-t border-dashed border-foreground/30 my-2" />

          {data.payments.map((p, i) => (
            <div key={i} className="flex justify-between capitalize">
              <span>{p.method}{p.reference ? ` (${p.reference})` : ""}</span>
              <span>{p.amount.toLocaleString()}</span>
            </div>
          ))}
          {data.change > 0 && <div className="flex justify-between font-bold"><span>Change</span><span>KES {data.change.toLocaleString()}</span></div>}

          <div className="line border-t border-dashed border-foreground/30 my-2" />
          <p className="text-center">Thank you for shopping with us!</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
