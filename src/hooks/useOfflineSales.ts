import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { assertCanPost } from "@/lib/postingGuard";
import {
  isOnline,
  listQueuedSales,
  removeQueuedSale,
  type QueuedSale,
} from "@/lib/offlineSales";

async function pushSale(q: QueuedSale): Promise<void> {
  // Offline replay is a real posting mutation; re-check the subscription gate
  // at sync time so an expired tenant cannot bypass the guard by reconnecting.
  assertCanPost();
  // Idempotency: the sale id was minted offline, so a replay of an already
  // synced sale is detected here and skipped instead of duplicating.
  const { data: existing } = await supabase.from("sales").select("id").eq("id", q.id).maybeSingle();
  if (existing) return;

  const { error: saleErr } = await supabase.from("sales").insert(q.sale as never);
  if (saleErr) throw saleErr;

  if (q.items.length) {
    const { error } = await supabase.from("sale_items").insert(q.items as never);
    if (error) throw error;
  }
  if (q.payments.length) {
    const { error } = await supabase.from("payments").insert(q.payments as never);
    if (error) throw error;
  }
  // Legacy queued sales may still carry mirror adjustment rows; they are dropped
  // because stock movements are now derived from the sale document itself.

  if (q.bankTransaction) {
    await supabase.from("bank_transactions").insert(q.bankTransaction as never);
  }

  for (const delta of q.inventoryDeltas) {
    const { data: inv } = await supabase
      .from("inventory")
      .select("id, quantity")
      .eq("product_id", delta.product_id)
      .eq("location_id", delta.location_id)
      .maybeSingle();
    if (inv) {
      await supabase
        .from("inventory")
        .update({ quantity: Number(inv.quantity) - delta.quantity })
        .eq("id", inv.id);
    }
  }
}

/**
 * Tracks connectivity plus the offline sale queue, and flushes it automatically
 * whenever the browser comes back online.
 */
export function useOfflineSales() {
  const qc = useQueryClient();
  const [online, setOnline] = useState<boolean>(() => isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    setPending((await listQueuedSales()).length);
  }, []);

  const sync = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!isOnline() || syncing) return;
      const queue = await listQueuedSales();
      if (queue.length === 0) {
        await refreshCount();
        return;
      }
      setSyncing(true);
      let synced = 0;
      let failed = 0;
      for (const q of queue) {
        try {
          await pushSale(q);
          await removeQueuedSale(q.id);
          synced += 1;
        } catch {
          failed += 1;
        }
      }
      setSyncing(false);
      await refreshCount();
      if (synced > 0) {
        qc.invalidateQueries({ queryKey: ["sales"] });
        qc.invalidateQueries({ queryKey: ["inventory"] });
        if (!opts.silent) toast.success(`Synced ${synced} offline sale${synced > 1 ? "s" : ""}`);
      }
      if (failed > 0 && !opts.silent) {
        toast.error(`${failed} offline sale${failed > 1 ? "s" : ""} could not sync yet — will retry`);
      }
    },
    [qc, refreshCount, syncing],
  );

  useEffect(() => {
    void refreshCount();
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Opportunistic flush on mount (e.g. app reopened already online).
    if (isOnline()) void sync({ silent: true });
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, pending, syncing, sync, refreshCount };
}
