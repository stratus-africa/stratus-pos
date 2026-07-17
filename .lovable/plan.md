# Manual Tenant Approval Workflow

## Part 1 — Fix onboarding loop (bug)

After signup, `Onboarding` creates a business and redirects. With the new approval flow the user must instead be signed out and sent to `/signin` with a "pending approval" message. Fix: after business insert, sign out the session and route to `/signin?pending=1`. On `/signin`, if the profile's business has `approval_status != 'approved'`, block login and show the pending/rejected message.

## Part 2 — Database changes

Add to `public.businesses`:
- `approval_status` text default `'pending'` (`pending` | `approved` | `rejected` | `info_requested` | `expired`)
- `approved_by uuid`, `approved_at timestamptz`
- `rejected_by uuid`, `rejected_at timestamptz`, `rejection_reason text`
- `info_requested_by uuid`, `info_requested_at timestamptz`, `info_request_message text`
- `internal_notes text` (super-admin only via RLS column-level check in RPC)
- `selected_package_id uuid` (captured at signup)
- `contact_person text`, `contact_phone text`, `kra_pin text`, `business_reg_no text`
- `email_verified_at timestamptz`
- `applied_at timestamptz default now()`, `expires_at timestamptz`

New table `public.tenant_approval_events` (audit log): `business_id`, `actor_id`, `event_type` (`submitted|approved|rejected|info_requested|info_provided|expired|resubmitted`), `notes`, `metadata jsonb`, `created_at`.

New table `public.app_config` row `tenant_approval_expiry_days` (default 14) — or reuse `app_settings`.

RLS: businesses row visible to super admins always; to owner only when approved OR to see own status. `tenant_approval_events` readable by super admins + owner (excluding internal-notes events). GRANTs on new table.

Trigger: on business insert, insert `submitted` event + set `expires_at = now() + interval '<config> days'`. Cron: daily job flips stale `pending` → `expired`.

## Part 3 — RPCs (SECURITY DEFINER)

- `approve_tenant(_business_id, _notes)` — sets status, creates 1-month subscription from `selected_package_id`, enqueues email, writes audit event.
- `reject_tenant(_business_id, _reason)` — status + audit + email.
- `request_tenant_info(_business_id, _message)` — status `info_requested` + email.
- `add_tenant_internal_note(_business_id, _note)` — appends to `internal_notes`, audit only visible to SA.
- `resend_verification_email(_business_id)`.

All guarded by `is_super_admin(auth.uid())`.

## Part 4 — Signup flow

`Onboarding.tsx`:
- Add fields: Contact Person, Phone, KRA PIN, Business Registration No, Plan select (from `get_public_subscription_packages`).
- Insert business with `approval_status='pending'` and captured fields.
- Trigger email verification (Supabase default) — block approval until `email_verified_at` set (webhook on auth user confirmation updates the business).
- Sign out, redirect to `/signin?pending=1`.

`SignIn.tsx`:
- After successful `signInWithPassword`, fetch profile → business `approval_status`. If not `approved`, sign out and show status-specific banner (pending / rejected reason / info requested message / expired).

## Part 5 — Super Admin UI

New route `/super-admin/tenant-approvals` (add to `SuperAdminLayout` sidebar with badge count of pending).

Page `SuperAdminTenantApprovals.tsx`:
- Table columns: Company, Contact Person, Email, Phone, Plan, Registered, Status.
- Search input + status filter tabs (All / Pending / Info Requested / Approved / Rejected / Expired).
- Row actions open a Details drawer with: full info, KRA PIN, reg no, email verified state, audit timeline, internal notes editor, and buttons: Approve, Reject (reason modal), Request Info (message modal).

Dashboard widget on `SuperAdminDashboard`: "Pending Approvals" count card linking to the page.

`NotificationBell` (super admin variant): show badge when new pending business inserted (realtime subscription on `businesses` where `approval_status='pending'`).

## Part 6 — Email notifications

Register three transactional templates in `supabase/functions/_shared/transactional-email-templates/`:
- `tenant-approved`
- `tenant-rejected` (includes reason)
- `tenant-info-requested` (includes message)

RPCs invoke `send-transactional-email` for the tenant owner. Prereq: email infra already scaffolded (already set up in earlier turns).

## Part 7 — Enhancements checklist

- Email verification gate: block approve action if `email_verified_at IS NULL`; show warning.
- KRA PIN validation: regex `^[AP]\d{9}[A-Z]$` on onboarding + super admin display.
- Info-request path implemented above.
- Auto-expiry cron implemented above.
- Internal notes on business record.
- Dashboard widget + notification bell realtime badge.

## Files touched

New:
- `src/pages/super-admin/SuperAdminTenantApprovals.tsx`
- `src/components/super-admin/TenantApprovalDetailDrawer.tsx`
- `supabase/functions/_shared/transactional-email-templates/tenant-approved.tsx` (+ rejected, info-requested)
- migration file (schema + RPCs + cron)

Edited:
- `src/pages/Onboarding.tsx`, `src/pages/SignIn.tsx`
- `src/App.tsx` (route)
- `src/components/super-admin/SuperAdminLayout.tsx` (nav + badge)
- `src/pages/super-admin/SuperAdminDashboard.tsx` (widget)
- `src/components/NotificationBell.tsx` (SA realtime badge)
- `supabase/functions/_shared/transactional-email-templates/registry.ts`

## Open question

Should already-existing businesses be grandfathered as `approved`? Default plan: yes — migration backfills `approval_status='approved'` for all current rows so no one is locked out.
