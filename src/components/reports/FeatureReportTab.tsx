import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";

type Row = Record<string, any>;

const money = (v: any) => `KES ${Number(v || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const label = (k: string) => k.replace(/_/g," ").replace(/\b\w/g,m=>m.toUpperCase());

export default function FeatureReportTab({ title, rows, loading, onExport }: { title: string; rows: Row[]; loading?: boolean; onExport?: () => void }) {
  const [q,setQ]=useState("");
  const filtered=useMemo(()=>rows.filter(r=>!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())),[rows,q]);
  const columns=useMemo(()=>{
    const keys:string[]=[]; filtered.slice(0,100).forEach(r=>Object.keys(r||{}).forEach(k=>{ if(!keys.includes(k) && !["id","business_id","created_at","updated_at"].includes(k)) keys.push(k); }));
    return keys.slice(0,8);
  },[filtered]);
  const exportCsv=()=>{
    if(!filtered.length)return;
    const esc=(v:any)=>`"${String(v??"").replaceAll('"','""')}"`;
    const csv=[columns.map(esc).join(","),...filtered.map(r=>columns.map(c=>esc(r[c])).join(","))].join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download=`${title.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{title}</CardTitle><div className="flex-1"/><Input className="w-56" placeholder="Filter report..." value={q} onChange={e=>setQ(e.target.value)}/><Button variant="outline" size="sm" onClick={onExport||exportCsv}>Export CSV</Button></div></CardHeader><CardContent>{loading?<div className="py-10 text-center text-muted-foreground">Loading report…</div>:!filtered.length?<div className="py-10 text-center text-muted-foreground">No records for this report.</div>:<div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b">{columns.map(c=><th key={c} className="text-left p-2 whitespace-nowrap">{label(c)}</th>)}</tr></thead><tbody>{filtered.map((r,i)=><tr key={r.id||i} className="border-b last:border-0">{columns.map(c=><td key={c} className="p-2 whitespace-nowrap">{typeof r[c]==="number" && /(amount|total|price|cost|value|revenue|expense|tax|payment)/i.test(c)?money(r[c]):String(r[c]??"")}</td>)}</tr>)}</tbody></table></div>}</CardContent></Card>;
}
