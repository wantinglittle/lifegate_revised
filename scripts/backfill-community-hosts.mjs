import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_RELATIVE_PATH = 'migration-data/community-host-backfill-report.md';
const APPLY_CONFIRMATION = 'BACKFILL_COMMUNITY_HOSTS_APPLY';
const PLAN_CONFIRMATION = 'BACKFILL_COMMUNITY_HOSTS_PLAN';
const DEFAULT_DASHBOARD_REDIRECT_URL = 'https://lifegatecommunity.com/portal-callback.html';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE = 1000;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const reportPath = path.join(repoRoot, REPORT_RELATIVE_PATH);
const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const shouldPlan = args.includes('--plan');
const confirmArg = args.find((arg) => arg.startsWith('--confirm='));
const isApplyConfirmed = confirmArg === `--confirm=${APPLY_CONFIRMATION}`;
const isPlanConfirmed = confirmArg === `--confirm=${PLAN_CONFIRMATION}`;

function usage() {
  return [
    'Usage:',
    `  node .\\scripts\\backfill-community-hosts.mjs --plan --confirm=${PLAN_CONFIRMATION}`,
    `  node .\\scripts\\backfill-community-hosts.mjs --apply --confirm=${APPLY_CONFIRMATION}`,
    '',
    'Required environment for plan/apply:',
    '  SUPABASE_URL',
    '  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY',
    '',
    'Optional environment:',
    `  DASHBOARD_REDIRECT_URL (defaults to ${DEFAULT_DASHBOARD_REDIRECT_URL})`,
  ].join('\n');
}

function validateUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isBlank(value) {
  return String(value ?? '').trim().length === 0;
}

function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

function publicLabel(group) {
  return `${group.id ?? '(missing id)'} / ${String(group.title || '(untitled)').replace(/\r?\n/g, ' ')}`;
}

function escapeQueryValue(value) {
  return encodeURIComponent(String(value).replaceAll('"', '\\"'));
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers, rows) {
  if (!rows.length) return 'None.\n';
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  return `${[header, separator, ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)].join('\n')}\n`;
}

function createSummary() {
  return {
    communityHostsCreated: 0,
    communityHostsReused: 0,
    portalUsersCreated: 0,
    portalUsersReused: 0,
    portalUsersUpdated: 0,
    groupsAssigned: 0,
    groupsAlreadyAssigned: 0,
    adminsPreserved: 0,
    skippedBlankEmails: 0,
    skippedInvalidEmails: 0,
    ownershipConflicts: 0,
    invitationsSent: 0,
  };
}

function createDetails() {
  return {
    createdHosts: [],
    reusedHosts: [],
    createdPortalUsers: [],
    reusedPortalUsers: [],
    updatedPortalUsers: [],
    assignedGroups: [],
    alreadyAssignedGroups: [],
    preservedAdmins: [],
    skippedBlankEmails: [],
    skippedInvalidEmails: [],
    ownershipConflicts: [],
    authConflicts: [],
    portalConflicts: [],
    errors: [],
  };
}

function createResult() {
  return {
    summary: createSummary(),
    details: createDetails(),
    groupCount: 0,
    authUserCount: 0,
    portalUserCount: 0,
    failed: false,
    failingGroup: null,
    errorMessage: null,
  };
}

function sanitizeErrorMessage(message) {
  return String(message ?? '')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(/sb_secret_[A-Za-z0-9_]+/g, '[redacted-secret-key]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]');
}

function markFailure(result, group, error) {
  const errorMessage = sanitizeErrorMessage(error?.message ?? error);
  result.failed = true;
  result.failingGroup = group ? publicLabel(group) : null;
  result.errorMessage = errorMessage;
  result.details.errors.push([
    result.failingGroup || '(before group processing)',
    errorMessage,
  ]);
}

function deriveNameParts(group) {
  const firstFromGroup = typeof group.first_name === 'string' ? group.first_name.trim() : '';
  const lastFromGroup = typeof group.last_name === 'string' ? group.last_name.trim() : '';
  if (firstFromGroup || lastFromGroup) {
    return {
      firstName: firstFromGroup || null,
      lastName: lastFromGroup || null,
    };
  }

  const contactName = String(group.contact_name || '').trim();
  if (!contactName) {
    return { firstName: null, lastName: null };
  }

  const splitAt = contactName.search(/\s/);
  if (splitAt === -1) {
    return { firstName: contactName, lastName: null };
  }

  return {
    firstName: contactName.slice(0, splitAt).trim() || null,
    lastName: contactName.slice(splitAt).trim() || null,
  };
}

