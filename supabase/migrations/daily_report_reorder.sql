-- Lets staff (own branch) and management rearrange a branch's brand list.
--
-- Takes the brand ids in the wanted order and numbers them 1..N in one statement, so
-- a reorder is atomic (never half-applied) and cannot leave duplicate positions.
-- SECURITY INVOKER (the default): runs as the caller, so the existing update policy on
-- report_brands (app.can_edit_brands) decides which rows change. Ids belonging to a
-- different branch, or ones the caller may not edit, are silently left alone.
create function public.reorder_report_brands(p_branch text, p_ids uuid[])
returns void language plpgsql set search_path = ''
as $$
begin
  update public.report_brands b
     set sort_order = t.pos
    from unnest(p_ids) with ordinality as t(id, pos)
   where b.id = t.id and b.branch_code = p_branch;
end;
$$;
revoke all on function public.reorder_report_brands(text, uuid[]) from public, anon;
grant execute on function public.reorder_report_brands(text, uuid[]) to authenticated;
