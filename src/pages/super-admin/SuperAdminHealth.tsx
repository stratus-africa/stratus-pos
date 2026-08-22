import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Database, CreditCard, Mail, Webhook, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Check = { name: string; icon: any; status: 'healthy'|'warning'|'error'; detail: string };

export default function SuperAdminHealth() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failedEvents, setFailedEvents] = useState<any[]>([]);
  const run = async () => {
    setRefreshing(true);
    const started = Date.now();
    const [db, subs, events, flags] = await Promise.all([
      supabase.from('businesses').select('id', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('id,status').limit(1),
      (supabase as any).from('integration_events').select('*').eq('status','failed').order('created_at',{ascending:false}).limit(10),
      (supabase as any).from('platform_feature_flags').select('id',{count:'exact',head:true}),
    ]);
    const dbOk = !db.error;
    const subOk = !subs.error;
    const eventRows = events.data || [];
    setFailedEvents(eventRows);
    setChecks([
      { name:'Database', icon:Database, status:dbOk?'healthy':'error', detail:dbOk?`Responding in ${Date.now()-started}ms`:(db.error?.message||'Database query failed') },
      { name:'Subscriptions', icon:CreditCard, status:subOk?'healthy':'error', detail:subOk?'Subscription data accessible':'Subscription query failed' },
      { name:'Webhooks & Integrations', icon:Webhook, status:eventRows.length?'warning':'healthy', detail:eventRows.length?`${eventRows.length} recent failed events`:'No recent failed integration events' },
      { name:'Feature Flags', icon:Activity, status:flags.error?'error':'healthy', detail:flags.error?'Feature flag store unavailable':`${flags.count||0} flags configured` },
      { name:'Tenant Access', icon:Users, status:dbOk?'healthy':'error', detail:dbOk?'Tenant records accessible':'Tenant query failed' },
      { name:'Email', icon:Mail, status:'warning', detail:'No provider health endpoint configured' },
    ]);
    setLoading(false); setRefreshing(false);
  };
  useEffect(()=>{ void run(); },[]);
  const icon = (status: Check['status']) => status==='healthy'?<CheckCircle2 className="h-4 w-4 text-emerald-600"/>:status==='warning'?<AlertTriangle className="h-4 w-4 text-amber-600"/>:<XCircle className="h-4 w-4 text-destructive"/>;
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Platform Health</h1><p className="text-sm text-muted-foreground mt-1">Operational status across core platform services and integrations.</p></div><Button variant="outline" onClick={()=>void run()} disabled={refreshing}><RefreshCw className={`h-4 w-4 mr-2 ${refreshing?'animate-spin':''}`}/>Refresh</Button></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(loading?Array.from({length:6}):checks).map((c:any,i:number)=><Card key={i} className="p-5 border-border/70"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><c.icon className="h-4 w-4"/></div><div><div className="font-medium">{loading?'Checking…':c.name}</div><div className="text-xs text-muted-foreground mt-0.5">{loading?'Running health check':c.detail}</div></div></div>{!loading&&icon(c.status)}</div></Card>)}</div>
    <Card className="overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold">Recent integration failures</h2><p className="text-xs text-muted-foreground mt-1">Events recorded by webhooks and external integrations.</p></div>{failedEvents.length===0?<div className="p-8 text-center text-sm text-muted-foreground">No recent failures recorded.</div>:<div className="divide-y">{failedEvents.map(e=><div key={e.id} className="p-4 flex items-center justify-between gap-4"><div><div className="font-medium">{e.provider}{e.event_type?` · ${e.event_type}`:''}</div><div className="text-xs text-muted-foreground mt-1">{e.error_message||'Integration failure'} · {formatDistanceToNow(new Date(e.created_at),{addSuffix:true})}</div></div><Badge variant="destructive">Failed</Badge></div>)}</div>}</Card>
  </div>;
}
