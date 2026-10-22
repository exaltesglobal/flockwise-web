// Picks a role for an office login: one of the built-in roles, or a role the church made, with the
// zones, groups or teams that role covers. Used when inviting, on the team list and on a person's record.
import { useMemo } from 'react';

import type { RoleScope, StaffRole } from '@/api/admin-types';
import { AdminApi, type RoleChoice, type RoleView } from '@/api/endpoints';
import { Field, Loading } from '@/components/ui';
import { PERMISSIONS, ROLE_LABELS } from '@/core/perms';
import { PERMISSION_INFO, ROLE_SCOPES } from '@/core/types';
import { useApi } from '@/lib/use-api';

export const BUILT_IN: StaffRole[] = ['admin', 'pastor', 'finance', 'leader', 'coordinator', 'checkin'];
export const permLabel = (id: string) => PERMISSION_INFO.find((p) => p.id === id)?.label ?? id;

export type Choice = { role: StaffRole | 'none'; roleId?: string | null; scopeIds?: string[] };
export const asChoice = (x: { role: StaffRole | null; roleId?: string | null; scopeIds?: string[] } | null): Choice => (!x || !x.role ? { role: 'none' } : { role: x.role, roleId: x.roleId ?? null, scopeIds: x.scopeIds ?? [] });
export const choiceValue = (c: Choice) => (c.role === 'custom' && c.roleId ? `custom:${c.roleId}` : c.role);

export function RolePicker({ value, onChange, roles, allowNone, autoFocus }: { value: Choice; onChange: (c: Choice) => void; roles: RoleView[]; allowNone?: boolean; autoFocus?: boolean }) {
  const custom = value.role === 'custom' ? roles.find((r) => r.id === value.roleId) : undefined;
  const scope: RoleScope = custom?.scope ?? 'church';
  const zones = useApi(() => (scope === 'zone' ? AdminApi.zones.list() : Promise.resolve(null)), [scope]);
  const groups = useApi(() => (scope === 'group' ? AdminApi.groups.list().then((p) => p.data) : Promise.resolve(null)), [scope]);
  const teams = useApi(() => (scope === 'team' ? AdminApi.volunteers.teams() : Promise.resolve(null)), [scope]);
  const options = useMemo(() => (scope === 'zone' ? zones.data : scope === 'group' ? groups.data : scope === 'team' ? teams.data : null), [scope, zones.data, groups.data, teams.data]);
  const hint = value.role === 'none' ? 'No office access: they use the member app only.' : custom ? `${custom.description || 'A role this church made.'} Can: ${custom.permissions.map(permLabel).join(', ')}.` : value.role !== 'custom' ? `Can: ${PERMISSIONS[value.role as Exclude<StaffRole, 'custom'>].map(permLabel).join(', ')}.` : '';
  const ids = value.scopeIds ?? [];
  const toggle = (id: string) => onChange({ ...value, scopeIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  return (
    <>
      <Field label="Role" hint={hint}>
        <select className="select" autoFocus={autoFocus} value={choiceValue(value)} onChange={(e) => {
          const v = e.target.value;
          if (v === 'none') onChange({ role: 'none' });
          else if (v.startsWith('custom:')) onChange({ role: 'custom', roleId: v.slice(7), scopeIds: [] });
          else onChange({ role: v as StaffRole, roleId: null, scopeIds: [] });
        }}>
          {allowNone && <option value="none">No office access</option>}
          <optgroup label="Built-in roles">{BUILT_IN.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</optgroup>
          {roles.length > 0 && <optgroup label="This church’s roles">{roles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}</optgroup>}
        </select>
      </Field>
      {custom && scope !== 'church' && (
        <Field label={ROLE_SCOPES.find((x) => x.id === scope)!.label.replace('Their ', 'Which ').replace('(s)', 's')} hint={`They only see people in the ${scope}s ticked here.`}>
          {!options ? <Loading /> : options.length === 0 ? <span className="small muted">No {scope}s yet. Make one first.</span> : (
            <div className="stack" style={{ gap: 4 }}>
              {options.map((o) => <label key={o.id} className="check"><input type="checkbox" checked={ids.includes(o.id)} onChange={() => toggle(o.id)} /> {o.name}</label>)}
            </div>
          )}
        </Field>
      )}
    </>
  );
}

/** Turns the picker's value into what the API takes. */
export const toChoice = (c: Choice): RoleChoice | { role: null } => (c.role === 'none' ? { role: null } : c.role === 'custom' ? { role: 'custom', roleId: c.roleId, scopeIds: c.scopeIds ?? [] } : { role: c.role });
