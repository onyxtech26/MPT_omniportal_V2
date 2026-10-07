// Four roles now (was three) — 'staff' is new, one shared login per branch.
// This must match the public.user_role enum in Supabase exactly; if you add a
// role here, add it there too (and vice versa) or profile rows and this file
// will silently disagree about what roles exist.
export type Role = 'boss' | 'manager' | 'admin' | 'staff';

export const ROUTE_ACCESS: Record<string, Role[]> = {
  // Sales screens are the Director's and Manager's. IT Admin is deliberately
  // NOT listed: the sales CSV lives only in the browser of whoever loads it,
  // so an admin here would see an empty dashboard, and nothing an admin does
  // (accounts, branches, audit log, repair support) needs sales figures.
  '/dashboard':             ['boss', 'manager'],
  '/dashboard/brands':      ['boss', 'manager'],
  '/dashboard/leaderboard': ['boss', 'manager'],
  '/dashboard/explorer':    ['boss', 'manager'],
  // Branch work: staff, the Manager, and IT Admin (support). The Director is
  // deliberately NOT listed — the owner asked that the boss account not see
  // Repairs or the Daily Report at all; it only uses the sales dashboard. The
  // database enforces the same split (see
  // supabase/migrations/boss_no_branch_ops.sql), so this is not just hidden UI.
  // The finer "only staff/manager may actually submit" rules live inside the
  // pages and, for real, in RLS.
  //
  // Every sub-route needs its own entry because canAccess denies by default:
  // forgetting one here doesn't make the page insecure, it makes it UNREACHABLE.
  '/repairs':               ['staff', 'manager', 'admin'],
  '/repairs/new':           ['staff', 'manager', 'admin'],
  '/repairs/slip':          ['staff', 'manager', 'admin'],
  // Daily Report — the branch's daily sales entry, monthly view and brand
  // setup. Same gate as /repairs; staff only see their own branch, only
  // staff/manager may enter figures, admin is read-only (RLS, see
  // supabase/migrations/daily_report.sql).
  '/daily-report':          ['staff', 'manager', 'admin'],
  // The console itself: admin only, matching the owner's decision that IT
  // Admin administers accounts, not the other way round (boss has DB-level
  // read access to the audit log per its RLS policy, but no route here yet —
  // a deliberate, narrower v1 surface; see docs/REPAIR_MODULE_SPEC.md §4.3).
  '/admin':                 ['admin'],
  '/admin/users':           ['admin'],
  '/admin/branches':        ['admin'],
  '/admin/audit':           ['admin'],
};

// Reachable by every role, not gated by the map above — a forced password
// change must never be blockable by canAccess, since it runs BEFORE the
// normal per-role check in every guarded layout (see app/dashboard/layout.tsx
// and app/repairs/layout.tsx).
export const PASSWORD_CHANGE_ROUTE = '/change-password';

export const ROLE_LABELS: Record<Role, string> = {
  boss:    'Director',
  manager: 'Manager',
  admin:   'IT Admin',
  staff:   'Retail Staff',
};

// Where a role lands right after signing in, and where canAccess sends it if
// it tries a route it cannot reach. Deliberately NOT a single hardcoded
// '/dashboard' — staff cannot reach /dashboard (see ROUTE_ACCESS above), and
// bouncing them there would either loop or silently show them the sales
// dashboard the guard was supposed to be hiding. Each role gets a landing
// page it is actually allowed to be on.
export const DEFAULT_ROUTE_FOR_ROLE: Record<Role, string> = {
  boss:    '/dashboard',
  manager: '/dashboard',
  admin:   '/admin/users',
  staff:   '/repairs',
};

export function canAccess(role: string | null | undefined, href: string): boolean {
  // next.config.ts sets trailingSlash: true (load-bearing for the static
  // export, see that file's comment), and the App Router's usePathname() has
  // been observed returning both forms depending on how a route was reached
  // (a fresh load vs a client-side push). Normalising here means every entry
  // in ROUTE_ACCESS is written once, in one form, instead of needing a
  // trailing-slash twin for every route — the bug that made /repairs/new
  // unreachable until this fix.
  const normalised = href.length > 1 && href.endsWith('/') ? href.slice(0, -1) : href;
  const allowed = ROUTE_ACCESS[normalised];
  // Deny by default. A route not yet listed here is unreachable until someone
  // deliberately grants it, rather than open to everyone until someone
  // remembers to lock it down.
  if (!allowed) return false;
  return !!role && allowed.includes(role as Role);
}

export function defaultRouteFor(role: string | null | undefined): string {
  if (role && role in DEFAULT_ROUTE_FOR_ROLE) {
    return DEFAULT_ROUTE_FOR_ROLE[role as Role];
  }
  return '/';
}
