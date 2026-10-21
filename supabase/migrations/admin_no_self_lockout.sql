-- Stops an IT Admin locking themselves out.
--
-- Found in review: profiles_admin_update lets an admin update any profile,
-- their own included, so one click on their own "Disable" button (or a
-- direct API call changing their own role) would end their access to the
-- console, with possibly no other admin left to undo it. The console hides
-- that button for the signed-in admin, but a hidden button is not a
-- boundary, so the rule lives here.
--
-- Another admin can still disable or change this account; only changing
-- your OWN is_active or role is refused. must_change_password and
-- display_name on your own row are unaffected.

create function app.prevent_admin_self_lockout()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.id = auth.uid()
     and (new.is_active is distinct from old.is_active
          or new.role is distinct from old.role) then
    raise exception 'you cannot disable your own account or change your own role';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_lockout before update on public.profiles
  for each row execute function app.prevent_admin_self_lockout();
