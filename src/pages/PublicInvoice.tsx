import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";

type InvoiceResponse = {
  sale: any;
  business: any;
  customer: any;
  location: any;
} | null;

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-invoice`;

export default function PublicInvoice() {
  const { id = "" } = useParams();
  const [data, setData] = useState<InvoiceResponse>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?id=${encodeURIComponent(id)}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load invoice");
        setData(json);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading invoice…</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-destructive">{error || "Invoice not found"}</div>;

  const { sale, business, customer, location } = data;
  const currency = business?.currency || "KES";
  const fmt = (n: number) => `${currency} ${Number(n || 0).toLocaleString()}`;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto bg-card shadow-xs rounded-lg p-6 md:p-10 print:shadow-none print:rounded-none">
        <div className="flex items-start justify-between gap-4 pb-6 border-b">
          <div>
            {business?.logo_url && (
              <img src={business.logo_url} alt={business.name} className="h-14 mb-3 object-contain" crossOrigin="anonymous" />
            )}
            <h1 className="text-xl font-bold">{business?.name}</h1>
            {business?.address && <p className="text-sm text-muted-foreground">{business.address}</p>}
            {business?.phone && <p className="text-sm text-muted-foreground">{business.phone}</p>}
            {business?.kra_pin && <p className="text-sm text-muted-foreground">KRA PIN: {business.kra_pin}</p>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Invoice</div>
            <div className="text-lg font-bold">{sale.invoice_number}</div>
            <div className="text-sm text-muted-foreground">{format(new Date(sale.created_at), "PPp")}</div>
            <div className="mt-2 inline-block text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary uppercase">
              {sale.payment_status}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 py-6 border-b text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Billed To</div>
            <div className="font-medium">{customer?.name || "Walk-in customer"}</div>
            {customer?.phone && <div className="text-muted-foreground">{customer.phone}</div>}
            {customer?.email && <div className="text-muted-foreground">{customer.email}</div>}
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Location</div>
            <div className="font-medium">{location?.name}</div>
            {location?.address && <div className="text-muted-foreground">{location.address}</div>}
          </div>
        </div>

        <table className="w-full text-sm my-6">
          <thead className="text-xs uppercase text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2">Item</th>
              <th className="text-right py-2">Qty</th>
              <th className="text-right py-2">Price</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(sale.sale_items || []).map((i: any) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-2">
                  <div className="font-medium">{i.product_name}</div>
                  {i.product_sku && <div className="text-xs text-muted-foreground">{i.product_sku}</div>}
                </td>
                <td className="text-right py-2">{i.quantity}</td>
                <td className="text-right py-2">{fmt(i.unit_price)}</td>
                <td className="text-right py-2">{fmt(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
          {sale.tax > 0 && <div className="flex justify-between"><span>VAT</span><span>{fmt(sale.tax)}</span></div>}
          {sale.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmt(sale.discount)}</span></div>}
          <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>{fmt(sale.total)}</span></div>
        </div>

        {(sale.payments || []).length > 0 && (
          <div className="mt-6 pt-4 border-t text-sm">
            <div className="text-xs uppercase text-muted-foreground mb-2">Payments</div>
            {sale.payments.map((p: any) => (
              <div key={p.id} className="flex justify-between capitalize">
                <span>{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span>{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {sale.fiscal_reference && (
          <div className="mt-6 pt-4 border-t text-xs text-muted-foreground text-center">
            KRA Fiscal Ref: <span className="font-mono">{sale.fiscal_reference}</span>
            {sale.fiscal_verification_url && (
              <>
                {" · "}
                <a className="text-primary underline" href={sale.fiscal_verification_url} target="_blank" rel="noreferrer">Verify</a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
