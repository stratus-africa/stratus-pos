# Project Memory

## Core
Multi-tenant SaaS POS system for Kenyan retail shops. Lovable Cloud (Supabase) backend.
Professional blue/slate palette. Navy sidebar, white content. Inter font.
business_id tenant isolation on all tables. RLS via get_user_business_id() helper.
Roles: admin/manager/cashier in separate user_roles table. has_role() security definer.
Currency: KES. Tax: 16%. Timezone: Africa/Nairobi.
Paddle payments enabled. Plans: Free/Basic($15)/Pro($39) in USD.

## Memories
- [Architecture](mem://features/architecture) — Multi-tenant schema, tables, RLS patterns
- [Design tokens](mem://design/tokens) — Color palette, sidebar, success/warning tokens
- [Subscriptions](mem://features/subscriptions) — Paddle billing tiers, price IDs, edge functions
- [Feature gating](mem://features/feature-gating) — Tier restrictions, masquerade mode
