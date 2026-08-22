import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

export interface POSSession {
  id: string;
  business_id: string;
  location_id: string;
  cash_account_id?: string | null;
  opened_by: string;
  closed_by: string | null;
  opening_float: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  total_sales: number;
  total_transactions: number;
  total_refunds: number;
  payments_cash: number;
  payments_mpesa: number;
  payments_card: number;
  payments_other: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

export function usePOSSession() {
  const { business, currentLocation, userRole } = useBusiness();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const [activeSession, setActiveSession] = useState<POSSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveSession = useCallback(async () => {
    if (!business || !currentLocation) {
      setActiveSession(null);
      setLoading(false);
      return;
    }

    let sessionQuery = supabase
      .from("pos_sessions")
      .select("*")
      .eq("business_id", business.id)
      .eq("location_id", currentLocation.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1);
    if (userRole === "cashier" && user) sessionQuery = sessionQuery.eq("opened_by", user.id);
    const { data } = await sessionQuery.maybeSingle();

    setActiveSession(data as POSSession | null);
    setLoading(false);
  }, [business, currentLocation, user, userRole]);

  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  const startDay = async (openingFloat: number, locationIdOverride?: string, cashAccountId?: string) => {
    if (!hasPermission("pos.open_till")) {
      toast.error("You do not have permission to open a till.");
      return null;
    }
    const targetLocationId = locationIdOverride || currentLocation?.id;
    if (!business || !targetLocationId || !user) return null;

    const { data, error } = await supabase
      .from("pos_sessions")
      .insert({
        business_id: business.id,
        location_id: targetLocationId,
        opened_by: user.id,
        opening_float: openingFloat,
        status: "open",
        ...(cashAccountId ? { cash_account_id: cashAccountId } : {}),
      } as never)
      .select()
      .single();

    if (error) {
      toast.error("Failed to start session: " + error.message);
      return null;
    }

    setActiveSession(data as POSSession);
    toast.success("Day started! Register is now open.");
    return data;
  };

  const endDay = async (closingCash: number, notes?: string) => {
    if (!hasPermission("pos.close_till") || !hasPermission("pos.reconcile_till")) {
      toast.error("You do not have permission to close and reconcile this till.");
      return null;
    }
    if (!activeSession || !user || !business || !currentLocation) return null;

    // Calculate session totals from sales made during this session
    let salesQuery = supabase
      .from("sales")
      .select("id, total, status")
      .eq("business_id", business.id)
      .eq("location_id", currentLocation.id)
      .gte("created_at", activeSession.opened_at)
      .eq("status", "final");
    if (userRole === "cashier") salesQuery = salesQuery.eq("created_by", user.id);
    const { data: salesData } = await salesQuery;

    const saleIds = (salesData || []).map((s) => s.id);
    const totalSales = (salesData || []).reduce((sum, s) => sum + Number(s.total), 0);
    const totalTransactions = salesData?.length || 0;

    // Get payment breakdown
    let paymentsCash = 0,
      paymentsMpesa = 0,
      paymentsCard = 0,
      paymentsOther = 0;
    if (saleIds.length > 0) {
      const { data: paymentsData } = await supabase.from("payments").select("method, amount").in("sale_id", saleIds);

      (paymentsData || []).forEach((p) => {
        const amt = Number(p.amount);
        switch (p.method) {
          case "cash":
            paymentsCash += amt;
            break;
          case "mpesa":
            paymentsMpesa += amt;
            break;
          case "card":
            paymentsCard += amt;
            break;
          default:
            paymentsOther += amt;
        }
      });
    }

    const { data: cashMovements } = await supabase
      .from("pos_cash_movements")
      .select("movement_type, amount")
      .eq("session_id", activeSession.id);
    const cashIn = (cashMovements || [])
      .filter((m) => m.movement_type === "cash_in")
      .reduce((sum, m) => sum + Number(m.amount), 0);
    const cashOut = (cashMovements || [])
      .filter((m) => m.movement_type === "cash_out")
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const expectedCash = activeSession.opening_float + paymentsCash + cashIn - cashOut;
    const cashDifference = closingCash - expectedCash;

    const { data, error } = await supabase
      .from("pos_sessions")
      .update({
        closed_by: user.id,
        closing_cash: closingCash,
        expected_cash: expectedCash,
        cash_difference: cashDifference,
        total_sales: totalSales,
        total_transactions: totalTransactions,
        payments_cash: paymentsCash,
        payments_mpesa: paymentsMpesa,
        payments_card: paymentsCard,
        payments_other: paymentsOther,
        status: "closed",
        closed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq("id", activeSession.id)
      .select()
      .single();

    if (error) {
      toast.error("Failed to close session: " + error.message);
      return null;
    }

    const closedSession = data as POSSession;
    setActiveSession(null);
    toast.success("Day closed successfully!");
    return closedSession;
  };

  const fetchSessionHistory = async (limit = 30) => {
    if (!business || !currentLocation) return [];

    let historyQuery = supabase
      .from("pos_sessions")
      .select("*")
      .eq("business_id", business.id)
      .eq("location_id", currentLocation.id)
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (userRole === "cashier" && user) historyQuery = historyQuery.eq("opened_by", user.id);
    const { data } = await historyQuery;

    return (data || []) as POSSession[];
  };

  const recordCashMovement = async (type: "cash_in" | "cash_out", amount: number, reason: string) => {
    const permission = type === "cash_in" ? "pos.cash_in" : "pos.cash_out";
    if (!hasPermission(permission) && !hasPermission("pos.override")) {
      toast.error(`You do not have permission to record ${type === "cash_in" ? "cash in" : "cash out"}.`);
      return false;
    }
    if (!activeSession || !business || !currentLocation || !user || amount <= 0 || !reason.trim()) return false;
    const { error } = await supabase.from("pos_cash_movements").insert({
      business_id: business.id,
      location_id: currentLocation.id,
      session_id: activeSession.id,
      movement_type: type,
      amount,
      reason: reason.trim(),
      created_by: user.id,
    });
    if (error) {
      toast.error(`Could not record cash movement: ${error.message}`);
      return false;
    }
    toast.success(type === "cash_in" ? "Cash in recorded." : "Cash out recorded.");
    return true;
  };

  return {
    activeSession,
    loading,
    startDay,
    endDay,
    fetchSessionHistory,
    refresh: fetchActiveSession,
  };
}
