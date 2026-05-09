import { supabase } from "@/integrations/supabase/client";

export interface AuditLogEntry {
  business_id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Write a row into the audit_logs table. Best-effort; never throws.
 * Captures user identity from the active Supabase session.
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let user_email: string | null = user?.email ?? null;
    let user_name: string | null = (user?.user_metadata as any)?.full_name ?? null;
    if (user?.id && (!user_name || !user_email)) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      user_email = user_email || profile?.email || null;
      user_name = user_name || profile?.full_name || null;
    }
    await (supabase as any).from("audit_logs").insert({
      business_id: entry.business_id,
      user_id: user?.id ?? null,
      user_email,
      user_name,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      description: entry.description ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    // Swallow — audit logging must never break the user flow
    console.warn("audit log failed", err);
  }
}
