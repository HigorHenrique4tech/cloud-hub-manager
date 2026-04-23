import { useOrgWorkspace } from '../../contexts/OrgWorkspaceContext';

/**
 * Frontend mirror of backend/app/core/permissions.py — ROLE_PERMISSIONS.
 * Keep in sync with the backend whenever roles or permissions change.
 *
 * Note: the backend is always the authoritative enforcer.
 * This file only controls UI visibility (show/hide buttons, sections, etc.).
 */
const ROLE_PERMISSIONS = {
  // owner has everything
  owner: null,

  // admin: all except org.delete
  admin: new Set([
    'org.settings.view', 'org.settings.edit',
    'org.members.view', 'org.members.manage',
    'workspace.create', 'workspace.edit', 'workspace.delete',
    'accounts.view', 'accounts.create', 'accounts.delete',
    'resources.view', 'resources.create', 'resources.start_stop',
    'resources.delete', 'resources.manage',
    'costs.view',
    'alerts.view', 'alerts.manage',
    'logs.view',
    'finops.view', 'finops.recommend', 'finops.execute', 'finops.budget',
    'templates.view', 'templates.manage',
    'webhooks.view', 'webhooks.manage',
    'm365.view', 'm365.manage',
    'helpdesk.manage',
  ]),

  // operator: cloud operations, no org/billing management, no resource delete
  operator: new Set([
    'accounts.view',
    'resources.view', 'resources.create', 'resources.start_stop', 'resources.manage',
    'costs.view',
    'alerts.view', 'alerts.manage',
    'logs.view',
    'finops.view', 'finops.recommend',
    'schedules.view', 'schedules.manage',
    'templates.view', 'templates.manage',
    'webhooks.view', 'webhooks.manage',
    'm365.view', 'm365.manage',
  ]),

  // viewer: read-only across all modules
  viewer: new Set([
    'accounts.view',
    'resources.view',
    'costs.view',
    'alerts.view',
    'logs.view',
    'finops.view',
    'schedules.view',
    'templates.view',
    'webhooks.view',
    'm365.view',
  ]),

  // billing: cost/finance focus + alert management + budget management
  billing: new Set([
    'costs.view',
    'alerts.view', 'alerts.manage',
    'logs.view',
    'finops.view', 'finops.recommend', 'finops.budget',
    'schedules.view',
    'templates.view',
    'm365.view',
  ]),

  // helpdesk: platform-level support agents (org role only used for platform admins)
  helpdesk: new Set([
    'helpdesk.manage',
  ]),
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
 * Uses workspace effective role when available (role_override takes precedence).
 *
 * <PermissionGate permission="resources.start_stop"><Button /></PermissionGate>
 */
const PermissionGate = ({ permission, children, fallback = null }) => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();

  // Workspace role_override takes precedence over org role
  const role = currentWorkspace?.effective_role || currentOrg?.role;

  if (!hasPermission(role, permission)) return fallback;
  return children;
};

/**
 * Renders children only if the user's role is in the allowed list.
 * <RoleGate allowed={["owner","admin"]}><AdminPanel /></RoleGate>
 */
export const RoleGate = ({ allowed, children, fallback = null }) => {
  const { currentOrg, currentWorkspace } = useOrgWorkspace();
  const role = currentWorkspace?.effective_role || currentOrg?.role;

  if (!hasAnyRole(role, allowed)) return fallback;
  return children;
};

export default PermissionGate;
