import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useJournalEntries } from "@/hooks/useJournalEntries";

interface Account { id: string; code: string; name: string; type: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}

interface LineDraft {
  account_id: string;
  debit: string;
  credit: string;
  description: string;
}

const emptyLine = (): LineDraft => ({ account_id: "", debit: "", credit: "", description: "" });

export function JournalEntryDialog({ open, onOpenChange, accounts }: Props) {
  const { create } = useJournalEntries();
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10));
      setReference("");
      setDescription("");
      setLines([emptyLine(), emptyLine()]);
    }
  }, [open]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLine = (i: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const handleSubmit = async () => {
    const cleanLines = lines
      .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        account_id: l.account_id,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || undefined,
      }));

    await create.mutateAsync({
      date,
      reference: reference || undefined,
      description: description || undefined,
      lines: cleanLines,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. JV-001" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description / Memo</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Narration for this entry" />
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Account</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead className="text-right w-[120px]">Debit</TableHead>
                  <TableHead className="text-right w-[120px]">Credit</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Select value={line.account_id} onValueChange={(v) => updateLine(i, { account_id: v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input className="h-9" value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Optional" />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number" step="0.01"
                        value={line.debit}
                        onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number" step="0.01"
                        value={line.credit}
                        onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} disabled={lines.length <= 2}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-medium">
                  <TableCell colSpan={2} className="text-right text-sm">Totals</TableCell>
                  <TableCell className="text-right font-mono">{totalDebit.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{totalCredit.toLocaleString()}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>
            <div className={`text-sm ${balanced ? "text-emerald-600" : "text-destructive"}`}>
              {balanced ? "✓ Balanced" : `Out of balance: ${(totalDebit - totalCredit).toFixed(2)}`}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!balanced || create.isPending}>
            {create.isPending ? "Posting..." : "Post Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
