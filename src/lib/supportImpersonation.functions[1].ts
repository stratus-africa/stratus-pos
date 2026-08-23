import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  startSupportSessionInputSchema,
  supportSessionInputSchema,
} from "@/lib/supportImpersonation.server";

export const startSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(startSupportSessionInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin, handleStartSupportSession } = await import("@/lib/supportImpersonation.server");
    await assertSuperAdmin(supabaseAdmin, context.userId);
    return handleStartSupportSession(supabaseAdmin, context.userId, data);
  });

export const getSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(supportSessionInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { handleGetSupportSession } = await import("@/lib/supportImpersonation.server");
    return handleGetSupportSession(supabaseAdmin, context.userId, data.support_session_id);
  });

export const endSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(supportSessionInputSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { handleEndSupportSession } = await import("@/lib/supportImpersonation.server");
    return handleEndSupportSession(supabaseAdmin, context.userId, data.support_session_id);
  });
