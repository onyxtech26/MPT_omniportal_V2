import { supabase } from './supabase';
import type { Role } from './roles';

export type Profile = {
  id: string;
  role: Role;
  branch_code: string | null;
  display_name: string;
  email: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export type Branch = {
  code: string;
  name: string | null;
  phone: string | null;
  is_active: boolean;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Plain table reads/writes — these go through the normal authenticated
// client and are enforced by RLS exactly like everything else in the app.
// Only account CREATION and PASSWORD RESET need the Edge Function below,
// because only those two need the service-role key (auth.admin.* calls).
// Everything here, admin already has direct RLS permission to do.

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('role').order('branch_code');
  if (error) throw error;
  return data as Profile[];
}

export async function setProfileActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function listBranchesAdmin(): Promise<Branch[]> {
  const { data, error } = await supabase.from('branches').select('*').order('code');
  if (error) throw error;
  return data as Branch[];
}

export async function setBranchActive(code: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('branches').update({ is_active: isActive }).eq('code', code);
  if (error) throw error;
}

export async function setBranchName(code: string, name: string): Promise<void> {
  const { error } = await supabase.from('branches').update({ name }).eq('code', code);
  if (error) throw error;
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await supabase.from('admin_audit_log').select('*').order('at', { ascending: false }).limit(200);
  if (error) throw error;
  return data as AuditEntry[];
}

// ---------------------------------------------------------------------------
// The two actions that DO need the Edge Function — see
// supabase/functions/admin-users/index.ts for why. `supabase.functions.invoke`
// automatically attaches the caller's own session JWT as the Authorization
// header, which is what the function re-verifies before touching anything.

// The Edge Function always returns a JSON body, success or failure, but
// supabase-js's `error` on a non-2xx response only carries the raw Response
// in `error.context` — it doesn't parse the {error: "..."} body for you. This
// reads it either way, defensively, so admins see the function's own
// message ("a staff account requires a branch") rather than a generic
// "Edge Function returned a non-2xx status code".
async function invokeAdminUsers(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    let parsedMessage: string | null = null;
    if (context && typeof context === 'object' && 'json' in context && typeof (context as Response).json === 'function') {
      try {
        const parsed = await (context as Response).json();
        if (parsed?.error) parsedMessage = parsed.error as string;
      } catch {
        // response body wasn't JSON (or already consumed) — fall through
      }
    }
    throw new Error(parsedMessage ?? error.message);
  }
  if (data?.error) throw new Error(data.error as string);
  return data;
}

export async function createAccount(input: {
  email: string; role: Role; branchCode?: string; displayName: string;
}): Promise<{ email: string; temporary_password: string }> {
  return invokeAdminUsers({
    action: 'create', email: input.email, role: input.role,
    branch_code: input.branchCode, display_name: input.displayName,
  }) as Promise<{ email: string; temporary_password: string }>;
}

export async function resetAccountPassword(userId: string): Promise<{ temporary_password: string }> {
  return invokeAdminUsers({ action: 'reset_password', user_id: userId }) as Promise<{ temporary_password: string }>;
}
