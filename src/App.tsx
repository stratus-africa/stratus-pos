import { Component, lazy as reactLazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BusinessProvider, useBusiness } from "@/contexts/BusinessContext";
import { AppLayout } from "@/components/AppLayout";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { SuperAdminLayout } from "@/components/super-admin/SuperAdminLayout";
import { FeatureGate } from "@/components/FeatureGate";
import { usePermissions } from "@/hooks/usePermissions";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

const CHUNK_RELOAD_KEY = "__chunk_reload_at__";
const CHUNK_RELOAD_COOLDOWN_MS = 10_000;
let chunkReloadScheduled = false;

function isChunkLoadError(error: unknown): boolean {
  const message = typeof error === "string" ? error : (error as { message?: string })?.message ?? "";
  return /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);
}

function scheduleChunkReload(error: unknown): boolean {
  if (!isChunkLoadError(error) || chunkReloadScheduled) return false;

  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < CHUNK_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures and still attempt a full refresh.
  }

  chunkReloadScheduled = true;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("__app_reload", String(Date.now()));
  window.location.replace(nextUrl.toString());
  return true;
}

const lazy = <T extends { default: ComponentType<any> }>(loader: () => Promise<T>) =>
  reactLazy(() =>
    loader().catch((error) => {
      if (scheduleChunkReload(error)) return new Promise<T>(() => undefined);
      throw error;
    })
  );

class ChunkErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    // Only capture chunk-load errors here. Other runtime errors should bubble
    // up so we don't mask real bugs with a misleading "Update required" screen.
    if (isChunkLoadError(error) || isChunkLoadError((error as { message?: string })?.message)) {
      return { error };
    }
    return { error: null };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      scheduleChunkReload(error);
      return;
    }
    // Re-throw so React's default error handling / dev overlay surfaces it.
    console.error(error, info);
    throw error;
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <h2 className="text-xl font-semibold">Update required</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The app was updated while this page was open. Refresh to load the latest version.
        </p>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={async () => {
            try {
              sessionStorage.removeItem(CHUNK_RELOAD_KEY);
            } catch {}
            try {
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch {}
            try {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              }
            } catch {}
            const url = new URL(window.location.href);
            url.searchParams.set("__app_reload", String(Date.now()));
            window.location.replace(url.toString());
          }}
        >
          Refresh
        </button>
      </div>
    );
  }
}


