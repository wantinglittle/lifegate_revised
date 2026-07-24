import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_RELATIVE_PATH = 'migration-data/firestore-groups-export.json';
const OUTPUT_RELATIVE_PATH = 'migration-data/firestore-groups-transformed.json';
const REPORT_RELATIVE_PATH = 'migration-data/firestore-transform-report.md';

const STATUS_ORDER = ['approved', 'pending', 'rejected', 'archived'];
const EXPECTED_STATUS_COUNTS = new Map([
  ['approved', 17],
  ['pending', 5],
  ['rejected', 0],
  ['archived', 0],
]);
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
const SOURCE_FIELDS = new Set([
  'id',
  'submittedAt',
  'title',
  'description',
  'day',
  'hour',
  'minute',
  'ampm',
  'audience',
  'ageGroup',
  'city',
  'zipCode',
  'crossStreets',
  'additionalInfo',
  'contactName',
  'contactEmail',
  'contactPhone',
  'coords',
  'status',
  'hidden',
]);
const REQUIRED_TARGET_FIELDS = [
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
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NULL_DAY_VALUES = new Set(['', 'tbd', 'tba', 'to be determined']);
const AUDIENCES = ['All', 'Men', 'Women'];
const AGE_GROUPS = ['All-ages', 'Kids', 'Teens', 'Adult'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sourcePath = path.join(repoRoot, SOURCE_RELATIVE_PATH);
const outputPath = path.join(repoRoot, OUTPUT_RELATIVE_PATH);
const reportPath = path.join(repoRoot, REPORT_RELATIVE_PATH);

const reportItems = [];
const normalizations = new Map();
const discardedFields = new Map();

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addReportItem(document, severity, issue, action) {
  reportItems.push({
    id: document?.id ?? '(missing id)',
    title: maskReportText(document?.title ?? '(untitled)'),
    severity,
    issue,
    action,
  });
}

function maskReportText(value) {
  return String(value).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[masked-email]');
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function table(headers, rows) {
  const header = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  return [header, separator, ...rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`)].join('\n');
}

function sortedEntries(map) {
  return [...map.entries()].sort((left, right) => String(left[0]).localeCompare(String(right[0])));
}

function trimText(value, field, document, options = {}) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed !== value) {
    increment(normalizations, `trimmed ${field}`);
    addReportItem(document, 'informational', `Trimmed whitespace in ${field}`, 'No manual action needed if trimmed value is correct.');
  }

  if (trimmed === '' && options.emptyToNull) {
    increment(normalizations, `${field} empty string -> NULL`);
    return null;
  }

  return trimmed;
}

function canonicalValue(value, allowedValues, field, document) {
  const trimmed = trimText(value, field, document);
  if (trimmed === null || trimmed === undefined || trimmed === '') {
    return trimmed;
  }

  const match = allowedValues.find((allowed) => allowed.toLowerCase() === String(trimmed).toLowerCase());
  if (match && match !== trimmed) {
    increment(normalizations, `${field} capitalization normalization`);
    addReportItem(document, 'warning', `Normalized ${field} capitalization`, `Use ${match}.`);
  }

  return match ?? trimmed;
}

function normalizeDay(value, document) {
  if (value === undefined || value === null) {
    increment(normalizations, 'day missing/null -> NULL');
    return null;
  }

  const trimmed = trimText(value, 'day', document);
  const normalizedKey = String(trimmed).toLowerCase();
  if (NULL_DAY_VALUES.has(normalizedKey)) {
    increment(normalizations, 'day placeholder/blank -> NULL');
    if (normalizedKey !== '') {
      addReportItem(document, 'warning', `Normalized day "${trimmed}" to NULL`, 'Confirm NULL day is acceptable for this group.');
    }
    return null;
  }

  const day = WEEKDAYS.find((weekday) => weekday.toLowerCase() === normalizedKey);
  if (day) {
    if (day !== trimmed) {
      increment(normalizations, 'day capitalization normalization');
      addReportItem(document, 'warning', `Normalized day capitalization from "${trimmed}"`, `Use ${day}.`);
    }
    return day;
  }

  addReportItem(document, 'blocking', `Invalid day "${trimmed}"`, 'Set day to a valid weekday, blank, TBD, TBA, or To Be Determined.');
  return trimmed;
}

function normalizeMeetingTime(document) {
  const hourRaw = trimText(document.hour, 'hour', document);
  const minuteRaw = trimText(document.minute, 'minute', document);
  const ampmRaw = trimText(document.ampm, 'ampm', document);
  const parts = [hourRaw, minuteRaw, ampmRaw];
  const allBlank = parts.every((part) => part === undefined || part === null || part === '');

  if (allBlank) {
    increment(normalizations, 'meeting time absent/blank -> NULL');
    return null;
  }

  const incomplete = parts.some((part) => part === undefined || part === null || part === '');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const ampm = String(ampmRaw).toUpperCase();

  if (
    incomplete ||
    !Number.isInteger(hour) ||
    hour < 1 ||
    hour > 12 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !['AM', 'PM'].includes(ampm)
  ) {
    increment(normalizations, 'invalid/incomplete meeting time -> NULL');
    addReportItem(document, 'warning', 'Invalid or incomplete meeting time normalized to NULL', 'Review source hour/minute/ampm; do not guess missing time.');
    return null;
  }

  let hour24 = hour % 12;
  if (ampm === 'PM') {
    hour24 += 12;
  }

  increment(normalizations, 'hour/minute/ampm -> meeting_time');
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function normalizeStatus(document) {
  if (document.status !== undefined && document.hidden !== undefined) {
    if ((document.status === 'approved' && document.hidden !== 'no') || (document.status !== 'approved' && document.hidden === 'no')) {
      addReportItem(
        document,
        'warning',
        `Conflicting hidden/status combination: status=${document.status}, hidden=${document.hidden}`,
        'Canonical status follows the approved case-sensitive precedence rules.',
      );
    }
  }

  increment(normalizations, 'hidden/status -> canonical status using case-sensitive legacy mapping');
  if (document.status === 'approved') return 'approved';
  if (document.hidden === 'no') return 'approved';
  if (document.status === 'rejected') return 'rejected';
  if (document.status === 'archived') return 'archived';
  return 'pending';
}

function normalizeSubmittedAt(value, document) {
  const submittedAt = trimText(value, 'submittedAt', document, { emptyToNull: true });
  if (submittedAt === null || submittedAt === undefined) {
    increment(normalizations, 'submittedAt missing/blank -> NULL');
    addReportItem(document, 'warning', 'Missing submittedAt normalized to NULL', 'Import as NULL only if this is acceptable.');
    return null;
  }

  const timestamp = Date.parse(submittedAt);
  if (Number.isNaN(timestamp)) {
    addReportItem(document, 'blocking', 'Invalid submittedAt timestamp', 'Correct submittedAt to a valid ISO-8601 timestamp or set it to NULL if acceptable.');
    return submittedAt;
  }

  increment(normalizations, 'submittedAt ISO string preserved');
  return submittedAt;
}

function normalizeCoordinates(document) {
  const coords = document.coords;
  if (coords === undefined || coords === null) {
    increment(normalizations, 'missing coordinates -> NULL latitude/longitude');
    addReportItem(document, 'informational', 'Missing coordinates normalized to NULL latitude/longitude', 'Import NULL coordinates or geocode later.');
    return { latitude: null, longitude: null };
  }

  const latitude = coords.latitude ?? coords.lat;
  const longitude = coords.longitude ?? coords.lng;
  const onlyOne = (latitude === undefined || latitude === null || latitude === '') !== (longitude === undefined || longitude === null || longitude === '');

  if (onlyOne) {
    increment(normalizations, 'partial coordinates -> NULL latitude/longitude');
    addReportItem(document, 'warning', 'Partial coordinates normalized to NULL latitude/longitude', 'Provide both coordinates or leave both NULL.');
    return { latitude: null, longitude: null };
  }

  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    increment(normalizations, 'missing coordinates -> NULL latitude/longitude');
    addReportItem(document, 'informational', 'Missing coordinates normalized to NULL latitude/longitude', 'Import NULL coordinates or geocode later.');
    return { latitude: null, longitude: null };
  }

  const latNumber = Number(latitude);
  const lngNumber = Number(longitude);
  if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber) || latNumber < -90 || latNumber > 90 || lngNumber < -180 || lngNumber > 180) {
    addReportItem(document, 'blocking', 'Invalid or out-of-range coordinates', 'Correct coordinates before import.');
    return { latitude: latNumber, longitude: lngNumber };
  }

  return { latitude: latNumber, longitude: lngNumber };
}

function validateTransformedDocument(document, sourceDocument) {
  for (const field of REQUIRED_TARGET_FIELDS) {
    const value = document[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      addReportItem(sourceDocument, 'blocking', `Missing required target field: ${field}`, `Populate ${field} before import.`);
    }
  }

  if (typeof document.title === 'string' && document.title.length > 120) {
    addReportItem(sourceDocument, 'blocking', 'title exceeds 120 characters', 'Shorten title before import.');
  }
  if (typeof document.description === 'string' && document.description.length > 500) {
    addReportItem(sourceDocument, 'blocking', 'description exceeds 500 characters', 'Shorten description before import.');
  }
  if (typeof document.city === 'string' && document.city.length > 120) {
    addReportItem(sourceDocument, 'blocking', 'city exceeds 120 characters', 'Shorten city before import.');
  }
  if (typeof document.contact_email === 'string' && !EMAIL_PATTERN.test(document.contact_email)) {
    addReportItem(sourceDocument, 'blocking', 'Invalid contact_email format', 'Correct contact_email before import.');
  }
  if (!AUDIENCES.includes(document.audience)) {
    addReportItem(sourceDocument, 'blocking', `Invalid audience "${document.audience}"`, 'Use All, Men, or Women.');
  }
  if (!AGE_GROUPS.includes(document.age_group)) {
    addReportItem(sourceDocument, 'blocking', `Invalid age_group "${document.age_group}"`, 'Use All-ages, Kids, Teens, or Adult.');
  }
  if (document.day !== null && !WEEKDAYS.includes(document.day)) {
    addReportItem(sourceDocument, 'blocking', `Invalid transformed day "${document.day}"`, 'Use a valid weekday or NULL.');
  }
  if (!STATUS_ORDER.includes(document.status)) {
    addReportItem(sourceDocument, 'blocking', `Invalid status "${document.status}"`, 'Use approved, pending, rejected, or archived.');
  }
}

function transformDocument(document) {
  for (const field of Object.keys(document)) {
    if (!SOURCE_FIELDS.has(field) || ['hidden', 'hour', 'minute', 'ampm', 'g-recaptcha-response'].includes(field)) {
      increment(discardedFields, field);
    }
  }

  const coordinates = normalizeCoordinates(document);
  const additionalInfo = trimText(document.additionalInfo, 'additionalInfo', document, { emptyToNull: true });
  if (document.additionalInfo === undefined || document.additionalInfo === null) {
    increment(normalizations, 'additionalInfo missing/null -> NULL');
  }

  const transformed = {
    id: trimText(document.id, 'id', document),
    submitted_at: normalizeSubmittedAt(document.submittedAt, document),
    title: trimText(document.title, 'title', document),
    description: trimText(document.description, 'description', document),
    day: normalizeDay(document.day, document),
    meeting_time: normalizeMeetingTime(document),
    audience: canonicalValue(document.audience, AUDIENCES, 'audience', document),
    age_group: canonicalValue(document.ageGroup, AGE_GROUPS, 'ageGroup', document),
    city: trimText(document.city, 'city', document),
    zip_code: trimText(document.zipCode, 'zipCode', document),
    cross_streets: trimText(document.crossStreets, 'crossStreets', document),
    additional_info: additionalInfo,
    contact_name: trimText(document.contactName, 'contactName', document),
    contact_email: trimText(document.contactEmail, 'contactEmail', document),
    contact_phone: trimText(document.contactPhone, 'contactPhone', document),
    status: normalizeStatus(document),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };

  const ordered = Object.fromEntries(TARGET_COLUMNS.map((column) => [column, transformed[column]]));
  validateTransformedDocument(ordered, document);
  return ordered;
}

function statusCounts(documents) {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  for (const document of documents) {
    increment(counts, document.status);
  }
  return counts;
}

function buildReport({ payload, transformedDocuments, counts, duplicateIds }) {
  const statusMismatches = STATUS_ORDER.filter((status) => (counts.get(status) ?? 0) !== (EXPECTED_STATUS_COUNTS.get(status) ?? 0));
  if (statusMismatches.length > 0) {
    reportItems.push({
      id: '(all records)',
      title: '(status totals)',
      severity: 'warning',
      issue: 'Transformed status totals differ from the approved expected totals',
      action: 'Review the case-sensitive publication mapping before import.',
    });
  }

  const blocking = reportItems.filter((item) => item.severity === 'blocking');
  const warnings = reportItems.filter((item) => item.severity === 'warning');
  const informational = reportItems.filter((item) => item.severity === 'informational');
  const finalResult = blocking.length === 0 ? 'READY FOR IMPORT' : 'NOT READY FOR IMPORT';

  let markdown = '# Firestore Groups Transform Report\n\n';
  markdown += 'This report was generated from the local Firestore export only. No external service was contacted, and no data was imported.\n\n';
  markdown += '## Summary\n\n';
  markdown += `- Source path: \`${SOURCE_RELATIVE_PATH}\`\n`;
  markdown += `- Output path: \`${OUTPUT_RELATIVE_PATH}\`\n`;
  markdown += `- Source collection: ${payload.metadata?.collection ?? '(missing)'}\n`;
  markdown += `- Source project ID: ${payload.metadata?.projectId ?? '(missing)'}\n`;
  markdown += `- Source metadata count: ${payload.metadata?.documentCount ?? '(missing)'}\n`;
  markdown += `- Source parsed count: ${payload.documents.length}\n`;
  markdown += `- Transformed count: ${transformedDocuments.length}\n`;
  markdown += `- Blocking errors: ${blocking.length}\n`;
  markdown += `- Warnings: ${warnings.length}\n`;
  markdown += `- Informational items: ${informational.length}\n`;
  markdown += `- Final result: ${finalResult}\n\n`;

  markdown += '## Status Totals\n\n';
  markdown += `${table(['Status', 'Count'], STATUS_ORDER.map((status) => [status, counts.get(status) ?? 0]))}\n\n`;

  markdown += '## Publication Status Policy\n\n';
  markdown += 'Approved policy: preserve exact current publication behavior. Legacy source `status` and `hidden` values are compared case-sensitively, without trimming, lowercasing, or capitalization normalization. The mapping is: `status === "approved"` -> `approved`; otherwise `hidden === "no"` -> `approved`; otherwise `status === "rejected"` -> `rejected`; otherwise `status === "archived"` -> `archived`; otherwise `pending`.\n\n';
  markdown += 'The source record `wXjZduvItba0CfncL8TH` (`Missions Collective`) has `hidden: "No"` and missing `status`, so it transforms to `pending` under this policy.\n\n';

  markdown += '## Expected Status Totals Check\n\n';
  markdown += `${table(['Status', 'Expected', 'Actual', 'Matches'], STATUS_ORDER.map((status) => [
    status,
    EXPECTED_STATUS_COUNTS.get(status) ?? 0,
    counts.get(status) ?? 0,
    (EXPECTED_STATUS_COUNTS.get(status) ?? 0) === (counts.get(status) ?? 0) ? 'yes' : 'no',
  ]))}\n\n`;

  markdown += '## Normalizations Performed\n\n';
  markdown += normalizations.size > 0
    ? `${table(['Normalization', 'Count'], sortedEntries(normalizations))}\n\n`
    : 'None.\n\n';

  markdown += '## Discarded Source-Only Fields\n\n';
  markdown += discardedFields.size > 0
    ? `${table(['Field', 'Frequency'], sortedEntries(discardedFields))}\n\n`
    : 'None.\n\n';

  markdown += '## Record-Level Warnings And Errors\n\n';
  markdown += reportItems.length > 0
    ? `${table(['Document ID', 'Group title', 'Severity', 'Issue', 'Recommended action'], reportItems.map((item) => [
        item.id,
        item.title,
        item.severity,
        item.issue,
        item.action,
      ]))}\n\n`
    : 'None.\n\n';

  markdown += '## ID Preservation\n\n';
  markdown += duplicateIds.length === 0
    ? 'All output IDs were preserved from the source export, and no duplicate output IDs were found.\n\n'
    : `Duplicate output IDs were found: ${duplicateIds.map(markdownCell).join(', ')}.\n\n`;

  markdown += '## Safety Confirmation\n\n';
  markdown += '- The source export JSON was not modified.\n';
  markdown += '- The script does not import data.\n';
  markdown += '- The script does not connect to Firebase.\n';
  markdown += '- The script does not connect to Supabase.\n\n';
  markdown += `Final result: **${finalResult}**.\n`;

  return { markdown, finalResult, blocking, warnings, informational };
}

async function main() {
  const raw = await readFile(sourcePath, 'utf8');
  const payload = JSON.parse(raw);

  if (!Array.isArray(payload.documents)) {
    throw new Error('Source export must contain a documents array.');
  }

  const transformedDocuments = payload.documents
    .map(transformDocument)
    .sort((left, right) => left.id.localeCompare(right.id));

  const seenIds = new Set();
  const duplicateIds = [];
  for (const document of transformedDocuments) {
    if (seenIds.has(document.id)) {
      duplicateIds.push(document.id);
      addReportItem(document, 'blocking', `Duplicate output ID: ${document.id}`, 'Deduplicate records before import.');
    }
    seenIds.add(document.id);
  }

  const counts = statusCounts(transformedDocuments);
  const report = buildReport({ payload, transformedDocuments, counts, duplicateIds });
  await writeFile(reportPath, report.markdown, 'utf8');

  if (report.blocking.length === 0) {
    const transformedPayload = {
      metadata: {
        sourceCollection: payload.metadata?.collection ?? null,
        sourceProjectId: payload.metadata?.projectId ?? null,
        sourceDocumentCount: payload.documents.length,
        transformedAt: new Date().toISOString(),
        transformedDocumentCount: transformedDocuments.length,
        approvedCount: counts.get('approved') ?? 0,
        pendingCount: counts.get('pending') ?? 0,
        rejectedCount: counts.get('rejected') ?? 0,
        archivedCount: counts.get('archived') ?? 0,
      },
      documents: transformedDocuments,
    };

    await writeFile(outputPath, `${JSON.stringify(transformedPayload, null, 2)}\n`, 'utf8');
  }

  console.log(`Source path: ${sourcePath}`);
  console.log(`Output path: ${outputPath}`);
  console.log(`Source record count: ${payload.documents.length}`);
  console.log(`Transformed record count: ${transformedDocuments.length}`);
  console.log(`Status counts: approved=${counts.get('approved') ?? 0}, pending=${counts.get('pending') ?? 0}, rejected=${counts.get('rejected') ?? 0}, archived=${counts.get('archived') ?? 0}`);
  console.log(`Blocking error count: ${report.blocking.length}`);
  console.log(`Warning count: ${report.warnings.length}`);
  console.log(`Informational count: ${report.informational.length}`);
  console.log(`Final dry-run readiness result: ${report.finalResult}`);

  if (report.blocking.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Transform failed: ${error.message}`);
  process.exit(1);
});
