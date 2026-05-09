// Edge function to securely set/get/delete a business's M-Pesa Daraja credentials.
// Secrets are stored in Supabase Vault. The public table only stores a reference name.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SetPayload {
  action: "set";
  business_id: string;
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
}

interface CheckPayload {
  action: "check";
  business_id: string;
}

interface DeletePayload {
  action: "delete";
  business_id: string;
}

type Payload = SetPayload | CheckPayload | DeletePayload;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function vaultNames(businessId: string) {
  const safe = businessId.replace(/-/g, "");
  return {
    consumer_key: `mpesa_${safe}_consumer_key`,
    consumer_secret: `mpesa_${safe}_consumer_secret`,
    passkey: `mpesa_${safe}_passkey`,
  };
}

async function ensureAdminAccess(req: Request, businessId: string): Promise<string> {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Missing authorization");
  const token = auth.replace("Bearer ", "");

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) throw new Error("Invalid session");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await admin
    .from("profiles")
    .select("business_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  const { data: isSA } = await admin.rpc("is_super_admin", {
    _user_id: userData.user.id,
  });

  if (profile?.business_id !== businessId && !isSA) {
    throw new Error("Forbidden");
  }

  if (!isSA) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("business_id", businessId);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin role required");
  }

  return userData.user.id;
}

async function vaultUpsert(admin: any, name: string, secret: string) {
  // Try to find existing
  const { data: existing } = await admin
    .schema("vault")
    .from("secrets")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.rpc("update_vault_secret", {
      _id: existing.id,
      _secret: secret,
    });
    if (error) throw error;
  } else {
    const { error } = await admin.rpc("create_vault_secret", {
      _name: name,
      _secret: secret,
    });
    if (error) throw error;
  }
}

async function vaultDelete(admin: any, name: string) {
  await admin.schema("vault").from("secrets").delete().eq("name", name);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Payload;
    if (!body || !body.business_id) {
      return new Response(JSON.stringify({ error: "business_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await ensureAdminAccess(req, body.business_id);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const names = vaultNames(body.business_id);

    if (body.action === "check") {
      const { data } = await admin
        .from("business_payment_credentials")
        .select("has_credentials, updated_at")
        .eq("business_id", body.business_id)
        .eq("provider", "mpesa")
        .maybeSingle();
      return new Response(
        JSON.stringify({
          has_credentials: !!data?.has_credentials,
          updated_at: data?.updated_at ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.action === "set") {
      if (!body.consumer_key || !body.consumer_secret || !body.passkey) {
        return new Response(JSON.stringify({ error: "All fields required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        await vaultUpsert(admin, names.consumer_key, body.consumer_key);
        await vaultUpsert(admin, names.consumer_secret, body.consumer_secret);
        await vaultUpsert(admin, names.passkey, body.passkey);
      } catch (e) {
        // Vault helpers may not exist; fall back to a generic encrypted store could go here.
        console.error("Vault write failed", e);
        return new Response(
          JSON.stringify({
            error:
              "Vault not available. Please contact support to enable secret storage.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await admin
        .from("business_payment_credentials")
        .upsert(
          {
            business_id: body.business_id,
            provider: "mpesa",
            has_credentials: true,
            vault_secret_names: names,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id,provider" }
        );

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "delete") {
      await vaultDelete(admin, names.consumer_key);
      await vaultDelete(admin, names.consumer_secret);
      await vaultDelete(admin, names.passkey);
      await admin
        .from("business_payment_credentials")
        .update({ has_credentials: false, updated_at: new Date().toISOString() })
        .eq("business_id", body.business_id)
        .eq("provider", "mpesa");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("business-mpesa-credentials error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
