import { createFileRoute } from '@tanstack/react-router';
import SuperAdminFeatureFlags from '@/pages/super-admin/SuperAdminFeatureFlags';
export const Route = createFileRoute('/_super/super-admin/feature-flags')({ component: SuperAdminFeatureFlags });
