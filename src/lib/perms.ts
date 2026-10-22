import { adminSession } from '@/api/client';
import type { Permission, StaffRole } from '@/api/admin-types';
import { PERMISSIONS, ROLE_LABELS } from '@/core/perms';

import { useSession } from './session';

export { ROLE_LABELS };
export const ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

/** What the signed-in staff member may do. Sessions saved before roles had permissions fall back to the role's defaults. */
export function usePermissions(): Set<Permission> {
  const session = useSession(adminSession);
  const staff = session?.staff;
  if (!staff) return new Set();
  return new Set(staff.permissions ?? PERMISSIONS[staff.role] ?? []);
}

export function useCan() {
  const perms = usePermissions();
  return (...any: Permission[]) => any.some((p) => perms.has(p));
}
