import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

export function usePurchaseLifecycle(purchaseId?: string) {
  const { business } = useBusiness();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();

  const timeline = useQuery({
    queryKey: ["purchase_timeline", purchaseId],
    queryFn: async () => {
      if (!purchaseId) return [];
      const { data, error } = await supabase.rpc("get_purchase_timeline", { _purchase_id: purchaseId });
      if (error) throw error;
      return data || [];
    },
    enabled: !!purchaseId && hasPermission("purchases.history"),
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!purchaseId) throw new Error("Purchase is required");
      if (!hasPermission("purchases.approve")) throw new Error("Missing permission: purchases.approve");
      const { data, error } = await supabase.rpc("approve_purchase", { _purchase_id: purchaseId, _note: null });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase_timeline", purchaseId] });
      toast.success("Purchase approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receive = async (receipts: Array<{ purchase_item_id: string; quantity: number }>) => {
    if (!purchaseId) throw new Error("Purchase is required");
    if (!hasPermission("purchases.receive")) throw new Error("Missing permission: purchases.receive");
    const { data, error } = await supabase.rpc("receive_purchase", { _purchase_id: purchaseId, _receipts: receipts });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["purchases"] });
    qc.invalidateQueries({ queryKey: ["purchase_timeline", purchaseId] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
    toast.success("Purchase receipt posted");
    return data;
  };

  const returnAll = useMutation({
    mutationFn: async () => {
      if (!purchaseId) throw new Error("Purchase is required");
      if (!hasPermission("purchases.return")) throw new Error("Missing permission: purchases.return");
      const reason = window.prompt("Reason for supplier return (optional)") || null;
      const { data, error } = await supabase.rpc("create_purchase_return", { _purchase_id: purchaseId, _reason: reason });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase_timeline", purchaseId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Purchase return completed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { timeline, approve, receive, returnAll };
}
