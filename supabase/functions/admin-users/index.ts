// Edge Function: admin-users
//
// The ONE place in this whole system that holds the Supabase service-role
// key — the credential that bypasses Row Level Security entirely. It never
// goes to the browser, never goes in an env var the Next.js app reads
// (NEXT_PUBLIC_* or otherwise), and never goes in this repo except as the
// name of an environment variable Supabase itself injects at runtime.
// See docs/REPAIR_MODULE_SPEC.md §12 — a leaked key exactly like this one
// is why the original MPT Supabase project was abandoned rather than reused.
//
// Two actions: creating a login account, and resetting a password. Both
// need auth.admin.* calls, which only the service-role key can make — that
// is the ONLY reason this exists as a server-side function instead of a
// plain database RPC like create_repair_job. Every other admin action
// (deactivating a user, changing a role/branch) is an ordinary `profiles`
// UPDATE the browser already does directly, because profiles_admin_update
// already lets an admin do that under RLS — no elevated key required.
//
// Security model: re-derive "is this caller an admin" from their OWN
// verified JWT on every request, via a client scoped to their own
// Authorization header (so RLS's profiles_read_self policy is what lets them
// read their own role — no special-casing needed). Never trust a body field
// claiming a role. Only after that check passes does the service-role client
// get touched at all.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// A random temporary password nobody chose and nobody but this function
// ever sees in plaintext — it's handed back once, for the admin to relay to
// the new/reset account out of band, and must_change_password forces a real
// password before that account can do anything else.
function randomPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 20);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Caller-scoped client — identifies who is asking, under their own RLS.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

    const { data: callerProfile, error: profileErr } = await callerClient
      .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (profileErr || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return json({ error: 'Only an active IT Admin may perform this action' }, 403);
    }

    // Only now — after re-deriving the role from a verified JWT, not a
    // request body — does the elevated client ever get created.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    if (body.action === 'create') {
      const { email, role, branch_code, display_name } = body;
      if (!email || !role || !display_name) {
        return json({ error: 'email, role, and display_name are required' }, 400);
      }
      if (role === 'staff' && !branch_code) {
        return json({ error: 'a staff account requires a branch' }, 400);
      }
      if (role !== 'staff' && branch_code) {
        return json({ error: 'only a staff account carries a branch' }, 400);
      }

      const tempPassword = randomPassword();
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
      });
      if (createErr || !created.user) {
        return json({ error: createErr?.message ?? 'Could not create the account' }, 400);
      }

      const { error: profileInsertErr } = await adminClient.from('profiles').insert({
        id: created.user.id, role, branch_code: branch_code ?? null, display_name,
        is_active: true, must_change_password: true, email,
      });
      if (profileInsertErr) {
        // Without a matching profile, every RLS policy in this schema joins
        // through `profiles` and denies the account everywhere anyway — but
        // an orphaned auth.users row with no role is confusing to find later.
        // Roll it back rather than leave it dangling.
        await adminClient.auth.admin.deleteUser(created.user.id);
        return json({ error: profileInsertErr.message }, 400);
      }

      await adminClient.from('admin_audit_log').insert({
        actor: user.id, action: 'account_created', target_user_id: created.user.id,
        details: { email, role, branch_code: branch_code ?? null },
      });

      return json({ email, temporary_password: tempPassword, user_id: created.user.id });
    }

    if (body.action === 'reset_password') {
      const { user_id } = body;
      if (!user_id) return json({ error: 'user_id is required' }, 400);

      const tempPassword = randomPassword();
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(user_id, {
        password: tempPassword,
      });
      if (updateErr) return json({ error: updateErr.message }, 400);

      await adminClient.from('profiles').update({ must_change_password: true }).eq('id', user_id);
      await adminClient.from('admin_audit_log').insert({
        actor: user.id, action: 'password_reset', target_user_id: user_id, details: {},
      });

      return json({ temporary_password: tempPassword });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
