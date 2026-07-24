import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const COLLECTION_NAME = 'groups';
const OUTPUT_RELATIVE_PATH = 'migration-data/firestore-groups-export.json';

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  fail('FIREBASE_PROJECT_ID is required. Set it before running this exporter.');
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const outputPath = path.join(repoRoot, OUTPUT_RELATIVE_PATH);
const outputDir = path.dirname(outputPath);

function fail(message, error) {
  console.error(`Export failed: ${message}`);

  if (error?.message) {
    console.error(error.message);
  }

  process.exit(1);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function convertFirestoreValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof admin.firestore.DocumentReference) {
    return value.path;
  }

  if (value instanceof admin.firestore.GeoPoint) {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  if (Array.isArray(value)) {
    return value.map(convertFirestoreValue);
  }

  // Firestore map fields arrive as plain objects. Recurse without filtering keys
  // so unknown fields are preserved for the later Supabase transformation step.
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        convertFirestoreValue(nestedValue),
      ]),
    );
  }

  if (typeof value.toJSON === 'function') {
    return convertFirestoreValue(value.toJSON());
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      convertFirestoreValue(nestedValue),
    ]),
  );
}

async function main() {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  } catch (error) {
    fail('Google Application Default Credentials are unavailable or invalid.', error);
  }

  let snapshot;

  try {
    snapshot = await admin.firestore().collection(COLLECTION_NAME).get();
  } catch (error) {
    if (/credential|default credentials|application default|auth/i.test(error?.message ?? '')) {
      fail('Google Application Default Credentials are unavailable or invalid.', error);
    }

    fail(`Could not read Firestore collection "${COLLECTION_NAME}".`, error);
  }

  const documents = snapshot.docs
    .map((documentSnapshot) => ({
      ...convertFirestoreValue(documentSnapshot.data()),
      id: documentSnapshot.id,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const exportPayload = {
    metadata: {
      collection: COLLECTION_NAME,
      projectId,
      exportedAt: new Date().toISOString(),
      documentCount: documents.length,
    },
    documents,
  };

  console.log(`Target Firebase project ID: ${projectId}`);
  console.log(`Collection: ${COLLECTION_NAME}`);
  console.log(`Documents found: ${documents.length}`);
  console.log(`Output path: ${outputPath}`);

  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8');
  } catch (error) {
    fail(`Could not write export file at "${outputPath}".`, error);
  }
}

main().catch((error) => {
  fail('An unexpected error occurred.', error);
});
