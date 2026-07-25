import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, FileText, Printer } from "lucide-react";
import {
  useEmployees, useMyEmployee, useLeaveTypes, useLeaveRequests, usePayslips,
  useHRAccess, useLinkableUsers, type Employee, type LeaveType, type Payslip,
} from "@/hooks/useHR";
import { useBusiness } from "@/contexts/BusinessContext";

const KES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n || 0);

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const daysBetween = (a: string, b: string) => {
  if (!a || !b) return 0;
  const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
  return Math.max(0, d);
};

/* ---------------- Employees Tab ---------------- */
function EmployeeDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Employee | null }) {
  const { upsert } = useEmployees();
  const { data: users } = useLinkableUsers();
  const [form, setForm] = useState<Partial<Employee>>(editing ?? { employment_type: "full_time", status: "active", basic_salary: 0 });

  const submit = async () => {
    if (!form.full_name) return;
    await upsert.mutateAsync({ ...form, id: editing?.id });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Full Name *</Label><Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>Employee #</Label><Input value={form.employee_number ?? ""} onChange={(e) => setForm({ ...form, employee_number: e.target.value })} /></div>
          <div>
            <Label>Linked User</Label>
            <Select value={form.user_id ?? "none"} onValueChange={(v) => setForm({ ...form, user_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="No linked user" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No linked user —</SelectItem>
                {(users ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Job Title</Label><Input value={form.job_title ?? ""} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
          <div><Label>Department</Label><Input value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div>
            <Label>Employment Type</Label>
            <Select value={form.employment_type ?? "full_time"} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status ?? "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Hire Date</Label><Input type="date" value={form.hire_date ?? ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
          <div><Label>Basic Salary (KES)</Label><Input type="number" value={form.basic_salary ?? 0} onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) })} /></div>
          <div><Label>National ID</Label><Input value={form.national_id ?? ""} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
          <div><Label>KRA PIN</Label><Input value={form.kra_pin ?? ""} onChange={(e) => setForm({ ...form, kra_pin: e.target.value })} /></div>
          <div><Label>NSSF #</Label><Input value={form.nssf_no ?? ""} onChange={(e) => setForm({ ...form, nssf_no: e.target.value })} /></div>
          <div><Label>NHIF / SHIF #</Label><Input value={form.nhif_no ?? ""} onChange={(e) => setForm({ ...form, nhif_no: e.target.value })} /></div>
          <div><Label>Bank Name</Label><Input value={form.bank_name ?? ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
          <div><Label>Bank Account</Label><Input value={form.bank_account ?? ""} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesTab() {
  const { canManage } = useHRAccess();
  const { query, remove } = useEmployees();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");

  const rows = (query.data ?? []).filter((e) =>
    [e.full_name, e.employee_number, e.job_title, e.department].filter(Boolean).some((v) => v!.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Input placeholder="Search employees..." className="max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        {canManage && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add Employee</Button>}
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead>Job Title</TableHead><TableHead>Department</TableHead>
            <TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Basic Salary</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {query.isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
             : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees yet</TableCell></TableRow>
             : rows.map((e) => (
              <TableRow key={e.id} className="odd:bg-muted/30">
                <TableCell>
                  <div className="font-medium">{e.full_name}</div>
                  <div className="text-xs text-muted-foreground">{e.employee_number || e.email || ""}</div>
                </TableCell>
                <TableCell>{e.job_title || "—"}</TableCell>
                <TableCell>{e.department || "—"}</TableCell>
                <TableCell><Badge variant="secondary">{e.employment_type.replace("_", " ")}</Badge></TableCell>
                <TableCell><Badge variant={e.status === "active" ? "default" : "outline"}>{e.status}</Badge></TableCell>
                <TableCell className="text-right">{KES(e.basic_salary)}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(e); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Remove ${e.full_name}?`)) remove.mutate(e.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      {open && <EmployeeDialog open={open} onOpenChange={setOpen} editing={editing} />}
    </div>
  );
}

/* ---------------- Leave Types Manager ---------------- */
function LeaveTypesCard() {
  const { canManage } = useHRAccess();
  const { query, upsert, remove } = useLeaveTypes();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<Partial<LeaveType>>({ is_paid: true, is_active: true, days_per_year: 21 });

  const start = (t: LeaveType | null) => {
    setEditing(t);
    setForm(t ?? { is_paid: true, is_active: true, days_per_year: 21 });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Leave Types</CardTitle>
        {canManage && <Button size="sm" onClick={() => start(null)}><Plus className="h-4 w-4 mr-1" /> New</Button>}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Days/yr</TableHead><TableHead>Paid</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {(query.data ?? []).map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell className="text-right">{t.days_per_year}</TableCell>
                <TableCell>{t.is_paid ? "Yes" : "No"}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => start(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete leave type?")) remove.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {(query.data ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No leave types</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Leave Type" : "New Leave Type"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Days per year</Label><Input type="number" value={form.days_per_year ?? 0} onChange={(e) => setForm({ ...form, days_per_year: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={!!form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} /><Label>Paid leave</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await upsert.mutateAsync({ ...form, id: editing?.id }); setOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Leave Requests Tab ---------------- */
function LeaveRequestDialog({ open, onOpenChange, myEmployeeId }: { open: boolean; onOpenChange: (v: boolean) => void; myEmployeeId: string | null }) {
  const { canManage } = useHRAccess();
  const { query: empQ } = useEmployees();
  const { query: typesQ } = useLeaveTypes();
  const { create } = useLeaveRequests();
  const [form, setForm] = useState<any>({ employee_id: myEmployeeId ?? "", leave_type_id: "", start_date: "", end_date: "", reason: "" });

  const employeeOptions = canManage ? (empQ.data ?? []) : (empQ.data ?? []).filter((e) => e.id === myEmployeeId);

  const submit = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) return;
    await create.mutateAsync({ ...form, days: daysBetween(form.start_date, form.end_date), status: "pending" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employeeOptions.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Leave Type</Label>
            <Select value={form.leave_type_id} onValueChange={(v) => setForm({ ...form, leave_type_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>{(typesQ.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <div className="text-sm text-muted-foreground">Days: {daysBetween(form.start_date, form.end_date)}</div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTab() {
  const { canManage } = useHRAccess();
  const { data: me } = useMyEmployee();
  const { query, review, cancel } = useLeaveRequests();
  const [open, setOpen] = useState(false);

  const rows = query.data ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Leave Requests</h3>
          <Button onClick={() => setOpen(true)} disabled={!canManage && !me}>
            <Plus className="h-4 w-4 mr-1" /> Request Leave
          </Button>
        </div>
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Dates</TableHead>
              <TableHead className="text-right">Days</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No leave requests</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} className="odd:bg-muted/30">
                  <TableCell>{r.employees?.full_name ?? "—"}</TableCell>
                  <TableCell>{r.leave_types?.name ?? "—"}</TableCell>
                  <TableCell>{r.start_date} → {r.end_date}</TableCell>
                  <TableCell className="text-right">{r.days}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : r.status === "cancelled" ? "outline" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {canManage && r.status === "pending" && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => review.mutate({ id: r.id, status: "approved" })} title="Approve"><CheckCircle2 className="h-4 w-4 text-green-600" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => review.mutate({ id: r.id, status: "rejected" })} title="Reject"><XCircle className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                    {r.status === "pending" && r.employee_id === me?.id && (
                      <Button size="sm" variant="outline" onClick={() => cancel.mutate(r.id)}>Cancel</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
      {canManage && <LeaveTypesCard />}
      {open && <LeaveRequestDialog open={open} onOpenChange={setOpen} myEmployeeId={me?.id ?? null} />}
    </div>
  );
}

/* ---------------- Payslips Tab ---------------- */
function PayslipDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Payslip | null }) {
  const { query: empQ } = useEmployees();
  const { upsert } = usePayslips();
  const now = new Date();
  const [form, setForm] = useState<any>(editing ?? {
    employee_id: "", period_month: now.getMonth() + 1, period_year: now.getFullYear(),
    basic_salary: 0, allowances: [], deductions: [], notes: "",
  });

  const gross = Number(form.basic_salary || 0) + (form.allowances ?? []).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
  const totalDed = (form.deductions ?? []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
  const net = gross - totalDed;

  const addLine = (key: "allowances" | "deductions") =>
    setForm({ ...form, [key]: [...(form[key] ?? []), { label: "", amount: 0 }] });

  const updateLine = (key: "allowances" | "deductions", i: number, field: "label" | "amount", value: string) => {
    const arr = [...(form[key] ?? [])];
    arr[i] = { ...arr[i], [field]: field === "amount" ? Number(value) : value };
    setForm({ ...form, [key]: arr });
  };
  const removeLine = (key: "allowances" | "deductions", i: number) => {
    const arr = [...(form[key] ?? [])]; arr.splice(i, 1); setForm({ ...form, [key]: arr });
  };

  const submit = async () => {
    if (!form.employee_id) return;
    await upsert.mutateAsync({ ...form, id: editing?.id });
    onOpenChange(false);
  };

  const onSelectEmployee = (v: string) => {
    const e = (empQ.data ?? []).find((x) => x.id === v);
    setForm({ ...form, employee_id: v, basic_salary: form.id ? form.basic_salary : e?.basic_salary ?? 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Payslip" : "New Payslip"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={onSelectEmployee}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(empQ.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Month</Label>
              <Select value={String(form.period_month)} onValueChange={(v) => setForm({ ...form, period_month: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Year</Label><Input type="number" value={form.period_year} onChange={(e) => setForm({ ...form, period_year: Number(e.target.value) })} /></div>
          </div>
          <div><Label>Basic Salary</Label><Input type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) })} /></div>

          {(["allowances", "deductions"] as const).map((key) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <Label className="capitalize">{key}</Label>
                <Button size="sm" variant="outline" onClick={() => addLine(key)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </div>
              <div className="space-y-2">
                {(form[key] ?? []).map((l: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Label" value={l.label} onChange={(e) => updateLine(key, i, "label", e.target.value)} />
                    <Input type="number" placeholder="Amount" className="w-40" value={l.amount} onChange={(e) => updateLine(key, i, "amount", e.target.value)} />
                    <Button size="icon" variant="ghost" onClick={() => removeLine(key, i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded border p-3 space-y-1 bg-muted/30 text-sm">
            <div className="flex justify-between"><span>Gross Pay</span><span className="font-medium">{KES(gross)}</span></div>
            <div className="flex justify-between"><span>Total Deductions</span><span className="font-medium">{KES(totalDed)}</span></div>
            <div className="flex justify-between text-base pt-1 border-t"><span className="font-semibold">Net Pay</span><span className="font-bold text-primary">{KES(net)}</span></div>
          </div>

          <div><Label>Notes</Label><Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending}>Save Draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayslipViewer({ payslip, onClose }: { payslip: any; onClose: () => void }) {
  const { business } = useBusiness();
  return (
    <Dialog open={!!payslip} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Payslip</DialogTitle></DialogHeader>
        <div id="payslip-print" className="space-y-3 text-sm">
          <div className="text-center border-b pb-2">
            <div className="font-bold text-lg">{business?.name}</div>
            <div className="text-muted-foreground">Payslip — {MONTHS[payslip.period_month - 1]} {payslip.period_year}</div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="text-muted-foreground">Employee</div><div className="text-right font-medium">{payslip.employees?.full_name}</div>
            <div className="text-muted-foreground">Status</div><div className="text-right">{payslip.status}</div>
          </div>
          <div className="border-t pt-2">
            <div className="font-semibold mb-1">Earnings</div>
            <div className="flex justify-between"><span>Basic Salary</span><span>{KES(payslip.basic_salary)}</span></div>
            {(payslip.allowances ?? []).map((a: any, i: number) => (
              <div key={i} className="flex justify-between"><span>{a.label}</span><span>{KES(a.amount)}</span></div>
            ))}
            <div className="flex justify-between border-t mt-1 pt-1 font-medium"><span>Gross Pay</span><span>{KES(payslip.gross_pay)}</span></div>
          </div>
          <div>
            <div className="font-semibold mb-1">Deductions</div>
            {(payslip.deductions ?? []).length === 0 && <div className="text-muted-foreground">None</div>}
            {(payslip.deductions ?? []).map((d: any, i: number) => (
              <div key={i} className="flex justify-between"><span>{d.label}</span><span>{KES(d.amount)}</span></div>
            ))}
            <div className="flex justify-between border-t mt-1 pt-1 font-medium"><span>Total Deductions</span><span>{KES(payslip.total_deductions)}</span></div>
          </div>
          <div className="flex justify-between border-t-2 pt-2 text-base font-bold"><span>Net Pay</span><span className="text-primary">{KES(payslip.net_pay)}</span></div>
          {payslip.notes && <div className="text-xs text-muted-foreground border-t pt-2">{payslip.notes}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayslipsTab() {
  const { canManage } = useHRAccess();
  const { data: me } = useMyEmployee();
  const { query, issue, remove } = usePayslips(canManage ? {} : { onlyMine: true, myEmployeeId: me?.id ?? null });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [viewing, setViewing] = useState<any>(null);

  const rows = query.data ?? [];

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> New Payslip</Button>
        </div>
      )}
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Period</TableHead><TableHead>Employee</TableHead>
            <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Deductions</TableHead>
            <TableHead className="text-right">Net</TableHead><TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payslips</TableCell></TableRow>}
            {rows.map((p: any) => (
              <TableRow key={p.id} className="odd:bg-muted/30">
                <TableCell>{MONTHS[p.period_month - 1]} {p.period_year}</TableCell>
                <TableCell>{p.employees?.full_name}</TableCell>
                <TableCell className="text-right">{KES(p.gross_pay)}</TableCell>
                <TableCell className="text-right">{KES(p.total_deductions)}</TableCell>
                <TableCell className="text-right font-semibold">{KES(p.net_pay)}</TableCell>
                <TableCell><Badge variant={p.status === "issued" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => setViewing(p)}><FileText className="h-4 w-4" /></Button>
                  {canManage && p.status === "draft" && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => issue.mutate(p.id)}>Issue</Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete payslip?")) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      {open && <PayslipDialog open={open} onOpenChange={setOpen} editing={editing} />}
      {viewing && <PayslipViewer payslip={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function HR() {
  const { canManage } = useHRAccess();
  const { data: me } = useMyEmployee();
  const defaultTab = useMemo(() => (canManage ? "employees" : "leave"), [canManage]);
  const [tab, setTab] = useState(defaultTab);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Human Resources</h1>
        <p className="text-sm text-muted-foreground">
          {canManage ? "Manage employees, leave and payroll." : "Your employee record, leave and payslips."}
        </p>
      </div>

      {!canManage && !me && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          You are not linked to an employee record yet. Ask an admin to add you in HR → Employees.
        </CardContent></Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {canManage && <TabsTrigger value="employees">Employees</TabsTrigger>}
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
        </TabsList>
        {canManage && <TabsContent value="employees"><EmployeesTab /></TabsContent>}
        <TabsContent value="leave"><LeaveTab /></TabsContent>
        <TabsContent value="payslips"><PayslipsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
