// Admin user management - Super Admin or Tenant Admin
// Actions: create_user | update_user | reset_password | set_password | delete_user
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Action =
  | "create_user"
  | "update_user"
  | "reset_password"
  | "set_password"
  | "delete_user";

interface Payload {
  action: Action;
  business_id: string;
  // create / update
  user_id?: string;
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  role?: "admin" | "manager" | "cashier" | "stores_manager";
  is_active?: boolean;
  assigned_location_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth token" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const body = (await req.json()) as Payload;
    if (!body.action || !body.business_id) return json({ error: "Missing action/business_id" }, 400);

    // Authorize: caller must be super admin OR admin of the target business
    const { data: isSA } = await admin.rpc("is_super_admin", { _user_id: callerId });
    let allowed = !!isSA;
    if (!allowed) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("business_id", body.business_id)
        .eq("role", "admin")
        .maybeSingle();
      allowed = !!roleRow;
    }
    if (!allowed) return json({ error: "Forbidden — admin access required" }, 403);

    switch (body.action) {
      case "create_user": {
        if (!body.email || !body.password || !body.role) {
          return json({ error: "email, password and role are required" }, 400);
        }
        // Create auth user (auto-confirm so they can sign in immediately)
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: body.email,
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: body.full_name || "" },
        });
        if (createErr || !created.user) return json({ error: createErr?.message || "Create failed" }, 400);
        const newUserId = created.user.id;

        // Upsert profile with business_id (handle_new_user trigger creates the row)
        const { error: profErr } = await admin
          .from("profiles")
          .upsert({
            id: newUserId,
            email: body.email,
            full_name: body.full_name || null,
            phone: body.phone || null,
            business_id: body.business_id,
            assigned_location_id: body.assigned_location_id || null,
            is_active: body.is_active ?? true,
          });
        if (profErr) return json({ error: profErr.message }, 400);

        // Assign role
        const { error: roleErr } = await admin
          .from("user_roles")
          .insert({ user_id: newUserId, business_id: body.business_id, role: body.role });
        if (roleErr) return json({ error: roleErr.message }, 400);

        return json({ ok: true, user_id: newUserId });
      }

      case "update_user": {
        if (!body.user_id) return json({ error: "user_id required" }, 400);

        // Update auth email if changed
        if (body.email) {
          const { error } = await admin.auth.admin.updateUserById(body.user_id, {
            email: body.email,
            user_metadata: { full_name: body.full_name || "" },
          });
          if (error) return json({ error: error.message }, 400);
        }

        const profileUpdate: Record<string, unknown> = {};
        if (body.full_name !== undefined) profileUpdate.full_name = body.full_name;
        if (body.phone !== undefined) profileUpdate.phone = body.phone || null;
        if (body.email !== undefined) profileUpdate.email = body.email;
        if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;
        if (body.assigned_location_id !== undefined)
          profileUpdate.assigned_location_id = body.assigned_location_id || null;

        if (Object.keys(profileUpdate).length > 0) {
          const { error } = await admin.from("profiles").update(profileUpdate).eq("id", body.user_id);
          if (error) return json({ error: error.message }, 400);
        }

        if (body.role) {
          await admin.from("user_roles").delete()
            .eq("user_id", body.user_id).eq("business_id", body.business_id);
          const { error } = await admin.from("user_roles")
            .insert({ user_id: body.user_id, business_id: body.business_id, role: body.role });
          if (error) return json({ error: error.message }, 400);
        }

        return json({ ok: true });
      }

      case "set_password": {
        if (!body.user_id || !body.password) return json({ error: "user_id and password required" }, 400);
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          password: body.password,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "reset_password": {
        if (!body.email) return json({ error: "email required" }, 400);
        const redirectTo = `${SUPABASE_URL.replace(".supabase.co", "")}` // not used; client handles redirect
        const { error } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: body.email,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "delete_user": {
        if (!body.user_id) return json({ error: "user_id required" }, 400);
        // Remove role first
        await admin.from("user_roles").delete()
          .eq("user_id", body.user_id).eq("business_id", body.business_id);
        // Detach from business
        await admin.from("profiles").update({ business_id: null, is_active: false }).eq("id", body.user_id);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("admin-manage-user error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
