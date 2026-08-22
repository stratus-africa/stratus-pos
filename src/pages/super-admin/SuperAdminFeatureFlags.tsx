import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flag, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function SuperAdminFeatureFlags(){
 const [flags,setFlags]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [newKey,setNewKey]=useState(''); const [newLabel,setNewLabel]=useState('');
 const load=async()=>{const {data,error}=await (supabase as any).from('platform_feature_flags').select('*').order('label'); if(error) toast.error(error.message); setFlags(data||[]); setLoading(false);};
 useEffect(()=>{void load();},[]);
 const toggle=async(flag:any,enabled:boolean)=>{const {error}=await (supabase as any).from('platform_feature_flags').update({enabled,updated_at:new Date().toISOString()}).eq('id',flag.id); if(error){toast.error(error.message);return;} setFlags(f=>f.map(x=>x.id===flag.id?{...x,enabled}:x)); toast.success(`${flag.label} ${enabled?'enabled':'disabled'}`);};
 const add=async()=>{if(!newKey.trim()||!newLabel.trim())return; const {data,error}=await (supabase as any).from('platform_feature_flags').insert({key:newKey.trim().toLowerCase().replace(/\s+/g,'_'),label:newLabel.trim(),enabled:false}).select().single(); if(error){toast.error(error.message);return;} setFlags(f=>[...f,data]);setNewKey('');setNewLabel('');toast.success('Feature flag created');};
 return <div className="space-y-6"><div><h1 className="text-2xl font-bold tracking-tight">Feature Flags</h1><p className="text-sm text-muted-foreground mt-1">Control platform capabilities independently from subscription plans.</p></div>
 <Card className="p-4"><div className="flex gap-2 flex-wrap"><Input placeholder="flag_key" value={newKey} onChange={e=>setNewKey(e.target.value)} className="max-w-xs"/><Input placeholder="Feature label" value={newLabel} onChange={e=>setNewLabel(e.target.value)} className="max-w-xs"/><Button onClick={add}><Plus className="h-4 w-4 mr-2"/>Add flag</Button></div></Card>
 <div className="grid gap-4">{loading?<Card className="p-8 text-center text-muted-foreground">Loading feature flags…</Card>:flags.map(flag=><Card key={flag.id} className="p-5"><div className="flex items-center justify-between gap-4"><div className="flex items-start gap-3"><div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><Flag className="h-4 w-4 text-primary"/></div><div><div className="flex items-center gap-2"><h3 className="font-semibold">{flag.label}</h3><Badge variant="outline">{flag.key}</Badge></div><p className="text-sm text-muted-foreground mt-1">{flag.description||'No description provided.'}</p><div className="text-xs text-muted-foreground mt-2">Rollout {flag.rollout_percent}% · {flag.environment}</div></div></div><Switch checked={flag.enabled} onCheckedChange={v=>void toggle(flag,v)} /></div></Card>)}</div></div>;
}
