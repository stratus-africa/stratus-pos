import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

const supportSchema = z.object({ business_id: z.string().uuid() });

export const createSupportSession = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(supportSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { assertSuperAdmin } = await import('@/lib/superAdmin.server');
    await assertSuperAdmin(supabaseAdmin, context.userId);

    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .select('id,name,owner_id,is_active')
      .eq('id', data.business_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!business?.owner_id) throw new Error('Tenant owner not found');

    const { data: owner, error: ownerError } = await supabaseAdmin.auth.admin.getUserById(business.owner_id);
    if (ownerError || !owner?.user?.email) throw new Error('Tenant owner email not found');

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: owner.user.email,
    });
    if (linkError || !link?.properties?.action_link) throw new Error(linkError?.message || 'Could not create support session');

    await supabaseAdmin.from('audit_logs').insert({
      business_id: business.id,
      user_id: context.userId,
      action: 'support_session_started',
      entity_type: 'business',
      entity_id: business.id,
      description: `Support session opened for ${business.name}`,
      metadata: { support_mode: true, owner_id: business.owner_id },
    });

    return { actionLink: link.properties.action_link, tenantName: business.name };
  });
