export type Role = 'boss' | 'manager' | 'admin';

export const ROUTE_ACCESS: Record<string, Role[]> = {
  '/dashboard':          ['boss', 'manager', 'admin'],
  '/dashboard/agenda':   ['manager', 'admin'],
  '/dashboard/forecast': ['boss', 'manager', 'admin'],
  '/dashboard/brands':   ['boss', 'manager', 'admin'],
  '/dashboard/seasonal': ['boss', 'manager', 'admin'],
  '/dashboard/assistant': ['boss', 'manager', 'admin'],
};

export const ROLE_LABELS: Record<Role, string> = {
  boss:    'Director',
  manager: 'Manager',
  admin:   'IT Admin',
};

export function canAccess(role: string | null | undefined, href: string): boolean {
  const allowed = ROUTE_ACCESS[href];
  if (!allowed) return true;
  return !!role && allowed.includes(role as Role);
}

export function readRole(): Role | null {
  if (typeof window === 'undefined') return null;
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return (u.role as Role) ?? null;
  } catch {
    return null;
  }
}