function preferNonblank(...values) {
  for (const value of values) {
    if (!isBlank(value)) return String(value).trim();
  }
  return null;
}

function keyKind(secretKey) {
  if (!secretKey) return null;
  return secretKey.startsWith('sb_secret_') || process.env.SUPABASE_SECRET_KEY
    ? 'secret'
    : 'legacy-service-role';
}

function postgrestHeaders({ secretKey, kind, method, prefer }) {
  const headers = {
    apikey: secretKey,
    'Content-Type': 'application/json',
  };

  if (prefer) headers.Prefer = prefer;
  if (method === 'POST' && !headers.Prefer) headers.Prefer = 'return=representation';

  // New Supabase secret keys are not JWTs and should not be sent as Bearer
  // tokens to PostgREST. Legacy service-role JWTs still need Authorization.
  if (kind === 'legacy-service-role') {
    headers.Authorization = `Bearer ${secretKey}`;
  }

  return headers;
}

function authHeaders(secretKey) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson({ url, pathAndQuery, method = 'GET', headers, body }) {
  const response = await fetch(`${url.origin}${pathAndQuery}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || text;
    const error = new Error(`${method} ${pathAndQuery} failed with ${response.status}: ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function postgrestRequest({ url, secretKey, kind, pathAndQuery, method = 'GET', body, prefer }) {
  return requestJson({
    url,
    pathAndQuery,
    method,
    headers: postgrestHeaders({ secretKey, kind, method, prefer }),
    body,
  });
}

async function authRequest({ url, secretKey, pathAndQuery, method = 'GET', body }) {
  return requestJson({
    url,
    pathAndQuery,
    method,
    headers: authHeaders(secretKey),
    body,
  });
}

async function fetchGroups(context) {
  return postgrestRequest({
    ...context,
    pathAndQuery: '/rest/v1/groups?select=id,title,contact_email,contact_name,owner_user_id,status&order=id.asc',
  });
}

async function fetchPortalUsers(context) {
  return postgrestRequest({
    ...context,
    pathAndQuery: '/rest/v1/portal_users?select=user_id,email,is_admin,first_name,last_name&order=user_id.asc',
  });
}

async function fetchAuthUsers(context) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const payload = await authRequest({
      url: context.url,
      secretKey: context.secretKey,
      pathAndQuery: `/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`,
    });
    const pageUsers = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
    users.push(...pageUsers);
    if (pageUsers.length < PAGE_SIZE) break;
  }
  return users;
}

function buildAuthUserMaps(authUsers) {
  const byEmail = new Map();
  const duplicates = new Map();

  for (const user of authUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;

    if (!byEmail.has(email)) {
      byEmail.set(email, user);
      continue;
    }

    if (!duplicates.has(email)) duplicates.set(email, [byEmail.get(email)]);
    duplicates.get(email).push(user);
  }

  return { byEmail, duplicates };
}

function buildPortalMaps(portalUsers) {
  const byUserId = new Map();
  const byEmail = new Map();

  for (const user of portalUsers) {
    byUserId.set(user.user_id, user);
    const email = normalizeEmail(user.email);
    if (email) byEmail.set(email, user);
  }

  return { byUserId, byEmail };
}

async function inviteAuthUser(context, email, names) {
  const redirectUrl = validateUrl(process.env.DASHBOARD_REDIRECT_URL || DEFAULT_DASHBOARD_REDIRECT_URL);
  const query = redirectUrl ? `?redirect_to=${encodeURIComponent(redirectUrl.toString())}` : '';
  const payload = await authRequest({
    url: context.url,
    secretKey: context.secretKey,
    pathAndQuery: `/auth/v1/invite${query}`,
    method: 'POST',
    body: {
      email,
      data: {
        first_name: names.firstName,
        last_name: names.lastName,
      },
    },
  });

  return payload?.user || payload;
}

