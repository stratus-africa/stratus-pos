import React, { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  Package,
  Users,
  Calendar,
  CreditCard,
  Clock,
  Receipt,
  Layers,
  ArrowRight,
} from "lucide-react";

// Import your report components / tabs
import DailySalesReportTab from "@/components/reports/DailySalesReportTab";
// Import other tabs as needed, e.g.:
// import ProductPerformanceReport from '@/components/reports/ProductPerformanceReport';
// import CustomerReportTab from '@/components/reports/CustomerReportTab';
// import InventoryReportTab from '@/components/reports/InventoryReportTab';

interface ReportItem {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
}

interface ReportCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  reports: ReportItem[];
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "sales-revenue",
    name: "Sales & Revenue",
    description: "Track daily turnover, order summaries, and financial performance.",
    icon: DollarSign,
    reports: [
      {
        id: "daily-sales",
        name: "Daily Sales Report",
        description: "Detailed breakdown of daily orders, payments, and discounts.",
        icon: Calendar,
      },
      {
        id: "sales-summary",
        name: "Revenue & Profit Summary",
        description: "Periodic totals, gross vs net profits, and tax breakdowns.",
        icon: TrendingUp,
      },
      {
        id: "payment-methods",
        name: "Payment Methods Breakdown",
        description: "Cash, Card, Mobile, and Split payments analysis.",
        icon: CreditCard,
      },
    ],
  },
  {
    id: "inventory-products",
    name: "Inventory & Products",
    description: "Product movement, top selling items, and stock level audits.",
    icon: Package,
    reports: [
      {
        id: "best-sellers",
        name: "Top Selling Products",
        description: "Highest revenue and highest volume items.",
        icon: BarChart3,
      },
      {
        id: "low-stock-audit",
        name: "Stock Movement & Valuation",
        description: "Audit stock adjustments, wastage, and current inventory value.",
        icon: Layers,
      },
    ],
  },
  {
    id: "customers-staff",
    name: "Customers & Staff",
    description: "Staff shift performance, customer retention, and transaction history.",
    icon: Users,
    reports: [
      {
        id: "staff-performance",
        name: "Staff Sales & Shifts",
        description: "Sales generated per cashier and shift closing audits.",
        icon: Clock,
      },
      {
        id: "customer-insights",
        name: "Customer Loyalty & Activity",
        description: "Top spenders, repeat visits, and loyalty points.",
        icon: Receipt,
      },
    ],
  },
];

export const Reports = () => {
  const [activeReportId, setActiveReportId] = useState<string>("daily-sales");

  const renderActiveReport = () => {
    switch (activeReportId) {
      case "daily-sales":
        return <DailySalesReportTab />;
      default:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">{activeReportId.replace("-", " ")}</CardTitle>
              <CardDescription>Detailed data view for this report.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-12 text-center text-muted-foreground">
                <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-base font-medium">Report data view is loaded here.</p>
              </div>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
        <p className="text-muted-foreground">
          Browse report categories to inspect sales, inventory, and staff metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Accordion Categories Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Report Categories</CardTitle>
              <CardDescription>Select a report to view details</CardDescription>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <Accordion type="multiple" defaultValue={["sales-revenue"]} className="w-full space-y-2">
                {REPORT_CATEGORIES.map((category) => {
                  const CategoryIcon = category.icon;
                  return (
                    <AccordionItem
                      key={category.id}
                      value={category.id}
                      className="border rounded-lg px-3 data-[state=open]:bg-muted/30 transition-colors"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-2.5 text-left">
                          <CategoryIcon className="h-5 w-5 text-primary shrink-0" />
                          <div>
                            <span className="font-semibold text-sm block">{category.name}</span>
                            <span className="text-xs text-muted-foreground font-normal line-clamp-1">
                              {category.reports.length} reports
                            </span>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pt-1 pb-3">
                        <div className="flex flex-col space-y-1.5 pl-2 border-l-2 border-primary/20 ml-2.5 mt-1">
                          {category.reports.map((report) => {
                            const ReportIcon = report.icon;
                            const isActive = activeReportId === report.id;

                            return (
                              <button
                                key={report.id}
                                onClick={() => setActiveReportId(report.id)}
                                className={`flex items-center justify-between w-full px-3 py-2 text-left rounded-md text-sm transition-all ${
                                  isActive
                                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                                    : "hover:bg-accent text-foreground hover:text-accent-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <ReportIcon
                                    className={`h-4 w-4 shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}
                                  />
                                  <span className="truncate">{report.name}</span>
                                </div>
                                {isActive && <ArrowRight className="h-3.5 w-3.5 shrink-0 ml-2" />}
                              </button>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Report Content View Area */}
        <div className="lg:col-span-8">{renderActiveReport()}</div>
      </div>
    </div>
  );
};

export default Reports;
