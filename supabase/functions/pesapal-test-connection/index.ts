import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { corsHeaders, getPesapalToken, type PesapalEnv } from "../_shared/pesapal.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: roleRow } = await admin
      .from("super_admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const env = (body?.environment === "live" ? "live" : "sandbox") as PesapalEnv;

    const token = await getPesapalToken(env);
    return json({ ok: true, environment: env, token_preview: token.slice(0, 12) + "..." });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : "error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
