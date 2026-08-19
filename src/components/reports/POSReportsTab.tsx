import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CreditCard, Package, Clock, Receipt, Percent } from "lucide-react";
import { formatKES } from "@/components/reports/reportUtils";
import ReportTableScroll from "@/components/reports/ReportTableScroll";

interface POSReportsTabProps { sales: any[]; loading?: boolean; }

const money = (n: number) => formatKES(Number(n || 0));

export default function POSReportsTab({ sales, loading }: POSReportsTabProps) {
  const data = useMemo(() => {
    const payment = new Map<string, { count: number; amount: number }>();
    const products = new Map<string, { qty: number; revenue: number }>();
    const hourly = new Map<number, { count: number; amount: number }>();
    const daily = new Map<string, { count: number; amount: number }>();
    const discounts: any[] = [];
    let gross = 0, discount = 0, credit = 0, paid = 0;

    sales.forEach((s: any) => {
      const total = Number(s.total || 0), disc = Number(s.discount || 0);
      gross += total + disc; discount += disc;
      if (s.payment_status === "credit" || s.payment_status === "unpaid" || s.payment_status === "partial") credit += total;
      if (s.payment_status === "paid") paid += total;
      const method = s.payment_method || s.payment_type || s.payment_status || "Other";
      const pm = payment.get(method) || { count: 0, amount: 0 }; pm.count++; pm.amount += total; payment.set(method, pm);
      const d = new Date(s.created_at); const h = d.getHours();
      const hr = hourly.get(h) || { count: 0, amount: 0 }; hr.count++; hr.amount += total; hourly.set(h, hr);
      const day = s.created_at?.slice(0,10) || "Unknown";
      const dy = daily.get(day) || { count: 0, amount: 0 }; dy.count++; dy.amount += total; daily.set(day, dy);
      (s.sale_items || []).forEach((i: any) => {
        const name = i.products?.name || i.product?.name || "Unknown product";
        const q = Number(i.quantity || 0), rev = Number(i.total ?? q * Number(i.unit_price || 0));
        const pr = products.get(name) || { qty: 0, revenue: 0 }; pr.qty += q; pr.revenue += rev; products.set(name, pr);
      });
      if (disc > 0) discounts.push({ date: day, invoice: s.invoice_number || "—", customer: s.customers?.name || "Walk-in", gross: total + disc, discount: disc, net: total });
    });
    return { gross, discount, credit, paid, payment, products, hourly, daily, discounts };
  }, [sales]);

  if (loading) return <Card><CardContent className="py-12 text-center text-muted-foreground">Loading POS reports…</CardContent></Card>;

  return <div className="space-y-4">
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[['Gross Sales', data.gross], ['Discounts', data.discount], ['Net Sales', data.gross-data.discount], ['Collected', data.paid], ['Credit Outstanding', data.credit]].map(([label,value]) => <Card key={String(label)}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold">{money(Number(value))}</p></CardContent></Card>)}
    </div>

    <div className="grid lg:grid-cols-2 gap-4">
      <Card><CardHeader><CardTitle className="text-base flex gap-2"><CreditCard className="h-4 w-4"/> Payment Methods</CardTitle></CardHeader><CardContent><ReportTableScroll><Table><TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Transactions</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{[...data.payment.entries()].map(([m,v])=><TableRow key={m}><TableCell>{m}</TableCell><TableCell>{v.count}</TableCell><TableCell className="text-right">{money(v.amount)}</TableCell></TableRow>)}</TableBody></Table></ReportTableScroll></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2"><Package className="h-4 w-4"/> Product Sales</CardTitle></CardHeader><CardContent><ReportTableScroll><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Net Sales</TableHead></TableRow></TableHeader><TableBody>{[...data.products.entries()].sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,50).map(([name,v])=><TableRow key={name}><TableCell className="max-w-[220px] truncate">{name}</TableCell><TableCell className="text-right">{v.qty}</TableCell><TableCell className="text-right">{money(v.revenue)}</TableCell></TableRow>)}</TableBody></Table></ReportTableScroll></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2"><Clock className="h-4 w-4"/> Hourly Sales</CardTitle></CardHeader><CardContent><ReportTableScroll><Table><TableHeader><TableRow><TableHead>Hour</TableHead><TableHead>Transactions</TableHead><TableHead className="text-right">Sales</TableHead></TableRow></TableHeader><TableBody>{[...data.hourly.entries()].sort((a,b)=>a[0]-b[0]).map(([h,v])=><TableRow key={h}><TableCell>{String(h).padStart(2,'0')}:00</TableCell><TableCell>{v.count}</TableCell><TableCell className="text-right">{money(v.amount)}</TableCell></TableRow>)}</TableBody></Table></ReportTableScroll></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base flex gap-2"><BarChart3 className="h-4 w-4"/> Daily Sales</CardTitle></CardHeader><CardContent><ReportTableScroll><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Transactions</TableHead><TableHead className="text-right">Net Sales</TableHead></TableRow></TableHeader><TableBody>{[...data.daily.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([d,v])=><TableRow key={d}><TableCell>{d}</TableCell><TableCell>{v.count}</TableCell><TableCell className="text-right">{money(v.amount)}</TableCell></TableRow>)}</TableBody></Table></ReportTableScroll></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="text-base flex gap-2"><Percent className="h-4 w-4"/> Discount Report</CardTitle></CardHeader><CardContent><ReportTableScroll><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Receipt</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader><TableBody>{data.discounts.map((r:any,i:number)=><TableRow key={`${r.invoice}-${i}`}><TableCell>{r.date}</TableCell><TableCell>{r.invoice}</TableCell><TableCell>{r.customer}</TableCell><TableCell className="text-right">{money(r.gross)}</TableCell><TableCell className="text-right">{money(r.discount)}</TableCell><TableCell className="text-right">{money(r.net)}</TableCell></TableRow>)}{!data.discounts.length&&<TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No discounts in this period</TableCell></TableRow>}</TableBody></Table></ReportTableScroll></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base flex gap-2"><Receipt className="h-4 w-4"/> Credit Sales</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2 mb-3"><Badge variant="secondary">Outstanding: {money(data.credit)}</Badge><Badge variant="outline">Paid: {money(data.paid)}</Badge></div><p className="text-sm text-muted-foreground">Credit totals are derived from existing credit/partial/unpaid sales and remain within the current tenant-scoped sales query.</p></CardContent></Card>
  </div>;
}
