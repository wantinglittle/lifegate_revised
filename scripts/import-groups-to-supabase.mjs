import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INPUT_RELATIVE_PATH = 'migration-data/firestore-groups-transformed.json';
const REPORT_RELATIVE_PATH = 'migration-data/supabase-import-report.md';
const EXPECTED_RECORD_COUNT = 22;
const CONFIRMATION = 'IMPORT_22_LIFEGATE_GROUPS';
const TABLE_NAME = 'public.groups';
const TARGET_COLUMNS = [
  'id',
  'submitted_at',
  'title',
  'description',
  'day',
  'meeting_time',
  'audience',
  'age_group',
  'city',
  'zip_code',
  'cross_streets',
  'additional_info',
  'contact_name',
  'contact_email',
  'contact_phone',
  'status',
  'latitude',
  'longitude',
];
const REQUIRED_FIELDS = [
  'id',
  'title',
  'description',
  'contact_name',
  'contact_email',
  'contact_phone',
  'audience',
  'age_group',
  'city',
  'zip_code',
  'cross_streets',
];
const EXPECTED_STATUS_COUNTS = {
  approved: 17,
  pending: 5,
  rejected: 0,
  archived: 0,
};
const VALID_STATUSES = new Set(Object.keys(EXPECTED_STATUS_COUNTS));
const VALID_DAYS = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const VALID_AUDIENCES = new Set(['All', 'Men', 'Women']);
const VALID_AGE_GROUPS = new Set(['All-ages', 'Kids', 'Teens', 'Adult']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const inputPath = path.join(repoRoot, INPUT_RELATIVE_PATH);
const reportPath = path.join(repoRoot, REPORT_RELATIVE_PATH);
const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const confirmArg = args.find((arg) => arg.startsWith('--confirm='));
const isConfirmed = confirmArg === `--confirm=${CONFIRMATION}`;

function countStatuses(documents) {
  const counts = { approved: 0, pending: 0, rejected: 0, archived: 0 };
  for (const document of documents) {
    counts[document.status] = (counts[document.status] ?? 0) + 1;
  }
  return counts;
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers, rows) {
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  return [header, separator, ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)].join('\n');
}

function validateUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function formatStatusCounts(counts) {
  return `approved=${counts.approved ?? 0}, pending=${counts.pending ?? 0}, rejected=${counts.rejected ?? 0}, archived=${counts.archived ?? 0}`;
}

function postgrestInList(ids) {
  return `(${ids.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(',')})`;
}

