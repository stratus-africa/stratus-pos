import { createFileRoute } from '@tanstack/react-router';
import SuperAdminHealth from '@/pages/super-admin/SuperAdminHealth';
export const Route = createFileRoute('/_super/super-admin/health')({ component: SuperAdminHealth });
