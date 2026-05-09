import { Card, CardContent } from "@/components/ui/card";
import {
  ShoppingCart,
  DollarSign,
  FileText,
  ArrowLeftRight,
  Download,
  AlertTriangle,
  RotateCcw,
  Receipt,
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
}

function StatCard({ title, value, icon, iconBg }: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex items-center justify-center h-12 w-12 rounded-full shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-xl font-bold">KES {value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface DashboardStatCardsProps {
  data: {
    todaySales: number;
    todayProfit: number;
    invoiceDue: number;
    totalPurchases: number;
    purchaseDue: number;
    todayExpenses: number;
  };
}

export function DashboardStatCards({ data }: DashboardStatCardsProps) {
  const stats = [
    {
      title: "Total Sales",
      value: data.todaySales.toLocaleString(),
      icon: <ShoppingCart className="h-5 w-5 text-blue-600" />,
      iconBg: "bg-blue-100",
    },
    {
      title: "Net Profit",
      value: data.todayProfit.toLocaleString(),
      icon: <DollarSign className="h-5 w-5 text-green-600" />,
      iconBg: "bg-green-100",
    },
    {
      title: "Invoice Due",
      value: data.invoiceDue.toLocaleString(),
      icon: <FileText className="h-5 w-5 text-amber-600" />,
      iconBg: "bg-amber-100",
    },
    {
      title: "Total Sell Return",
      value: "0",
      icon: <ArrowLeftRight className="h-5 w-5 text-rose-500" />,
      iconBg: "bg-rose-100",
    },
    {
      title: "Total Purchase",
      value: data.totalPurchases.toLocaleString(),
      icon: <Download className="h-5 w-5 text-cyan-600" />,
      iconBg: "bg-cyan-100",
    },
    {
      title: "Purchase Due",
      value: data.purchaseDue.toLocaleString(),
      icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
      iconBg: "bg-orange-100",
    },
    {
      title: "Total Purchase Return",
      value: "0",
      icon: <RotateCcw className="h-5 w-5 text-rose-500" />,
      iconBg: "bg-rose-100",
    },
    {
      title: "Expense",
      value: data.todayExpenses.toLocaleString(),
      icon: <Receipt className="h-5 w-5 text-red-600" />,
      iconBg: "bg-red-100",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
}
