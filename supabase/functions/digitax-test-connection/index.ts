// deno-lint-ignore-file
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const claims = await client.auth.getClaims(auth.slice(7));
  if (claims.error) return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const body = await req.json().catch(() => ({}));
    // Simulate a quick reachability probe. Real client is swapped in later.
    const provider = body.provider ?? "mock";
    if (provider === "mock") {
      return json({ ok: true, message: "Mock DigiTax sandbox reachable (simulated)" });
    }
    // For the real provider, we'd hit /health with the stored API key.
    return json({ ok: true, message: "DigiTax provider connected (stubbed)" });
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
