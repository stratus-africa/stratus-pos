import { useState } from "react";
import { CalendarDays, Lock, Unlock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAccountingPeriods, type AccountingPeriod } from "@/hooks/useAccountingPeriods";

function PeriodActions({ period, note, setNote }: {
  period: AccountingPeriod;
  note: string;
  setNote: (value: string) => void;
}) {
  const { close, lock, reopen } = useAccountingPeriods(period.business_id);

  if (period.status === "open") {
    return (
      <Button size="sm" onClick={() => close.mutate({ periodId: period.id, notes: note || undefined })} disabled={close.isPending}>
        <CheckCircle2 className="mr-2 h-4 w-4" /> Close Period
      </Button>
    );
  }

  if (period.status === "closed") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => lock.mutate({ periodId: period.id, notes: note || undefined })} disabled={lock.isPending}>
          <Lock className="mr-2 h-4 w-4" /> Lock Period
        </Button>
        <Button size="sm" variant="outline" onClick={() => reopen.mutate({ periodId: period.id, notes: note })} disabled={reopen.isPending || !note.trim()}>
          <Unlock className="mr-2 h-4 w-4" /> Reopen
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => reopen.mutate({ periodId: period.id, notes: note })} disabled={reopen.isPending || !note.trim()}>
      <Unlock className="mr-2 h-4 w-4" /> Reopen Locked Period
    </Button>
  );
}

export default function AccountingPeriods() {
  const { business } = useBusiness();
  const { periods, create } = useAccountingPeriods(business?.id);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Accounting Periods</CardTitle>
          <p className="text-sm text-muted-foreground">Control which dates may receive accounting postings.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            <Button onClick={() => create.mutate({ periodStart: start, periodEnd: end, notes: notes || undefined })} disabled={create.isPending || !start || !end || start > end}>
              <CalendarDays className="mr-2 h-4 w-4" /> Create Period
            </Button>
          </div>
          <Textarea placeholder="Optional period note..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Period Status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(periods.data ?? []).map((period) => (
            <PeriodRow key={period.id} period={period} />
          ))}
          {!periods.data?.length && <div className="text-sm text-muted-foreground">No accounting periods configured.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodRow({ period }: { period: AccountingPeriod }) {
  const [note, setNote] = useState("");
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">{period.period_start} to {period.period_end}</div>
          <div className="text-xs text-muted-foreground">{period.notes || "No notes"}</div>
        </div>
        <Badge variant={period.status === "locked" ? "destructive" : period.status === "closed" ? "secondary" : "outline"}>
          {period.status}
        </Badge>
      </div>
      {(period.status === "closed" || period.status === "locked") && (
        <Textarea placeholder="Reason required to reopen..." value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      <PeriodActions period={period} note={note} setNote={setNote} />
    </div>
  );
}
