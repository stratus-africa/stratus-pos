import { SidebarTrigger } from "@/components/ui/sidebar";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, FileText, Sunset, Receipt, ShoppingCart, LayoutDashboard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePOSSession } from "@/hooks/usePOSSession";
import { useState } from "react";
import ZReportDialog from "@/components/pos/ZReportDialog";
import EndDayDialog from "@/components/pos/EndDayDialog";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { useExpenses } from "@/hooks/useExpenses";

export function TopBar() {
  const { business, locations, currentLocation, setCurrentLocation } = useBusiness();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const session = usePOSSession();
  const { create: createExpense } = useExpenses();

  const [zReportOpen, setZReportOpen] = useState(false);
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const isPOS = location.pathname === "/pos";
  const isDashboard = location.pathname === "/" || location.pathname === "/dashboard";

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "U";

  const handleEndDay = async (closingCash: number, notes?: string) => {
    const closedSession = await session.endDay(closingCash, notes);
    setEndDayOpen(false);
    if (closedSession) {
      setZReportOpen(true);
    }
  };

  return (
    <>
      <header className="h-14 flex items-center justify-between border-b border-border bg-white px-4 sm:px-6 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          {business && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {locations.length > 1 ? (
                <Select
                  value={currentLocation?.id || ""}
                  onValueChange={(val) => {
                    const loc = locations.find((l) => l.id === val);
                    if (loc) setCurrentLocation(loc);
                  }}
                >
                  <SelectTrigger className="h-7 w-auto border-none bg-transparent text-sm p-0 gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs">{currentLocation?.name}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(isDashboard || isPOS) && (
            <Button
              size="sm"
              variant={isPOS ? "outline" : "default"}
              className="h-7 text-xs"
              onClick={() => navigate(isPOS ? "/" : "/pos")}
            >
              {isPOS ? <LayoutDashboard className="h-3.5 w-3.5 mr-1" /> : <ShoppingCart className="h-3.5 w-3.5 mr-1" />}
              {isPOS ? "Dashboard" : "POS"}
            </Button>
          )}
          {isPOS && session.activeSession && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExpenseOpen(true)}>
                <Receipt className="h-3.5 w-3.5 mr-1" />
                Expense
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setZReportOpen(true)}>
                <FileText className="h-3.5 w-3.5 mr-1" />
                Z Report
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setEndDayOpen(true)}>
                <Sunset className="h-3.5 w-3.5 mr-1" />
                End Day
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Open profile"
          >
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
          </button>
        </div>
      </header>

      {isPOS && session.activeSession && (
        <>
          <EndDayDialog
            open={endDayOpen}
            onOpenChange={setEndDayOpen}
            session={session.activeSession}
            onConfirm={handleEndDay}
          />
          <ZReportDialog
            open={zReportOpen}
            onOpenChange={setZReportOpen}
            sessions={[]}
            onLoadSessions={session.fetchSessionHistory}
          />
        </>
      )}

      {isPOS && (
        <ExpenseFormDialog
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
          onSubmit={(data) => createExpense.mutate(data)}
          isLoading={createExpense.isPending}
        />
      )}
    </>
  );
}
