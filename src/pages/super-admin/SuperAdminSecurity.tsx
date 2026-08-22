import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServerFn } from '@tanstack/react-start';
import { revokeUserSessions, createPrivilegedRequest, decidePrivilegedRequest } from '@/lib/superAdminSecurity.functions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Smartphone, Monitor, LogOut, KeyRound, AlertTriangle, CheckCircle2, Clock3, XCircle, RefreshCw, Fingerprint } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function SuperAdminSecurity() {
  const { user } = useAuth();
  const revoke = useServerFn(revokeUserSessions);
  const createRequest = useServerFn(createPrivilegedRequest);
  const decide = useServerFn(decidePrivilegedRequest);
  const [factors, setFactors] = useState<any[]>([]);
  const [aal, setAal] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enroll, setEnroll] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [requestDialog, setRequestDialog] = useState(false);
  const [actionKey, setActionKey] = useState('delete_tenant');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [factorRes, aalRes, sessionRes, requestRes, auditRes] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.from('security_sessions').select('*').order('last_seen_at', { ascending: false }).limit(25),
      supabase.from('privileged_action_requests').select('*').order('requested_at', { ascending: false }).limit(50),
      supabase.from('audit_logs').select('id,action,entity_type,entity_id,description,risk_level,approval_id,ip_address,user_agent,created_at,metadata').order('created_at', { ascending: false }).limit(50),
    ]);
    setFactors([...(factorRes.data?.totp || []), ...(factorRes.data?.phone || [])]);
    setAal(aalRes.data);
    setSessions(sessionRes.data || []);
    setRequests(requestRes.data || []);
    setAudit(auditRes.data || []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const sessionId = data.session?.access_token ? data.session.access_token.slice(-32) : null;
      if (sessionId) {
        await supabase.rpc('register_security_session', { _session_id: sessionId, _user_agent: navigator.userAgent });
      }
    })();
  }, []);

  const currentSessionId = useMemo(() => aal?.currentAuthenticationMethods?.[0]?.id || null, [aal]);
  const verified = aal?.currentLevel === 'aal2';
  const activeTotp = factors.find((f) => f.factor_type === 'totp' && f.status === 'verified');

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'StratusPOS Super Admin' });
      if (error) throw error;
      setEnroll(data);
      setOtp('');
    } catch (e: any) { toast.error(e.message || 'Could not start MFA enrollment'); }
    finally { setBusy(false); }
  };
  const verifyEnroll = async () => {
    if (!enroll?.id || otp.length < 6) return;
    setBusy(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (cErr) throw cErr;
      const { error } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: challenge.id, code: otp });
      if (error) throw error;
      toast.success('MFA enabled'); setEnroll(null); setOtp(''); await load();
    } catch (e: any) { toast.error(e.message || 'Invalid verification code'); }
    finally { setBusy(false); }
  };
  const removeMfa = async () => {
    if (!activeTotp) return;
    setBusy(true);
    try { const { error } = await supabase.auth.mfa.unenroll({ factorId: activeTotp.id }); if (error) throw error; toast.success('MFA factor removed'); await load(); }
    catch (e: any) { toast.error(e.message || 'Could not remove MFA'); }
    finally { setBusy(false); }
  };
  const revokeAll = async (userId: string) => {
    if (!confirm('Revoke every active session for this user? They will need to sign in again.')) return;
    setBusy(true); try { await revoke({ data: { userId } }); toast.success('All sessions revoked'); await load(); } catch (e: any) { toast.error(e.message || 'Could not revoke sessions'); } finally { setBusy(false); }
  };
  const submitRequest = async () => {
    if (!verified) { toast.error('Step-up authentication required (AAL2)'); return; }
    if (reason.trim().length < 8) { toast.error('Provide a reason of at least 8 characters'); return; }
    setBusy(true);
    try { await createRequest({ data: { actionKey, targetType: 'tenant', targetId: targetId || null, reason, riskLevel: 'critical' } }); toast.success('Privileged action submitted for approval'); setRequestDialog(false); setReason(''); setTargetId(''); await load(); }
    catch (e: any) { toast.error(e.message || 'Could not create request'); }
    finally { setBusy(false); }
  };
  const decideRequest = async (id: string, decision: 'approved'|'rejected') => {
    if (!verified) { toast.error('Step-up authentication required (AAL2)'); return; }
    setBusy(true); try { await decide({ data: { requestId: id, decision, reason: `Decision by ${user?.email || 'Super Admin'}` } }); toast.success(`Request ${decision}`); await load(); } catch (e: any) { toast.error(e.message || 'Could not update request'); } finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-primary" /></div><div><h1 className="text-2xl font-bold tracking-tight">Security Center</h1><p className="text-sm text-muted-foreground mt-1">Protect privileged access, sessions and sensitive platform operations.</p></div></div></div><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2"/>Refresh</Button></div>

    <div className="grid gap-4 md:grid-cols-4">
      <Card className="p-4"><div className="text-xs text-muted-foreground">MFA</div><div className="mt-2 flex items-center gap-2 font-semibold">{activeTotp?<><CheckCircle2 className="h-4 w-4 text-emerald-600"/>Protected</>:<><AlertTriangle className="h-4 w-4 text-amber-600"/>Not enabled</>}</div></Card>
      <Card className="p-4"><div className="text-xs text-muted-foreground">Session assurance</div><div className="mt-2 font-semibold">{verified?'AAL2 verified':'AAL1 standard'}</div></Card>
      <Card className="p-4"><div className="text-xs text-muted-foreground">Active sessions</div><div className="mt-2 font-semibold">{sessions.filter(s=>!s.revoked_at).length}</div></Card>
      <Card className="p-4"><div className="text-xs text-muted-foreground">Pending approvals</div><div className="mt-2 font-semibold">{requests.filter(r=>r.status==='pending').length}</div></Card>
    </div>

    <Tabs defaultValue="security">
      <TabsList className="grid w-full grid-cols-4 md:w-auto md:inline-grid"><TabsTrigger value="security">MFA & Step-up</TabsTrigger><TabsTrigger value="sessions">Sessions</TabsTrigger><TabsTrigger value="approvals">Approvals</TabsTrigger><TabsTrigger value="audit">Security Audit</TabsTrigger></TabsList>
      <TabsContent value="security" className="mt-5 space-y-5">
        <Card className="p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold flex items-center gap-2"><Smartphone className="h-4 w-4"/>Multi-factor authentication</h2><p className="text-sm text-muted-foreground mt-1">Use an authenticator app for privileged access and sensitive actions.</p></div><Badge variant={activeTotp?'default':'secondary'}>{activeTotp?'Enabled':'Not configured'}</Badge></div>
          {activeTotp ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4"><div><div className="font-medium">Authenticator app</div><div className="text-xs text-muted-foreground mt-1">This account has a verified TOTP factor.</div></div><Button variant="outline" onClick={()=>void removeMfa()} disabled={busy}>Remove factor</Button></div> : <div className="mt-5 rounded-xl border border-dashed p-5"><div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-primary"/><div><div className="font-medium">Add authenticator</div><div className="text-sm text-muted-foreground">Scan a QR code with Google Authenticator, Microsoft Authenticator or 1Password.</div></div></div><Button className="mt-4" onClick={()=>void startEnroll()} disabled={busy}>Set up MFA</Button></div>}
        </Card>
        <Card className="p-5"><h2 className="font-semibold">Step-up authentication</h2><p className="text-sm text-muted-foreground mt-1">Critical operations require AAL2. The approval workflow blocks privileged actions until this session is verified.</p><div className="mt-4 flex items-center gap-3 rounded-xl border p-4">{verified?<CheckCircle2 className="h-5 w-5 text-emerald-600"/>:<AlertTriangle className="h-5 w-5 text-amber-600"/>}<div><div className="font-medium">{verified?'AAL2 verified for this session':'AAL2 verification required'}</div><div className="text-xs text-muted-foreground mt-1">{activeTotp?'Use your MFA factor when prompted for a step-up challenge.':'Enable MFA to unlock step-up protected operations.'}</div></div></div></Card>
      </TabsContent>

      <TabsContent value="sessions" className="mt-5"><Card className="overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold">Session management</h2><p className="text-sm text-muted-foreground mt-1">Review recent authenticated sessions and revoke access when needed.</p></div><div className="divide-y">{sessions.map((s)=><div key={s.id} className="p-4 flex items-center justify-between gap-4"><div className="flex items-center gap-3 min-w-0"><div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Monitor className="h-4 w-4"/></div><div className="min-w-0"><div className="font-medium truncate">{s.user_id===user?.id?'Current account':'Super Admin account'}</div><div className="text-xs text-muted-foreground truncate">{s.user_agent || 'Unknown device'} · {formatDistanceToNow(new Date(s.last_seen_at),{addSuffix:true})}</div></div></div><div className="flex items-center gap-2"><Badge variant={s.revoked_at?'secondary':'outline'}>{s.revoked_at?'Revoked':'Active'}</Badge>{s.user_id!==user?.id && !s.revoked_at && <Button size="sm" variant="outline" onClick={()=>void revokeAll(s.user_id)} disabled={busy}><LogOut className="h-3.5 w-3.5 mr-1.5"/>Revoke all</Button>}</div></div>)}{!sessions.length&&<div className="p-10 text-center text-sm text-muted-foreground">No registered sessions yet.</div>}</div></Card></TabsContent>

      <TabsContent value="approvals" className="mt-5 space-y-4"><div className="flex justify-end"><Button onClick={()=>setRequestDialog(true)} disabled={!verified}><Fingerprint className="h-4 w-4 mr-2"/>Request privileged action</Button></div><Card className="overflow-hidden"><div className="divide-y">{requests.map((r)=><div key={r.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold capitalize">{r.action_key.replace(/_/g,' ')}</div><div className="text-xs text-muted-foreground mt-1">{r.reason}</div><div className="text-xs text-muted-foreground mt-1">Requested {formatDistanceToNow(new Date(r.requested_at),{addSuffix:true})} · {r.target_id||'No target'}</div></div><Badge variant={r.status==='approved'?'default':r.status==='rejected'?'destructive':'secondary'}>{r.status}</Badge></div>{r.status==='pending'&&r.requested_by!==user?.id&&<div className="mt-3 flex gap-2"><Button size="sm" onClick={()=>void decideRequest(r.id,'approved')} disabled={busy||!verified}>Approve</Button><Button size="sm" variant="outline" onClick={()=>void decideRequest(r.id,'rejected')} disabled={busy||!verified}>Reject</Button></div>}</div>)}{!requests.length&&<div className="p-10 text-center text-sm text-muted-foreground">No privileged action requests.</div>}</div></Card></TabsContent>

      <TabsContent value="audit" className="mt-5"><Card className="overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold">Enhanced security audit trail</h2><p className="text-sm text-muted-foreground mt-1">Privileged actions include risk level, approval linkage and request metadata.</p></div><div className="divide-y">{audit.map((a)=><div key={a.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{a.description || a.action}</div><div className="text-xs text-muted-foreground mt-1">{a.action} · {a.entity_type||'system'} {a.entity_id?`· ${a.entity_id}`:''}</div><div className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(a.created_at),{addSuffix:true})}{a.ip_address?` · ${a.ip_address}`:''}</div></div>{a.risk_level&&<Badge variant={a.risk_level==='critical'?'destructive':'secondary'}>{a.risk_level}</Badge>}</div></div>)}{!audit.length&&<div className="p-10 text-center text-sm text-muted-foreground">No security audit events yet.</div>}</div></Card></TabsContent>
    </Tabs>

    <Dialog open={!!enroll} onOpenChange={(open)=>!open&&setEnroll(null)}><DialogContent><DialogHeader><DialogTitle>Set up authenticator</DialogTitle><DialogDescription>Scan the QR code, then enter the six-digit code generated by your authenticator app.</DialogDescription></DialogHeader><div className="flex flex-col items-center gap-4 py-3">{enroll?.totp?.qr_code && <div className="rounded-xl border bg-white p-4"><QRCodeSVG value={enroll.totp.uri} size={190}/></div>}<div className="w-full space-y-2"><Label>Verification code</Label><Input inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" /></div><Button className="w-full" onClick={()=>void verifyEnroll()} disabled={busy||otp.length!==6}>{busy?'Verifying…':'Verify & enable MFA'}</Button></div></DialogContent></Dialog>
    <Dialog open={requestDialog} onOpenChange={setRequestDialog}><DialogContent><DialogHeader><DialogTitle>Request privileged action</DialogTitle><DialogDescription>A second Super Admin can approve critical operations. Your request will be permanently audited.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Action</Label><Select value={actionKey} onValueChange={setActionKey}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="delete_tenant">Delete tenant</SelectItem><SelectItem value="reset_tenant">Reset tenant</SelectItem><SelectItem value="grant_super_admin">Grant Super Admin</SelectItem><SelectItem value="change_billing_config">Change billing configuration</SelectItem><SelectItem value="impersonate_admin">Impersonate administrator</SelectItem></SelectContent></Select></div><div><Label>Target ID</Label><Input value={targetId} onChange={e=>setTargetId(e.target.value)} placeholder="Tenant/user UUID" /></div><div><Label>Reason</Label><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this action required?" /></div><Button className="w-full" onClick={()=>void submitRequest()} disabled={busy||!verified}>{busy?'Submitting…':'Submit for approval'}</Button></div></DialogContent></Dialog>
  </div>;
}