function localValidation(payload) {
  const errors = [];
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const ids = new Set();
  const duplicateIds = new Set();
  const targetColumnSet = new Set(TARGET_COLUMNS);

  if (payload.metadata?.sourceDocumentCount !== EXPECTED_RECORD_COUNT) {
    errors.push(`metadata.sourceDocumentCount must be ${EXPECTED_RECORD_COUNT}.`);
  }
  if (payload.metadata?.transformedDocumentCount !== EXPECTED_RECORD_COUNT) {
    errors.push(`metadata.transformedDocumentCount must be ${EXPECTED_RECORD_COUNT}.`);
  }
  if (!Array.isArray(payload.documents)) {
    errors.push('documents must be an array.');
  }
  if (documents.length !== EXPECTED_RECORD_COUNT) {
    errors.push(`documents array must contain exactly ${EXPECTED_RECORD_COUNT} records.`);
  }

  for (const document of documents) {
    if (ids.has(document.id)) {
      duplicateIds.add(document.id);
    }
    ids.add(document.id);

    const keys = Object.keys(document);
    for (const key of keys) {
      if (!targetColumnSet.has(key)) {
        errors.push(`${document.id ?? '(missing id)'} contains unknown target column ${key}.`);
      }
    }
    for (const column of TARGET_COLUMNS) {
      if (!Object.prototype.hasOwnProperty.call(document, column)) {
        errors.push(`${document.id ?? '(missing id)'} is missing target column ${column}.`);
      }
    }
    for (const field of REQUIRED_FIELDS) {
      const value = document[field];
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        errors.push(`${document.id ?? '(missing id)'} has empty required field ${field}.`);
      }
    }
    if (typeof document.title === 'string' && document.title.length > 120) {
      errors.push(`${document.id} title exceeds 120 characters.`);
    }
    if (typeof document.description === 'string' && document.description.length > 500) {
      errors.push(`${document.id} description exceeds 500 characters.`);
    }
    if (typeof document.city === 'string' && document.city.length > 120) {
      errors.push(`${document.id} city exceeds 120 characters.`);
    }
    if (typeof document.contact_email !== 'string' || !EMAIL_PATTERN.test(document.contact_email)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid contact_email.`);
    }
    if (!VALID_AUDIENCES.has(document.audience)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid audience.`);
    }
    if (!VALID_AGE_GROUPS.has(document.age_group)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid age_group.`);
    }
    if (!VALID_STATUSES.has(document.status)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid status.`);
    }
    if (document.day !== null && !VALID_DAYS.has(document.day)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid day.`);
    }
    if (document.meeting_time !== null && !TIME_PATTERN.test(document.meeting_time)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid meeting_time.`);
    }
    if (document.submitted_at !== null && Number.isNaN(Date.parse(document.submitted_at))) {
      errors.push(`${document.id ?? '(missing id)'} has invalid submitted_at.`);
    }
    if (document.latitude !== null && (!Number.isFinite(document.latitude) || document.latitude < -90 || document.latitude > 90)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid latitude.`);
    }
    if (document.longitude !== null && (!Number.isFinite(document.longitude) || document.longitude < -180 || document.longitude > 180)) {
      errors.push(`${document.id ?? '(missing id)'} has invalid longitude.`);
    }
  }

  for (const duplicateId of duplicateIds) {
    errors.push(`Duplicate output ID: ${duplicateId}.`);
  }

  const statusCounts = countStatuses(documents);
  for (const [status, expectedCount] of Object.entries(EXPECTED_STATUS_COUNTS)) {
    if (statusCounts[status] !== expectedCount) {
      errors.push(`Expected ${expectedCount} ${status} records, found ${statusCounts[status] ?? 0}.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    documents,
    statusCounts,
  };
}

function buildReport({
  mode,
  timestamp,
  sourceCount,
  validation,
  supabaseHost,
  conflictCount,
  conflicts,
  insertedCount,
  verification,
  finalStatus,
  errors,
}) {
  let report = '# Supabase Groups Import Report\n\n';
  report += `- Execution mode: ${mode}\n`;
  report += `- Execution timestamp: ${timestamp}\n`;
  report += `- Source record count: ${sourceCount}\n`;
  report += `- Target Supabase hostname: ${supabaseHost ?? '(not provided in dry run)'}\n`;
  report += `- Local validation: ${validation.ok ? 'passed' : 'failed'}\n`;
  report += `- Pre-import conflict count: ${conflictCount ?? 'not checked'}\n`;
  report += `- Inserted count: ${insertedCount ?? 'not applicable'}\n`;
  report += `- Post-import verification: ${verification?.status ?? 'not applicable'}\n`;
  report += `- Final status: ${finalStatus}\n`;
  report += '- Firebase was not modified.\n\n';

  report += '## Status Totals\n\n';
  report += `${table(['Status', 'Count'], Object.entries(validation.statusCounts ?? EXPECTED_STATUS_COUNTS))}\n\n`;

  report += '## Local Validation Results\n\n';
  report += validation.ok
    ? 'Local validation passed. The transformed dataset matches the expected record count, target columns, ID uniqueness, status totals, and known database constraints.\n\n'
    : `${table(['Error'], validation.errors.map((error) => [error]))}\n\n`;

  report += '## Pre-Import Conflicts\n\n';
  if (conflicts?.length) {
    report += `${table(['Document ID', 'Group title'], conflicts.map((conflict) => [conflict.id, conflict.title]))}\n\n`;
  } else {
    report += conflictCount === 0 ? 'No existing rows matched the transformed IDs.\n\n' : 'Not checked in dry-run mode.\n\n';
  }

  report += '## Post-Import Verification\n\n';
  if (verification?.rows) {
    report += `${table(['Metric', 'Value'], [
      ['Returned IDs', verification.returnedCount],
      ['Missing IDs', verification.missingIds.length],
      ['Status totals', formatStatusCounts(verification.statusCounts)],
    ])}\n\n`;
  } else {
    report += `${verification?.message ?? 'Not applicable in dry-run mode.'}\n\n`;
  }

  report += '## Errors\n\n';
  report += errors.length ? `${table(['Error'], errors.map((error) => [error]))}\n\n` : 'None.\n\n';

  report += '## Safety Confirmation\n\n';
  report += '- No keys were written to this report.\n';
  report += '- Contact emails and phone numbers are not included in this report.\n';
  report += '- Firebase was not modified.\n';
  report += mode === 'apply'
    ? '- Supabase was contacted only because both --apply and the exact confirmation argument were supplied.\n'
    : '- Supabase was not contacted because this was a dry run.\n';

  return report;
}

