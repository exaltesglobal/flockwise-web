import { adminSession } from '@/api/client';
import type { Permission, StaffRole } from '@/api/admin-types';
import { isBuiltIn, PERMISSIONS, ROLE_LABELS } from '@/core/perms';

import { useSession } from './session';

export { ROLE_LABELS };
/** The built-in roles a church can hand out (custom roles come from the API). */
export const ROLES = (Object.keys(ROLE_LABELS) as StaffRole[]).filter((r) => r !== 'custom');

/** What the signed-in staff member may do. Sessions saved before roles had permissions fall back to the role's defaults. */
export function usePermissions(): Set<Permission> {
  const session = useSession(adminSession);
  const staff = session?.staff;
  if (!staff) return new Set();
  return new Set(staff.permissions ?? (isBuiltIn(staff.role) ? PERMISSIONS[staff.role] : []));
}

export function useCan() {
  const perms = usePermissions();
  return (...any: Permission[]) => any.some((p) => perms.has(p));
}
