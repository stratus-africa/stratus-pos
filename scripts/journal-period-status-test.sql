-- Journal posting end-to-end verification per accounting period status.
-- Simulates an authenticated admin via request.jwt.claims, runs
-- create -> approve -> post (and reverse) for OPEN/CLOSED/LOCKED periods,
-- verifies audit logging, then RAISES the results so everything rolls back.
-- Adjust v_biz / v_user to a real business + admin user before running.
do $$
declare
  v_biz  uuid := '14bebd7b-075f-4f30-aec0-585a86dfaf63';
  v_user uuid := 'c5328d57-52e9-4ad3-8b85-799193518b1d';
  v_approver uuid := 'a41e78d6-9ebf-4461-aae1-82932c30a975'; -- second admin of same business (maker/checker)
  v_acc1 uuid; v_acc2 uuid;
  v_j uuid;
  v_lines jsonb;
  v_results text := '';
  v_audit int;
  v_status text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select id into v_acc1 from public.chart_of_accounts
   where business_id = v_biz and is_active order by code limit 1;
  select id into v_acc2 from public.chart_of_accounts
   where business_id = v_biz and is_active and id <> v_acc1 order by code limit 1;
  if v_acc1 is null or v_acc2 is null then
    raise exception 'SETUP_FAIL: business needs 2 active accounts';
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_acc1, 'debit', 100, 'credit', 0),
    jsonb_build_object('account_id', v_acc2, 'debit', 0, 'credit', 100));

  insert into public.accounting_periods(business_id, period_start, period_end, status, fiscal_year)
  values (v_biz, date '2020-01-01', date '2020-01-31', 'closed', 2020),
         (v_biz, date '2020-02-01', date '2020-02-29', 'locked', 2020)
  on conflict do nothing;

  -- OPEN period (current month): full lifecycle must succeed
  v_j := public.create_manual_journal(current_date, 'TEST-OPEN', 'open period test', v_lines, true);
  -- maker/checker: approver must differ from creator
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_approver, 'role', 'authenticated')::text, true);
  perform public.approve_manual_journal(v_j);
  perform public.post_manual_journal(v_j);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select status into v_status from public.journal_entries where id = v_j;
  select count(*) into v_audit from public.accounting_audit_log where journal_entry_id = v_j;
  v_results := v_results || format('[OPEN] create+approve+post OK, status=%s, audit_rows=%s | ', v_status, v_audit);

  -- Reversal inside an open period must also succeed
  begin
    perform public.reverse_manual_journal(v_j);
    select status into v_status from public.journal_entries where id = v_j;
    v_results := v_results || format('[OPEN] reverse OK, status=%s | ', v_status);
  exception when others then
    v_results := v_results || '[OPEN] reverse FAILED: ' || left(SQLERRM, 100) || ' | ';
  end;

  -- CLOSED period: posting must be blocked
  begin
    v_j := public.create_manual_journal(date '2020-01-15', 'TEST-CLOSED', 'closed period test', v_lines, true);
    perform public.approve_manual_journal(v_j);
    perform public.post_manual_journal(v_j);
    v_results := v_results || '[CLOSED] UNEXPECTEDLY ALLOWED | ';
  exception when others then
    v_results := v_results || '[CLOSED] blocked: ' || left(SQLERRM, 100) || ' | ';
  end;

  -- LOCKED period: posting must be blocked
  begin
    v_j := public.create_manual_journal(date '2020-02-15', 'TEST-LOCKED', 'locked period test', v_lines, true);
    perform public.approve_manual_journal(v_j);
    perform public.post_manual_journal(v_j);
    v_results := v_results || '[LOCKED] UNEXPECTEDLY ALLOWED | ';
  exception when others then
    v_results := v_results || '[LOCKED] blocked: ' || left(SQLERRM, 100) || ' | ';
  end;

  -- Raise to force ROLLBACK: no test data is persisted.
  raise exception 'TEST_RESULTS_ROLLBACK %', v_results;
end $$;