function supabaseHeaders({ secretKey, keyKind, method }) {
  const headers = {
    apikey: secretKey,
    'Content-Type': 'application/json',
  };

  if (method === 'POST') {
    headers.Prefer = 'return=minimal';
  }

  // New Supabase secret keys are not JWTs. They must not be sent as Bearer
  // tokens, or PostgREST can reject the request with an Invalid JWT response.
  if (keyKind === 'legacy-service-role') {
    headers.Authorization = `Bearer ${secretKey}`;
  }

  return headers;
}

async function supabaseRequest({ url, secretKey, keyKind, pathAndQuery, method = 'GET', body }) {
  const response = await fetch(`${url.origin}${pathAndQuery}`, {
    method,
    headers: supabaseHeaders({ secretKey, keyKind, method }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${pathAndQuery} failed with ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const timestamp = new Date().toISOString();
  const mode = shouldApply && isConfirmed ? 'apply' : 'dry run';
  const errors = [];
  let conflictCount = null;
  let conflicts = [];
  let insertedCount = null;
  let verification = null;
  let finalStatus = 'DRY RUN VALIDATION PASSED';

  const payload = JSON.parse(await readFile(inputPath, 'utf8'));
  const validation = localValidation(payload);
  const sourceCount = Array.isArray(payload.documents) ? payload.documents.length : 0;
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const selectedKeyIsCurrentSecret = secretKey?.startsWith('sb_secret_') ?? false;
  const keyKind = selectedKeyIsCurrentSecret || process.env.SUPABASE_SECRET_KEY
    ? 'secret'
    : process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'legacy-service-role'
      : null;
  const parsedUrl = supabaseUrl ? validateUrl(supabaseUrl) : null;

  if (!validation.ok) {
    finalStatus = 'LOCAL VALIDATION FAILED';
    errors.push(...validation.errors);
  } else if (mode === 'apply') {
    if (!parsedUrl) {
      finalStatus = 'MISSING SUPABASE_URL';
      errors.push('SUPABASE_URL is required for --apply.');
    }
    if (!secretKey) {
      finalStatus = 'MISSING ELEVATED SUPABASE KEY';
      errors.push('SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY for backward compatibility, is required for --apply.');
    }
  }

  if (validation.ok && mode === 'apply' && parsedUrl && secretKey) {
    console.log(`Supabase host: ${parsedUrl.host}`);
    console.log(`Target table: ${TABLE_NAME}`);
    console.log(`Record count: ${validation.documents.length}`);
    console.log(`Expected status totals: ${formatStatusCounts(EXPECTED_STATUS_COUNTS)}`);
    console.log('Import mode: apply');

    const ids = validation.documents.map((document) => document.id);
    const idQuery = encodeURIComponent(`in.${postgrestInList(ids)}`);
    const existingRows = await supabaseRequest({
      url: parsedUrl,
      secretKey,
      keyKind,
      pathAndQuery: `/rest/v1/groups?select=id,status&id=${idQuery}`,
    });

    conflictCount = existingRows.length;
    if (conflictCount > 0) {
      const titlesById = new Map(validation.documents.map((document) => [document.id, document.title]));
      conflicts = existingRows.map((row) => ({ id: row.id, title: titlesById.get(row.id) ?? '(unknown title)' }));
      finalStatus = 'IMPORT BLOCKED BY EXISTING ROWS';
      errors.push(`${conflictCount} transformed IDs already exist in public.groups.`);
    } else {
      await supabaseRequest({
        url: parsedUrl,
        secretKey,
        keyKind,
        pathAndQuery: '/rest/v1/groups',
        method: 'POST',
        body: validation.documents,
      });
      insertedCount = validation.documents.length;

      const verificationRows = await supabaseRequest({
        url: parsedUrl,
        secretKey,
        keyKind,
        pathAndQuery: `/rest/v1/groups?select=id,status,title&id=${idQuery}`,
      });
      const returnedIds = new Set(verificationRows.map((row) => row.id));
      const missingIds = ids.filter((id) => !returnedIds.has(id));
      const verificationCounts = countStatuses(verificationRows);
      const statusCountsOk = Object.entries(EXPECTED_STATUS_COUNTS).every(([status, expected]) => verificationCounts[status] === expected);

      verification = {
        status: verificationRows.length === EXPECTED_RECORD_COUNT && missingIds.length === 0 && statusCountsOk
          ? 'passed'
          : 'failed; manual database inspection required',
        rows: verificationRows,
        returnedCount: verificationRows.length,
        missingIds,
        statusCounts: verificationCounts,
      };

      finalStatus = verification.status === 'passed'
        ? 'IMPORT SUCCEEDED AND VERIFIED'
        : 'IMPORT INSERTED BUT VERIFICATION FAILED';
      if (verification.status !== 'passed') {
        errors.push('Insert completed, but verification failed. Manual database inspection is required.');
      }
    }
  } else if (validation.ok && mode === 'dry run') {
    verification = { status: 'not applicable', message: 'Dry run completed local validation only. No network request was made.' };
  }

  await writeFile(reportPath, buildReport({
    mode,
    timestamp,
    sourceCount,
    validation,
    supabaseHost: parsedUrl?.host,
    conflictCount,
    conflicts,
    insertedCount,
    verification,
    finalStatus,
    errors,
  }), 'utf8');

  console.log(`Source path: ${inputPath}`);
  console.log('Output path: not applicable');
  console.log(`Source record count: ${sourceCount}`);
  console.log(`Transformed record count: ${validation.documents.length}`);
  console.log(`Status counts: ${formatStatusCounts(validation.statusCounts)}`);
  console.log(`Blocking error count: ${validation.errors.length}`);
  console.log('Warning count: 0');
  console.log('Informational count: 0');
  console.log(`Import mode: ${mode}`);
  console.log(`Final dry-run readiness result: ${finalStatus}`);

  if (mode === 'dry run') {
    console.log('Network access: skipped');
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const timestamp = new Date().toISOString();
  const message = error?.message ?? String(error);
  try {
    await writeFile(reportPath, buildReport({
      mode: shouldApply && isConfirmed ? 'apply' : 'dry run',
      timestamp,
      sourceCount: 'unknown',
      validation: { ok: false, errors: [message], statusCounts: EXPECTED_STATUS_COUNTS },
      supabaseHost: null,
      conflictCount: null,
      conflicts: [],
      insertedCount: null,
      verification: null,
      finalStatus: 'IMPORT SCRIPT FAILED',
      errors: [message],
    }), 'utf8');
  } catch {
    // Avoid masking the original failure if the report cannot be written.
  }
  console.error(`Import failed: ${message}`);
  process.exit(1);
});
