import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
  const { business, currentLocation } = useBusiness();
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<POSSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveSession = useCallback(async () => {
    if (!business || !currentLocation) {
      setActiveSession(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("pos_sessions")
      .select("*")
      .eq("business_id", business.id)
      .eq("location_id", currentLocation.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveSession(data as POSSession | null);
    setLoading(false);
  }, [business, currentLocation]);

  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  const startDay = async (
    openingFloat: number,
    locationIdOverride?: string,
    cashAccountId?: string
  ) => {
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
    if (!activeSession || !user || !business || !currentLocation) return null;

    // Calculate session totals from sales made during this session
    const { data: salesData } = await supabase
      .from("sales")
      .select("id, total, status")
      .eq("business_id", business.id)
      .eq("location_id", currentLocation.id)
      .gte("created_at", activeSession.opened_at)
      .eq("status", "final");

    const saleIds = (salesData || []).map((s) => s.id);
    const totalSales = (salesData || []).reduce((sum, s) => sum + Number(s.total), 0);
    const totalTransactions = salesData?.length || 0;

    // Get payment breakdown
    let paymentsCash = 0, paymentsMpesa = 0, paymentsCard = 0, paymentsOther = 0;
    if (saleIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("method, amount")
        .in("sale_id", saleIds);

      (paymentsData || []).forEach((p) => {
        const amt = Number(p.amount);
        switch (p.method) {
          case "cash": paymentsCash += amt; break;
          case "mpesa": paymentsMpesa += amt; break;
          case "card": paymentsCard += amt; break;
          default: paymentsOther += amt;
        }
      });
    }

    const expectedCash = activeSession.opening_float + paymentsCash;
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

    const { data } = await supabase
      .from("pos_sessions")
      .select("*")
      .eq("business_id", business.id)
      .eq("location_id", currentLocation.id)
      .order("opened_at", { ascending: false })
      .limit(limit);

    return (data || []) as POSSession[];
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