async function insertPortalUser(context, user) {
  const rows = await postgrestRequest({
    ...context,
    pathAndQuery: '/rest/v1/portal_users?select=user_id,email,is_admin,first_name,last_name',
    method: 'POST',
    prefer: 'return=representation',
    body: [{
      user_id: user.userId,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      is_admin: false,
    }],
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function updatePortalNamesIfBlank(context, portalUser, names) {
  const patch = {};
  if (isBlank(portalUser.first_name) && !isBlank(names.firstName)) {
    patch.first_name = names.firstName;
  }
  if (isBlank(portalUser.last_name) && !isBlank(names.lastName)) {
    patch.last_name = names.lastName;
  }

  if (Object.keys(patch).length === 0) return null;

  const rows = await postgrestRequest({
    ...context,
    pathAndQuery: `/rest/v1/portal_users?user_id=eq.${encodeURIComponent(portalUser.user_id)}&select=user_id,email,is_admin,first_name,last_name`,
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });

  return Array.isArray(rows) ? rows[0] : rows;
}

async function assignGroupOwner(context, groupId, userId) {
  await postgrestRequest({
    ...context,
    pathAndQuery: `/rest/v1/groups?id=eq.${escapeQueryValue(groupId)}`,
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { owner_user_id: userId },
  });
}

function hostPlanLabel(userId) {
  return userId || '(planned new Auth user)';
}

async function resolveHost({ context, mode, group, normalizedEmail, authMaps, portalMaps, hostCache, summary, details }) {
  if (hostCache.has(normalizedEmail)) return hostCache.get(normalizedEmail);

  if (authMaps.duplicates.has(normalizedEmail)) {
    const conflict = {
      sourceGroup: publicLabel(group),
      userIds: authMaps.duplicates.get(normalizedEmail).map((user) => user.id).filter(Boolean),
    };
    details.authConflicts.push(conflict);
    hostCache.set(normalizedEmail, { ok: false, reason: 'duplicate auth users' });
    return hostCache.get(normalizedEmail);
  }

  const names = deriveNameParts(group);
  let authUser = authMaps.byEmail.get(normalizedEmail) || null;
  let createdAuthUser = false;

  if (!authUser) {
    if (mode === 'apply') {
      authUser = await inviteAuthUser(context, normalizedEmail, names);
      if (!authUser?.id) {
        throw new Error('Auth invite did not return a user ID.');
      }
      authMaps.byEmail.set(normalizedEmail, authUser);
    } else {
      authUser = { id: `planned-new-auth-user-${summary.communityHostsCreated + 1}`, email: normalizedEmail };
    }
    createdAuthUser = true;
    summary.communityHostsCreated += 1;
    summary.invitationsSent += 1;
    details.createdHosts.push([hostPlanLabel(authUser.id), publicLabel(group)]);
  } else {
    summary.communityHostsReused += 1;
    details.reusedHosts.push([hostPlanLabel(authUser.id), publicLabel(group)]);
  }

  const userId = authUser.id;
  const portalByUser = portalMaps.byUserId.get(userId);
  const portalByEmail = portalMaps.byEmail.get(normalizedEmail);

  if (portalByEmail && portalByEmail.user_id !== userId) {
    const conflict = {
      sourceGroup: publicLabel(group),
      authUserId: userId,
      portalUserId: portalByEmail.user_id,
    };
    details.portalConflicts.push(conflict);
    hostCache.set(normalizedEmail, { ok: false, reason: 'portal email belongs to another user' });
    return hostCache.get(normalizedEmail);
  }

  if (portalByUser) {
    summary.portalUsersReused += 1;
    details.reusedPortalUsers.push([userId, portalByUser.is_admin === true ? 'admin' : 'contact']);
    if (portalByUser.is_admin === true) {
      summary.adminsPreserved += 1;
      details.preservedAdmins.push([userId]);
    }

    const updatedPortal = mode === 'apply'
      ? await updatePortalNamesIfBlank(context, portalByUser, names)
      : (!isBlank(names.firstName) && isBlank(portalByUser.first_name)) || (!isBlank(names.lastName) && isBlank(portalByUser.last_name))
        ? { ...portalByUser, first_name: preferNonblank(portalByUser.first_name, names.firstName), last_name: preferNonblank(portalByUser.last_name, names.lastName) }
        : null;

    if (updatedPortal) {
      summary.portalUsersUpdated += 1;
      details.updatedPortalUsers.push([userId]);
      portalMaps.byUserId.set(userId, updatedPortal);
      const updatedEmail = normalizeEmail(updatedPortal.email);
      if (updatedEmail) portalMaps.byEmail.set(updatedEmail, updatedPortal);
    }
  } else {
    const portalUserInput = {
      userId,
      email: normalizedEmail,
      firstName: names.firstName,
      lastName: names.lastName,
    };
    const portalUser = mode === 'apply'
      ? await insertPortalUser(context, portalUserInput)
      : {
        user_id: userId,
        email: normalizedEmail,
        first_name: names.firstName,
        last_name: names.lastName,
        is_admin: false,
      };

    summary.portalUsersCreated += 1;
    details.createdPortalUsers.push([userId]);
    portalMaps.byUserId.set(userId, portalUser);
    portalMaps.byEmail.set(normalizedEmail, portalUser);
  }

  const host = {
    ok: true,
    userId,
    email: normalizedEmail,
    createdAuthUser,
  };
  hostCache.set(normalizedEmail, host);
  return host;
}

function summarizeSkippedGroup(group, summary, details) {
  const normalizedEmail = normalizeEmail(group.contact_email);
  if (!normalizedEmail) {
    summary.skippedBlankEmails += 1;
    details.skippedBlankEmails.push([publicLabel(group)]);
    return true;
  }
  if (!isValidEmail(normalizedEmail)) {
    summary.skippedInvalidEmails += 1;
    details.skippedInvalidEmails.push([publicLabel(group)]);
    return true;
  }
  return false;
}

async function backfill({ context, mode }) {
  const result = createResult();
  const { summary, details } = result;
  let currentGroup = null;

  const groups = await fetchGroups(context);
  result.groupCount = groups.length;

  const portalUsers = await fetchPortalUsers(context);
  result.portalUserCount = portalUsers.length;

  const authUsers = await fetchAuthUsers(context);
  result.authUserCount = authUsers.length;

  const authMaps = buildAuthUserMaps(authUsers);
  const portalMaps = buildPortalMaps(portalUsers);
  const hostCache = new Map();

  try {
    for (const group of groups) {
      currentGroup = group;
      if (summarizeSkippedGroup(group, summary, details)) continue;

      const normalizedEmail = normalizeEmail(group.contact_email);
      const host = await resolveHost({
        context,
        mode,
        group,
        normalizedEmail,
        authMaps,
        portalMaps,
        hostCache,
        summary,
        details,
      });

      if (!host.ok) {
        summary.ownershipConflicts += 1;
        details.ownershipConflicts.push([publicLabel(group), host.reason]);
        continue;
      }

      if (!group.owner_user_id) {
        if (mode === 'apply') {
          await assignGroupOwner(context, group.id, host.userId);
        }
        summary.groupsAssigned += 1;
        details.assignedGroups.push([publicLabel(group), host.userId]);
      } else if (String(group.owner_user_id) === String(host.userId)) {
        summary.groupsAlreadyAssigned += 1;
        details.alreadyAssignedGroups.push([publicLabel(group), host.userId]);
      } else {
        summary.ownershipConflicts += 1;
        details.ownershipConflicts.push([publicLabel(group), `existing owner ${group.owner_user_id} differs from resolved owner ${host.userId}`]);
      }
    }
  } catch (error) {
    markFailure(result, currentGroup, error);
  }

  return result;
}

function buildReport({ mode, timestamp, supabaseHost, result }) {
  const { summary, details, groupCount, authUserCount, portalUserCount, failed, failingGroup, errorMessage } = result;
  const rows = Object.entries(summary).map(([key, value]) => [key, value]);
  let report = '# Community Host Backfill Report\n\n';
  report += `- Execution mode: ${mode}\n`;
  report += `- Execution timestamp: ${timestamp}\n`;
  report += `- Supabase host: ${supabaseHost}\n`;
  report += `- Groups inspected: ${groupCount}\n`;
  report += `- Auth users inspected: ${authUserCount}\n`;
  report += `- Portal users inspected: ${portalUserCount}\n`;
  report += `- Final status: ${failed ? 'failed after partial progress' : 'completed'}\n`;
  report += `- Failing group: ${failingGroup || 'not applicable'}\n`;
  report += `- Error message: ${errorMessage || 'not applicable'}\n`;
  report += '- Contact emails are not included in this report.\n';
  report += '- Firebase was not modified.\n\n';

  report += '## Summary\n\n';
  report += `${table(['Metric', 'Count'], rows)}\n`;

  report += '## Rollback Inputs\n\n';
  report += 'Groups assigned in this run can be reverted by clearing `groups.owner_user_id` for these IDs after review:\n\n';
  report += `${table(['Group', 'Assigned owner_user_id'], details.assignedGroups)}\n`;
  report += 'Portal users created in this run can be removed after their assigned groups are reverted:\n\n';
  report += `${table(['Created portal user_id'], details.createdPortalUsers)}\n`;
  report += 'Auth users created/invited in this run can be disabled or deleted through Supabase Auth Admin tooling after portal rows and ownership assignments are reverted:\n\n';
  report += `${table(['Created Auth user_id', 'First source group'], details.createdHosts)}\n`;

  report += '## Skips And Conflicts\n\n';
  report += 'Skipped blank contact emails:\n\n';
  report += `${table(['Group'], details.skippedBlankEmails)}\n`;
  report += 'Skipped invalid contact emails:\n\n';
  report += `${table(['Group'], details.skippedInvalidEmails)}\n`;
  report += 'Ownership conflicts:\n\n';
  report += `${table(['Group', 'Reason'], details.ownershipConflicts)}\n`;
  report += 'Auth duplicate conflicts:\n\n';
  report += `${table(['Source group', 'Auth user IDs'], details.authConflicts.map((item) => [item.sourceGroup, item.userIds.join(', ')]))}\n`;
  report += 'Portal email conflicts:\n\n';
  report += `${table(['Source group', 'Resolved auth user_id', 'Existing portal user_id'], details.portalConflicts.map((item) => [item.sourceGroup, item.authUserId, item.portalUserId]))}\n`;
  report += 'Runtime errors:\n\n';
  report += `${table(['Group', 'Error'], details.errors)}\n`;

  report += '## Other Details\n\n';
  report += 'Reused Auth users:\n\n';
  report += `${table(['Auth user_id', 'First source group'], details.reusedHosts)}\n`;
  report += 'Reused portal users:\n\n';
  report += `${table(['Portal user_id', 'Role'], details.reusedPortalUsers)}\n`;
  report += 'Portal users with blank names filled:\n\n';
  report += `${table(['Portal user_id'], details.updatedPortalUsers)}\n`;
  report += 'Admins preserved:\n\n';
  report += `${table(['Admin user_id'], details.preservedAdmins)}\n`;
  report += 'Groups already assigned:\n\n';
  report += `${table(['Group', 'Owner user_id'], details.alreadyAssignedGroups)}\n`;

  return report;
}

function printSummary(result, mode) {
  console.log(`Mode: ${mode}`);
  console.log(`Groups inspected: ${result.groupCount}`);
  console.log(`Auth users inspected: ${result.authUserCount}`);
  console.log(`Portal users inspected: ${result.portalUserCount}`);
  console.log(`Final status: ${result.failed ? 'failed after partial progress' : 'completed'}`);
  if (result.failed) {
    console.log(`Failing group: ${result.failingGroup || 'not applicable'}`);
    console.log(`Error message: ${result.errorMessage || 'not applicable'}`);
  }
  for (const [key, value] of Object.entries(result.summary)) {
    console.log(`${key}: ${value}`);
  }
}

function validateMode() {
  if (shouldApply && shouldPlan) {
    throw new Error('Choose either --plan or --apply, not both.');
  }
  if (shouldApply && !isApplyConfirmed) {
    throw new Error(`--apply requires --confirm=${APPLY_CONFIRMATION}`);
  }
  if (shouldPlan && !isPlanConfirmed) {
    throw new Error(`--plan requires --confirm=${PLAN_CONFIRMATION}`);
  }
  if (!shouldApply && !shouldPlan) {
    throw new Error(usage());
  }
  return shouldApply ? 'apply' : 'plan';
}

async function main() {
  const timestamp = new Date().toISOString();
  const mode = validateMode();
  const supabaseUrl = validateUrl(process.env.SUPABASE_URL);
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  const kind = keyKind(secretKey);

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required and must be an http(s) URL.');
  }
  if (!secretKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required.');
  }

  const context = {
    url: supabaseUrl,
    secretKey,
    kind,
  };

  const result = await backfill({ context, mode });
  await writeFile(reportPath, buildReport({
    mode,
    timestamp,
    supabaseHost: supabaseUrl.host,
    result,
  }), 'utf8');

  printSummary(result, mode);
  console.log(`Report written: ${reportPath}`);

  if (result.failed || result.summary.ownershipConflicts > 0 || result.details.authConflicts.length > 0 || result.details.portalConflicts.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Community Host backfill failed: ${error.message}`);
  process.exit(1);
});
