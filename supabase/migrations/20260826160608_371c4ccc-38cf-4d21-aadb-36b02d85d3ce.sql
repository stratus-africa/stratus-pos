create or replace function public.banking_has_permission(_business_id uuid, _permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.business_id = _business_id
      and ur.role = 'admin'::app_role
  )
  or exists (
    select 1
    from public.role_permissions rp
    join public.user_roles ur
      on ur.business_id = rp.business_id
     and ur.role = rp.role
    where rp.business_id = _business_id
      and rp.permission = _permission
      and ur.user_id = auth.uid()
  );
$$;