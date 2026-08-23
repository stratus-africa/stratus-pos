import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const startSupportSessionInputSchema = z.object({
  business_id: z.string().uuid(),
  target_user_id: z.string().uuid(),
});
export type StartSupportSessionInput = z.infer<typeof startSupportSessionInputSchema>;

export const supportSessionInputSchema = z.object({
  support_session_id: z.string().uuid(),
});
export type SupportSessionInput = z.infer<typeof supportSessionInputSchema>;

const SESSION_MINUTES = 60;

export async function assertSuperAdmin(admin: SupabaseClient, callerId: string) {
  const { data, error } = await admin.rpc("is_super_admin", { _user_id: callerId });
  if (error || !data) throw new Error("Forbidden — Super Admin access required");
}

export async function handleStartSupportSession(
  admin: SupabaseClient,
  superAdminId: string,
  body: StartSupportSessionInput,
) {
  const db = admin as any;
  const [{ data: business, error: businessError }, { data: targetRole, error: roleError }] = await Promise.all([
    db.from("businesses").select("id, name, is_active").eq("id", body.business_id).maybeSingle(),
    db
      .from("user_roles")
      .select("role")
      .eq("user_id", body.target_user_id)
      .eq("business_id", body.business_id)
      .eq("role", "admin")
      .maybeSingle(),
  ]);

  if (businessError) throw new Error(businessError.message);
  if (roleError) throw new Error(roleError.message);
  if (!business) throw new Error("Tenant not found");
  if (!business.is_active) throw new Error("Cannot enter support mode for a suspended tenant");
  if (!targetRole) throw new Error("The selected user is not a tenant administrator for this business");

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, email, full_name, business_id, is_active")
    .eq("id", body.target_user_id)
    .eq("business_id", body.business_id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile?.email) throw new Error("Tenant administrator email could not be resolved");
  if (profile.is_active === false) throw new Error("The selected tenant administrator is inactive");

  // Only one live support session per target user. Revoke previous sessions first.
  await db
    .from("support_sessions")
    .update({ status: "revoked", ended_at: new Date().toISOString() })
    .eq("target_user_id", body.target_user_id)
    .eq("status", "active");

  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
  const { data: supportSession, error: sessionError } = await db
    .from("support_sessions")
    .insert({
      super_admin_id: superAdminId,
      target_user_id: body.target_user_id,
      business_id: body.business_id,
      status: "active",
      expires_at: expiresAt,
      metadata: { tenant_name: business.name, target_email: profile.email },
    })
    .select("id, expires_at")
    .single();

  if (sessionError || !supportSession) throw new Error(sessionError?.message || "Could not create support session");

  // Generate a one-time magic-link token server-side. The token is consumed by
  // the support tab with verifyOtp; the Super Admin's own session stays intact.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });

  if (linkError || !link?.properties?.hashed_token) {
    await db.from("support_sessions").delete().eq("id", supportSession.id);
    throw new Error(linkError?.message || "Could not issue support session credentials");
  }

  await db.from("audit_logs").insert({
    business_id: body.business_id,
    user_id: superAdminId,
    action: "support_session_started",
    entity_type: "support_session",
    entity_id: supportSession.id,
    description: `Super Admin entered support mode as ${profile.full_name || profile.email}`,
    metadata: {
      support_session_id: supportSession.id,
      super_admin_id: superAdminId,
      target_user_id: body.target_user_id,
      target_email: profile.email,
      business_id: body.business_id,
      expires_at: expiresAt,
    },
  });

  return {
    support_session_id: supportSession.id,
    token_hash: link.properties.hashed_token as string,
    target_email: profile.email,
    tenant_name: business.name,
    expires_at: expiresAt,
  };
}

export async function handleGetSupportSession(admin: SupabaseClient, targetUserId: string, supportSessionId: string) {
  const db = admin as any;
  const { data: session, error } = await db
    .from("support_sessions")
    .select("id, super_admin_id, target_user_id, business_id, status, started_at, expires_at, metadata")
    .eq("id", supportSessionId)
    .eq("target_user_id", targetUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!session) throw new Error("Support session not found");

  if (session.status !== "active" || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session.status === "active") {
      await db
        .from("support_sessions")
        .update({ status: "expired", ended_at: new Date().toISOString() })
        .eq("id", supportSessionId);
    }
    throw new Error("Support session has expired");
  }

  const [{ data: business }, { data: adminProfile }] = await Promise.all([
    db.from("businesses").select("id, name").eq("id", session.business_id).maybeSingle(),
    db.from("profiles").select("full_name, email").eq("id", session.super_admin_id).maybeSingle(),
  ]);

  return {
    id: session.id,
    business_id: session.business_id,
    tenant_name: business?.name || "Tenant",
    started_at: session.started_at,
    expires_at: session.expires_at,
    super_admin_name: adminProfile?.full_name || adminProfile?.email || "Super Admin",
  };
}

export async function handleEndSupportSession(admin: SupabaseClient, targetUserId: string, supportSessionId: string) {
  const db = admin as any;
  const { data: session, error } = await db
    .from("support_sessions")
    .select("id, super_admin_id, business_id, status")
    .eq("id", supportSessionId)
    .eq("target_user_id", targetUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!session) throw new Error("Support session not found");

  if (session.status === "active") {
    await db
      .from("support_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", supportSessionId);

    await db.from("audit_logs").insert({
      business_id: session.business_id,
      user_id: session.super_admin_id,
      action: "support_session_ended",
      entity_type: "support_session",
      entity_id: supportSessionId,
      description: "Super Admin exited support mode",
      metadata: {
        support_session_id: supportSessionId,
        super_admin_id: session.super_admin_id,
        target_user_id: targetUserId,
      },
    });
  }

  return { ok: true };
}
