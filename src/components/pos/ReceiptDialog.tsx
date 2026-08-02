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

    // Self-contained print CSS: reproduces the on-screen receipt design without
    // depending on the app's stylesheets (which load async inside the iframe and
    // rely on theme CSS variables that don't apply to printed output).
    const pageCss = `
      @page { size: ${cfg.paper === "a4" ? "A4" : `${width} auto`}; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #receipt-print-root {
        width: ${width};
        max-width: ${width};
        margin: 0 auto;
        padding: 3mm;
        background: #fff;
        color: #000;
        font-family: ${cfg.fontFamily};
        font-size: ${cfg.fontSize}px;
        line-height: 1.45;
      }
      #receipt-print-root * { color: #000; }
      #receipt-print-root p { margin: 0; }
      #receipt-print-root .space-y-2 > * + * { margin-top: 8px; }
      #receipt-print-root .space-y-1 > * + * { margin-top: 4px; }
      #receipt-print-root .space-y-0\\.5 > * + * { margin-top: 2px; }
      #receipt-print-root .text-center { text-align: center; }
      #receipt-print-root .text-right { text-align: right; }
      #receipt-print-root .font-bold { font-weight: 700; }
      #receipt-print-root .font-semibold { font-weight: 600; }
      #receipt-print-root .italic { font-style: italic; }
      #receipt-print-root .capitalize { text-transform: capitalize; }
      #receipt-print-root .whitespace-pre-wrap { white-space: pre-wrap; }
      #receipt-print-root .whitespace-nowrap { white-space: nowrap; }
      #receipt-print-root .break-all { word-break: break-all; }
      #receipt-print-root .break-words { overflow-wrap: break-word; }
      #receipt-print-root .flex { display: flex; }
      #receipt-print-root .justify-between { justify-content: space-between; }
      #receipt-print-root .justify-center { justify-content: center; }
      #receipt-print-root .w-full { width: 100%; }
      #receipt-print-root table { width: 100%; border-collapse: collapse; }
      #receipt-print-root td { vertical-align: top; padding: 0; }
      #receipt-print-root .text-\\[10px\\] { font-size: 10px; }
      #receipt-print-root .text-sm { font-size: ${cfg.fontSize + 1}px; }
      #receipt-print-root .pt-2 { padding-top: 8px; }
      #receipt-print-root .my-2 { margin-top: 8px; margin-bottom: 8px; }
      #receipt-print-root .mb-1 { margin-bottom: 4px; }
      #receipt-print-root .mx-auto { margin-left: auto; margin-right: auto; }
      #receipt-print-root .line { border: 0; border-top: 1px dashed #000; height: 0; }
      #receipt-print-root .text-muted-foreground { color: #444; }
      #receipt-print-root img { display: block; max-height: 60px; max-width: 100%; object-fit: contain; }
      #receipt-print-root svg { display: block; margin: 0 auto; }
    `;

    const clone = content.cloneNode(true) as HTMLDivElement;
    clone.id = "receipt-print-root";
    clone.removeAttribute("style");

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><title>Receipt</title><style>${pageCss}</style></head><body>${clone.outerHTML}</body></html>`,
    );
    doc.close();

    const run = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => iframe.remove(), 1000);
      }
    };

    // Wait for images (logo) to decode before printing.
    const imgs = Array.from(doc.images || []);
    const pending = imgs.filter((im) => !im.complete);
    if (pending.length === 0) {
      setTimeout(run, 150);
    } else {
      let done = 0;
      const next = () => { if (++done >= pending.length) setTimeout(run, 100); };
      pending.forEach((im) => { im.addEventListener("load", next); im.addEventListener("error", next); });
      setTimeout(run, 2000);
    }
  };



  printFnRef.current = handlePrint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{reprint ? "Reprint Receipt" : "Receipt"}</DialogTitle>
        </DialogHeader>

        <div
          ref={receiptRef}
          className="space-y-2 p-2"
          style={{ fontFamily: cfg.fontFamily, fontSize: `${cfg.fontSize}px`, lineHeight: 1.45, width, maxWidth: "100%", margin: "0 auto" }}
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

          {(cfg.showServedBy || cfg.showPrintedAt) && (
            <div className="text-center text-[10px] text-muted-foreground pt-2 space-y-0.5">
              {cfg.showServedBy && data.servedBy && <p>Served by: {data.servedBy}</p>}
              {cfg.showPrintedAt && <p>Printed: {format(new Date(), "PPp")}</p>}
            </div>
          )}

          {cfg.qrCodePosition === "footer" && qrBlock}


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
