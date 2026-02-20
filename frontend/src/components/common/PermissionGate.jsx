import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

const ROLE_PERMISSIONS = {
  owner: null, // all permissions
  admin: new Set([
    'org.settings.view', 'org.settings.edit', 'org.members.view', 'org.members.manage',
    'workspace.create', 'workspace.edit', 'workspace.delete',
    'accounts.view', 'accounts.create', 'accounts.delete',
    'resources.view', 'resources.create', 'resources.start_stop', 'resources.delete',
    'costs.view', 'alerts.view', 'alerts.manage', 'logs.view',
  ]),
  operator: new Set(['resources.view', 'resources.create', 'resources.start_stop', 'logs.view', 'finops.view', 'finops.recommend']),
  viewer: new Set(['resources.view', 'logs.view', 'finops.view']),
  billing: new Set(['costs.view', 'alerts.view', 'alerts.manage', 'logs.view', 'finops.view', 'finops.recommend']),
};

export function hasPermission(role, permission) {
  if (!role) return false;
  if (role === 'owner') return true;
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.has(permission) : false;
}

export function hasAnyRole(role, allowedRoles) {
  if (!role) return false;
  return allowedRoles.includes(role);
}

/**
 * Renders children only if the current user has the specified permission.
 * <PermissionGate permission="resources.start_stop"><Button /></PermissionGate>
 */
const PermissionGate = ({ permission, children, fallback = null }) => {
  const { currentOrg } = useOrgWorkspace();
  const role = currentOrg?.role;

  if (!hasPermission(role, permission)) return fallback;
  return children;
};

/**
 * Renders children only if the user's org role is in the allowed list.
 * <RoleGate allowed={["owner","admin"]}><AdminPanel /></RoleGate>
 */
export const RoleGate = ({ allowed, children, fallback = null }) => {
  const { currentOrg } = useOrgWorkspace();
  const role = currentOrg?.role;

  if (!hasAnyRole(role, allowed)) return fallback;
  return children;
};

export default PermissionGate;
