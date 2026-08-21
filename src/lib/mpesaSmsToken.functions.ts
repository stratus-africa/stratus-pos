import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureAdminAccess } from "./mpesaCredentials.server";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const getMpesaSmsTokenStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);
    const { data: row } = await supabaseAdmin
      .from("mpesa_sms_ingest_tokens")
      .select("token_prefix,created_at,updated_at")
      .eq("business_id", data.business_id)
      .maybeSingle();
    return { configured: !!row, token_prefix: row?.token_prefix ?? null, updated_at: row?.updated_at ?? null };
  });

export const generateMpesaSmsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);
    const token = `mp_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const hash = await sha256(token);
    const prefix = token.slice(0, 10);
    const { error } = await supabaseAdmin.from("mpesa_sms_ingest_tokens").upsert({
      business_id: data.business_id,
      token_hash: hash,
      token_prefix: prefix,
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    if (error) throw error;
    return { token, token_prefix: prefix };
  });

export const revokeMpesaSmsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ business_id: z.string() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureAdminAccess(supabaseAdmin, context.userId, data.business_id);
    const { error } = await supabaseAdmin.from("mpesa_sms_ingest_tokens").delete().eq("business_id", data.business_id);
    if (error) throw error;
    return { ok: true };
  });