// Lazy-loaded pages
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SignIn = lazy(() => import("./pages/SignIn"));
const Index = lazy(() => import("./pages/Index"));
const POS = lazy(() => import("./pages/POS"));
const Products = lazy(() => import("./pages/Products"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Sales = lazy(() => import("./pages/Sales"));
const Customers = lazy(() => import("./pages/Customers"));
const Purchases = lazy(() => import("./pages/Purchases"));
const PurchaseEditor = lazy(() => import("./pages/PurchaseEditor"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const ChartOfAccounts = lazy(() => import("./pages/ChartOfAccounts"));
const Profile = lazy(() => import("./pages/Profile"));
const CashierDashboard = lazy(() => import("./pages/CashierDashboard"));
const JournalEntries = lazy(() => import("./pages/JournalEntries"));
const Banking = lazy(() => import("./pages/Banking"));
const Digitax = lazy(() => import("./pages/Digitax"));
const NotFound = lazy(() => import("./pages/NotFound"));

const Landing = lazy(() => import("./pages/Landing"));
const SuperAdminLogin = lazy(() => import("./pages/SuperAdminLogin"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Terms = lazy(() => import("./pages/legal/Terms"));
const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Refund = lazy(() => import("./pages/legal/Refund"));

const SuperAdminDashboard = lazy(() => import("./pages/super-admin/SuperAdminDashboard"));
const SuperAdminBusinesses = lazy(() => import("./pages/super-admin/SuperAdminBusinesses"));
const SuperAdminTenantApprovals = lazy(() => import("./pages/super-admin/SuperAdminTenantApprovals"));
const SuperAdminUsers = lazy(() => import("./pages/super-admin/SuperAdminUsers"));
const SuperAdminActivity = lazy(() => import("./pages/super-admin/SuperAdminActivity"));
const SuperAdminPackages = lazy(() => import("./pages/super-admin/SuperAdminPackages"));
const SuperAdminPackageEdit = lazy(() => import("./pages/super-admin/SuperAdminPackageEdit"));
const SuperAdminLanding = lazy(() => import("./pages/super-admin/SuperAdminLanding"));
const SuperAdminTenantDetail = lazy(() => import("./pages/super-admin/SuperAdminTenantDetail"));
const SuperAdminSubscriptions = lazy(() => import("./pages/super-admin/SuperAdminSubscriptions"));
const SuperAdminPaymentsOverview = lazy(() => import("./pages/super-admin/SuperAdminPaymentsOverview"));
const SuperAdminBusinessEdit = lazy(() => import("./pages/super-admin/SuperAdminBusinessEdit"));
const CmsHero = lazy(() => import("./pages/super-admin/cms/CmsHero"));
const CmsFeatures = lazy(() => import("./pages/super-admin/cms/CmsFeatures"));
const CmsStats = lazy(() => import("./pages/super-admin/cms/CmsStats"));
const CmsHowItWorks = lazy(() => import("./pages/super-admin/cms/CmsHowItWorks"));
const CmsTestimonials = lazy(() => import("./pages/super-admin/cms/CmsTestimonials"));
const CmsFaq = lazy(() => import("./pages/super-admin/cms/CmsFaq"));
const CmsPricing = lazy(() => import("./pages/super-admin/cms/CmsPricing"));
const CmsCta = lazy(() => import("./pages/super-admin/cms/CmsCta"));
const SuperAdminSettings = lazy(() => import("./pages/super-admin/SuperAdminSettings"));
const PaystackSettings = lazy(() => import("./pages/super-admin/payments/PaystackSettings"));
const MpesaSettings = lazy(() => import("./pages/super-admin/payments/MpesaSettings"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
    <p className="text-muted-foreground">You don't have permission to view this page.</p>
  </div>
);

const SuperAdminRoutes = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();

  if (authLoading || saLoading) return <PageLoader />;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <SuperAdminLayout>
      <ChunkErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<SuperAdminDashboard />} />
            <Route path="/businesses" element={<SuperAdminBusinesses />} />
            <Route path="/tenant-approvals" element={<SuperAdminTenantApprovals />} />
            <Route path="/businesses/:id" element={<SuperAdminTenantDetail />} />
            <Route path="/businesses/:id/edit" element={<SuperAdminBusinessEdit />} />
            <Route path="/subscriptions" element={<SuperAdminSubscriptions />} />
            <Route path="/users" element={<SuperAdminUsers />} />
            <Route path="/packages" element={<SuperAdminPackages />} />
            <Route path="/packages/new" element={<SuperAdminPackageEdit />} />
            <Route path="/packages/:id/edit" element={<SuperAdminPackageEdit />} />
            <Route path="/landing" element={<SuperAdminLanding />} />
            <Route path="/activity" element={<SuperAdminActivity />} />
            <Route path="/payments" element={<SuperAdminPaymentsOverview />} />
            <Route path="/cms/hero" element={<CmsHero />} />
            <Route path="/cms/features" element={<CmsFeatures />} />
            <Route path="/cms/stats" element={<CmsStats />} />
            <Route path="/cms/how-it-works" element={<CmsHowItWorks />} />
            <Route path="/cms/testimonials" element={<CmsTestimonials />} />
            <Route path="/cms/faq" element={<CmsFaq />} />
            <Route path="/cms/pricing" element={<CmsPricing />} />
            <Route path="/cms/cta" element={<CmsCta />} />
            <Route path="/settings" element={<SuperAdminSettings />} />
            <Route path="/settings/payments/paystack" element={<PaystackSettings />} />
            <Route path="/settings/payments/mpesa" element={<MpesaSettings />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </SuperAdminLayout>
  );
};

const BusinessSuspended = () => {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Your business has been suspended</h2>
        <p className="text-muted-foreground mb-6">Your business account has been deactivated by the platform administrator. Please contact support for more information.</p>
        <button onClick={() => signOut()} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Sign Out</button>
      </div>
    </div>
  );
};

const ProtectedRoutes = () => {
  const { user, loading: authLoading } = useAuth();
  const { needsOnboarding, loading: bizLoading, userRole } = useBusiness();
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  const location = useLocation();

  if (authLoading || bizLoading) return <PageLoader />;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;


  // Permission-first guard: a granted permission grants access regardless of role.
  // `permission` is optional — when omitted, the route is open to any signed-in user.
  // While permissions are still loading, show a loader instead of flashing AccessDenied.
  const guard = (element: React.ReactNode, permission?: string) => {
    if (permission) {
      if (permsLoading) return <PageLoader />;
      if (!hasPermission(permission)) return <AccessDenied />;
    }
    return element;
  };

  // Cashier dashboard = daily records. Other roles get the full Index dashboard
  // (subject to dashboard.view permission).
  const rootElement = userRole === "cashier"
    ? <CashierDashboard />
    : guard(<FeatureGate featureKey="dashboard"><Index /></FeatureGate>, "dashboard.view");

  return (
    <AppLayout>
      <ChunkErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={rootElement} />
            <Route path="/pos" element={guard(<FeatureGate featureKey="pos"><POS /></FeatureGate>, "pos.view")} />
            <Route path="/products" element={guard(<FeatureGate featureKey="products"><Products /></FeatureGate>, "products.view")} />
            <Route path="/inventory" element={guard(<FeatureGate featureKey="inventory"><Inventory /></FeatureGate>, "inventory.view")} />
            <Route path="/sales" element={guard(<FeatureGate featureKey="sales"><RouteErrorBoundary title="Transactions" resetKey={location.pathname}><Sales /></RouteErrorBoundary></FeatureGate>, "sales.view")} />
            <Route path="/customers" element={guard(<Customers />, "customers.view")} />
            <Route path="/purchases" element={guard(<FeatureGate featureKey="purchases"><Purchases /></FeatureGate>, "purchases.view")} />
            <Route path="/purchases/new" element={guard(<FeatureGate featureKey="purchases"><PurchaseEditor /></FeatureGate>, "purchases.create")} />
            <Route path="/purchases/:id/edit" element={guard(<FeatureGate featureKey="purchases"><PurchaseEditor /></FeatureGate>, "purchases.edit")} />
            <Route path="/suppliers" element={guard(<FeatureGate featureKey="purchases"><Suppliers /></FeatureGate>, "suppliers.view")} />
            <Route path="/expenses" element={guard(<FeatureGate featureKey="expenses"><Expenses /></FeatureGate>, "expenses.view")} />
            <Route path="/chart-of-accounts" element={guard(<FeatureGate featureKey="chart_of_accounts"><ChartOfAccounts /></FeatureGate>, "chart_of_accounts.view")} />
            <Route path="/journal-entries" element={guard(<FeatureGate featureKey="chart_of_accounts"><JournalEntries /></FeatureGate>, "chart_of_accounts.view")} />
            <Route path="/banking" element={guard(<FeatureGate featureKey="banking"><Banking /></FeatureGate>, "banking.view")} />
            <Route path="/reports" element={guard(<FeatureGate featureKey="reports"><Reports /></FeatureGate>, "report.sales")} />
            <Route path="/tax-compliance" element={guard(<FeatureGate featureKey="digitax"><Digitax /></FeatureGate>, "settings.view")} />
            <Route path="/settings" element={guard(<SettingsPage />, "settings.view")} />
            <Route path="/profile" element={guard(<Profile />)} />
            <Route path="/notifications" element={<NotificationsPage />} />

            <Route path="/roles" element={<Navigate to="/settings?tab=roles" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </AppLayout>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BusinessProvider>
            <ChunkErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/landing" element={<Landing />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/refund-policy" element={<Refund />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/sign-in" element={<SignIn />} />
                  <Route path="/auth" element={<Navigate to="/sign-in" replace />} />
                  <Route path="/super-admin/login" element={<SuperAdminLogin />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/super-admin/*" element={<SuperAdminRoutes />} />
                  <Route path="/*" element={<ProtectedRoutes />} />
                </Routes>
              </Suspense>
            </ChunkErrorBoundary>
          </BusinessProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
