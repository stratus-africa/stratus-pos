import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateOpeningBalance } from "@/hooks/useJournalEntries";

interface Account {
  id: string;
  code: string;
  name: string;
  opening_balance?: number;
  opening_balance_date?: string | null;
}

interface Props {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function OpeningBalanceDialog({ account, open, onOpenChange, onSaved }: Props) {
  const update = useUpdateOpeningBalance();
  const [balance, setBalance] = useState("0");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (account) {
      setBalance(String(account.opening_balance ?? 0));
      setDate(account.opening_balance_date || new Date().toISOString().slice(0, 10));
    }
  }, [account]);

  const handleSave = async () => {
    if (!account) return;
    await update.mutateAsync({
      id: account.id,
      opening_balance: Number(balance) || 0,
      opening_balance_date: date || null,
    });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Opening Balance</DialogTitle>
        </DialogHeader>
        {account && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              <div className="font-mono text-xs text-muted-foreground">{account.code}</div>
              <div className="font-medium">{account.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Opening Balance (KES)</Label>
                <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>As of Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use positive numbers. Sign convention: Assets &amp; Expenses are debit-natured (positive = debit balance);
              Liabilities, Equity &amp; Revenue are credit-natured (positive = credit balance).
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
