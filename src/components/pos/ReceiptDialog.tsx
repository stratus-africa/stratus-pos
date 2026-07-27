import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { CartItem, PaymentEntry } from "@/hooks/usePOS";
import { useBusiness } from "@/contexts/BusinessContext";
import { loadReceiptConfig, paperWidth } from "@/lib/receiptTemplate";
import { saveLastReceipt } from "@/lib/lastReceipt";


interface ReceiptData {
  saleId?: string;
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
  servedBy?: string | null;
  date: Date;
  fiscal?: {
    fiscal_status?: string | null;
    fiscal_invoice_number?: string | null;
    fiscal_reference?: string | null;
    fiscal_qr_code?: string | null;
    fiscal_verification_url?: string | null;
    fiscal_submitted_at?: string | null;
    fiscal_error?: string | null;
  } | null;
  vatBreakdown?: { rate: number; label: string; taxable: number; vat: number }[];
  taxInclusive?: boolean;
  loyaltyDiscount?: number;
  loyalty?: {
    pointsBalance: number;
    pointsEarned: number;
    pointsRedeemed: number;
    redemptionValue: number;
  } | null;
}



interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptData | null;
  /** Marks the printout as a reprint and disables auto-print. */
  reprint?: boolean;
}

export default function ReceiptDialog({ open, onOpenChange, data, reprint = false }: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const { business } = useBusiness();
  const cfg = loadReceiptConfig(business?.id);
  const width = paperWidth(cfg.paper);
  const showLogo = cfg.showLogo && !!business?.logo_url;
  const autoPrint = ((business as { pos_auto_print_receipt?: boolean } | null)?.pos_auto_print_receipt ?? false) && !reprint;
  const printFnRef = useRef<() => void>(() => {});
  const autoPrintedFor = useRef<string | null>(null);

  // Automatically print once per sale when the business rule is enabled.
  useEffect(() => {
    const key = data?.saleId || data?.invoiceNumber || null;
    if (!open || !autoPrint || !key || autoPrintedFor.current === key) return;
    autoPrintedFor.current = key;
    const t = setTimeout(() => printFnRef.current(), 300);
    return () => clearTimeout(t);
  }, [open, autoPrint, data?.saleId, data?.invoiceNumber]);

  // Remember the most recent receipt so it can be reprinted later.
  useEffect(() => {
    if (!open || reprint || !data || !business?.id) return;
    saveLastReceipt(business.id, data);
  }, [open, reprint, data, business?.id]);

  if (!data) return null;


  const qrValue = (() => {
    if (!cfg.showQRCode) return "";
    if (cfg.qrCodeType === "fiscal_url") return data.fiscal?.fiscal_verification_url || "";
    if (cfg.qrCodeType === "custom") {
      return (cfg.qrCodeCustomValue || "")
        .replace(/\{invoice\}/g, data.invoiceNumber)
        .replace(/\{total\}/g, String(data.total))
        .replace(/\{business\}/g, data.businessName);
    }
    // invoice_url — auto-generated public invoice URL for this sale
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const ref = data.saleId || data.invoiceNumber;
    return `${origin}/invoice/${encodeURIComponent(ref)}`;
  })();

  const qrBlock = cfg.showQRCode && qrValue ? (
    <>
      <div className="line border-t border-dashed border-foreground/30 my-2" />
      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <QRCodeSVG value={qrValue} size={cfg.qrCodeSize} level="M" includeMargin={false} />
        </div>
        {cfg.qrCodeLabel && <p className="text-[10px]">{cfg.qrCodeLabel}</p>}
      </div>
    </>
  ) : null;

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=380,height=700");
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        @page { size: ${cfg.paper === "a4" ? "A4" : `${width} auto`}; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; }
        body {
          font-family: ${cfg.fontFamily};
          font-size: ${cfg.fontSize}px;
          line-height: 1.45;
          width: ${width};
          padding: 3mm;

        }
        /* utility classes mirrored from the on-screen receipt design */
        .text-center, .center { text-align: center; }
        .text-right, .right { text-align: right; }
        .font-bold, .bold { font-weight: 700; }
        .font-semibold { font-weight: 600; }
        .italic { font-style: italic; }
        .capitalize { text-transform: capitalize; }
        .break-all { word-break: break-all; }
        .break-words { overflow-wrap: anywhere; }
        .whitespace-nowrap { white-space: nowrap; }
        .whitespace-pre-wrap { white-space: pre-wrap; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .flex { display: flex; }
        .justify-between { justify-content: space-between; }
        .justify-center { justify-content: center; }
        .w-full { width: 100%; }
        .pt-2 { padding-top: 8px; }
        .my-2 { margin-top: 6px; margin-bottom: 6px; }
        .space-y-2 > * + * { margin-top: 6px; }
        .space-y-1 > * + * { margin-top: 3px; }
        .space-y-0\\.5 > * + * { margin-top: 2px; }
        .text-sm { font-size: ${cfg.fontSize + 1}px; }
        .text-xs { font-size: ${cfg.fontSize}px; }
        .text-\\[10px\\] { font-size: ${Math.max(8, cfg.fontSize - 2)}px; }
        .text-muted-foreground { color: #444; }
        .text-red-600 { color: #000; font-weight: 700; }
        p { margin: 0; }
        img { max-height: 60px; max-width: 100%; display: block; margin: 0 auto 4px; object-fit: contain; }
        svg { display: block; margin: 0 auto; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; vertical-align: top; }
      </style></head><body>
      ${content.innerHTML}
      <script>setTimeout(function(){window.print();window.close();}, 300);</script>
      </body></html>
    `);
    win.document.close();
  };

  printFnRef.current = handlePrint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
        </DialogHeader>

        <div
          ref={receiptRef}
          className="space-y-2 p-2"
          style={{ fontFamily: cfg.fontFamily, fontSize: `${cfg.fontSize}px`, lineHeight: 1.45, width: "80mm", maxWidth: "100%", margin: "0 auto" }}
        >
          <div className="text-center">
            {showLogo && (
              <img
                src={business!.logo_url!}
                alt="Logo"
                className="mx-auto max-h-16 mb-1 object-contain"
                crossOrigin="anonymous"
              />
            )}
            <p className="font-bold" style={{ fontSize: `${cfg.headerFontSize}px` }}>
              {cfg.header || data.businessName}
            </p>
            {cfg.showAddress && (business as { address?: string } | null)?.address && (
              <p>{(business as { address?: string }).address}</p>
            )}
            {cfg.showPhone && (business as { phone?: string } | null)?.phone && (
              <p>{(business as { phone?: string }).phone}</p>
            )}
            <p>{data.locationName}</p>
            <p>{format(data.date, "PPp")}</p>
          </div>


          {cfg.qrCodePosition === "header" && qrBlock}

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
          {data.tax > 0 && (
            <div className="flex justify-between">
              <span>VAT {data.taxInclusive ? "(incl.)" : "(excl.)"}</span>
              <span>{data.tax.toLocaleString()}</span>
            </div>
          )}
          {data.vatBreakdown && data.vatBreakdown.length > 0 && (
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <td>Rate</td>
                  <td className="text-right">Taxable</td>
                  <td className="text-right">VAT</td>
                </tr>
              </thead>
              <tbody>
                {data.vatBreakdown.map((v) => (
                  <tr key={v.rate}>
                    <td>{v.rate}%</td>
                    <td className="text-right">{Math.round(v.taxable).toLocaleString()}</td>
                    <td className="text-right">{Math.round(v.vat).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{data.discount.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>KES {data.total.toLocaleString()}</span></div>


          {cfg.qrCodePosition === "middle" && qrBlock}

          <div className="line border-t border-dashed border-foreground/30 my-2" />

          {data.payments.map((p, i) => (
            <div key={i} className="flex justify-between capitalize">
              <span>{p.method}{p.reference ? ` (${p.reference})` : ""}</span>
              <span>{p.amount.toLocaleString()}</span>
            </div>
          ))}
          {data.change > 0 && <div className="flex justify-between font-bold"><span>Change</span><span>KES {data.change.toLocaleString()}</span></div>}

          {data.loyalty && (data.loyalty.pointsEarned > 0 || data.loyalty.pointsRedeemed > 0 || data.loyalty.pointsBalance > 0) && (
            <>
              <div className="line border-t border-dashed border-foreground/30 my-2" />
              <div className="space-y-0.5">
                <p className="font-bold text-center">Loyalty</p>
                {data.loyalty.pointsRedeemed > 0 && (
                  <div className="flex justify-between">
                    <span>Redeemed</span>
                    <span>-{data.loyalty.pointsRedeemed.toLocaleString()} pts (KES {data.loyalty.redemptionValue.toLocaleString()})</span>
                  </div>
                )}
                {data.loyalty.pointsEarned > 0 && (
                  <div className="flex justify-between">
                    <span>Earned</span>
                    <span>+{data.loyalty.pointsEarned.toLocaleString()} pts</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Points Balance</span>
                  <span>{data.loyalty.pointsBalance.toLocaleString()} pts</span>
                </div>
              </div>
            </>
          )}

          <div className="line border-t border-dashed border-foreground/30 my-2" />
          {cfg.thankYouMessage && (
            <p className="text-center whitespace-pre-wrap">{cfg.thankYouMessage}</p>
          )}
          {cfg.footer && <p className="text-center whitespace-pre-wrap">{cfg.footer}</p>}


          {data.fiscal?.fiscal_reference && (
            <>
              <div className="line border-t border-dashed border-foreground/30 my-2" />
              <div className="text-center space-y-0.5">
                <p className="font-bold">KRA Fiscal Receipt</p>
                <p>Ref: {data.fiscal.fiscal_reference}</p>
                {data.fiscal.fiscal_invoice_number && <p>Invoice: {data.fiscal.fiscal_invoice_number}</p>}
                {data.fiscal.fiscal_verification_url && (
                  <p className="break-all text-[10px]">Verify: {data.fiscal.fiscal_verification_url}</p>
                )}
              </div>
            </>
          )}
          {data.fiscal?.fiscal_status && !data.fiscal.fiscal_reference && data.fiscal.fiscal_status !== "failed" && (
            <p className="text-center text-[10px] italic">Fiscalisation: {data.fiscal.fiscal_status}</p>
          )}
          {data.fiscal?.fiscal_status === "failed" && (
            <>
              <div className="line border-t border-dashed border-foreground/30 my-2" />
              <div className="text-center space-y-0.5">
                <p className="font-bold text-red-600">⚠ eTIMS Push Failed</p>
                {data.fiscal.fiscal_error && (
                  <p className="text-[10px] text-red-600 break-words">{data.fiscal.fiscal_error}</p>
                )}
                <p className="text-[10px] italic">Fix the issue and retry from Sales list.</p>
              </div>
            </>
          )}

          {cfg.qrCodePosition === "footer" && qrBlock}

          {(cfg.showServedBy || cfg.showPrintedAt) && (
            <div className="text-center text-[10px] text-muted-foreground pt-2 space-y-0.5">
              {cfg.showServedBy && data.servedBy && <p>Served by: {data.servedBy}</p>}
              {cfg.showPrintedAt && <p>Printed: {format(new Date(), "PPp")}</p>}
            </div>
          )}

          {reprint && <p className="text-center font-bold pt-2">*** REPRINT ***</p>}
        </div>


        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> {reprint ? "Reprint" : "Print"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
