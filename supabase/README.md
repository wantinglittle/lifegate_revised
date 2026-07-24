# Supabase Migration Notes

This directory contains the reviewable PostgreSQL schema design for migrating `lifegatecommunity.com` from Firebase Cloud Firestore to Supabase PostgreSQL.

The shadow application now reads approved public groups from Supabase and submits new groups through the Supabase `submit-group` Edge Function. The live Firebase project remains intact as the production rollback/reference system until parity testing and deployment are complete.

## Migration File

- `supabase/migrations/20260723_001_create_groups_schema.sql`
- `supabase/migrations/20260724090000_grant_groups_import_permissions.sql`
- `supabase/migrations/20260724144000_create_portal_foundation.sql`
- `supabase/migrations/20260724150000_add_is_closed_to_groups.sql`
- `supabase/migrations/20260724170000_add_portal_user_profile_fields.sql`
- `supabase/migrations/20260724183000_add_my_profile_rpcs.sql`

## Firestore Export

Use `scripts/export-firestore-groups.mjs` to create a read-only JSON export of the Firestore `groups` collection before transforming records for Supabase. The script preserves each Firestore document ID as `id`, converts Firestore-specific values into JSON-safe values, and writes `migration-data/firestore-groups-export.json`.

PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure-path\firebase-service-account.json"
$env:FIREBASE_PROJECT_ID="your-firebase-project-id"
node .\scripts\export-firestore-groups.mjs
```

Before proceeding, confirm that the Firebase project ID printed by the script is correct. The exporter performs a one-time read only and does not write, update, or delete Firebase data.

Never commit the service-account file. The generated export JSON is intentionally ignored by Git.

After exporting, clear the environment-variable values:

```powershell
Remove-Item Env:\GOOGLE_APPLICATION_CREDENTIALS
Remove-Item Env:\FIREBASE_PROJECT_ID
```

## Supabase Import

Use `scripts/import-groups-to-supabase.mjs` after reviewing `migration-data/firestore-groups-transformed.json` and `migration-data/firestore-transform-report.md`. The importer validates the local transformed JSON before any network access. Its default mode is a dry run and does not contact Supabase.

Dry run:

```powershell
node .\scripts\import-groups-to-supabase.mjs
```

Apply, only after review:

```powershell
$env:SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SECRET_KEY="<your-elevated-supabase-secret-key>"
node .\scripts\import-groups-to-supabase.mjs --apply --confirm=IMPORT_22_LIFEGATE_GROUPS
```

Prefer `SUPABASE_SECRET_KEY` for current Supabase secret keys beginning with `sb_secret_`. The importer sends these keys only in the `apikey` header because they are not JWTs.

For older JWT-formatted service-role keys, the importer also accepts `SUPABASE_SERVICE_ROLE_KEY` when `SUPABASE_SECRET_KEY` is absent. In that legacy mode it sends both `apikey` and `Authorization: Bearer <key>`.

The script requires both `--apply` and `--confirm=IMPORT_22_LIFEGATE_GROUPS` before making any network request. It checks for existing rows by Firestore ID and stops without writing if any target IDs already exist. It does not update, overwrite, upsert, or delete rows.

Never commit Supabase keys. After importing, clear the environment-variable values:

```powershell
Remove-Item Env:\SUPABASE_URL
Remove-Item Env:\SUPABASE_SECRET_KEY
```

## Public Read Cutover

The static public listing reads active groups through the `public.get_public_groups()` RPC. Browser code must never query `public.groups` directly and must never include a Supabase secret key or service-role key.

Set the public browser configuration in `supabase-config.js` before deploying the read cutover:

```js
export const SUPABASE_URL = "https://your-project-ref.supabase.co";
export const SUPABASE_ANON_KEY = "your-publishable-anon-key";
```

These are public browser values. Security relies on the locked-down table permissions and narrow RPC output.

## Submit Group Edge Function

`supabase/functions/submit-group/index.ts` is the shadow Supabase replacement for the current Firebase `submitGroup` Cloud Function. It accepts browser `POST` submissions, handles harmless `OPTIONS` preflight requests, verifies reCAPTCHA server-side, validates the same form fields, inserts one pending row into `public.groups`, and then attempts the EmailJS notification.

The shadow `add-group.js` form points to the deployed Supabase Edge Function. Firebase remains unchanged during this testing phase and the legacy Firebase Function should stay available for rollback until parity testing is complete.

Required Edge Function secrets:

- `RECAPTCHA_SECRET_KEY`
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_PRIVATE_KEY`
- `EMAILJS_SERVICE_ID`
- `EMAILJS_TEMPLATE_ID`

Supabase provides the server-side project URL and service-role credentials to Edge Functions. The browser must use only the publishable key in `supabase-config.js`; elevated credentials stay inside the Edge Function environment and must never be committed.

Hosted Supabase automatically provides `SUPABASE_SECRET_KEYS`, a JSON object of named elevated keys. The `submit-group` function uses its default key when available. For local development, configure `SUPABASE_SECRET_KEY` in a local env file. The legacy `SUPABASE_SERVICE_ROLE_KEY` remains a fallback for projects still using JWT-formatted service-role keys.

When the resolved key begins with `sb_secret_`, the function sends it only as the `apikey` header. Legacy JWT service-role keys are sent as both `apikey` and `Authorization: Bearer <key>`. None of these elevated values should ever be exposed to browser code, committed to Git, or placed in `supabase-config.js`.

The function is intentionally public in `supabase/config.toml`:

```toml
[functions.submit-group]
verify_jwt = false
```

Unauthenticated browser visitors need to submit the public form, so protection comes from exact CORS allow-listing, reCAPTCHA, server-side validation, and trusted server-side inserts. The function allows `https://wantinglittle.github.io` and local `localhost`/`127.0.0.1` origins for testing. It does not use wildcard production CORS.

Local serve, if Docker and the Supabase CLI are already available:

```powershell
supabase functions serve submit-group --env-file .\supabase\functions\.env
```

Deploy later, only after review:

```powershell
supabase functions deploy submit-group
```

The deployed function URL format will be:

```text
https://your-project-ref.supabase.co/functions/v1/submit-group
```

Harmless preflight test after local serve:

```powershell
Invoke-WebRequest -Method OPTIONS `
  -Uri "http://127.0.0.1:54321/functions/v1/submit-group" `
  -Headers @{ Origin = "http://localhost:5500" }
```

Do not run an apply submission test against production credentials until the frontend cutover plan is approved.

### Community Host submission behavior

Version 1.0 Internal Beta keeps the deployed `submit-group` flow as the submission boundary: public visitors submit a community, the Edge Function validates the request, and the new group is inserted as `pending` for admin review. The beta does not automatically create Auth users, assign owners, backfill Community Hosts, or send Dashboard invitations.

Admin means a dashboard user with `public.portal_users.is_admin = true`. Community Host means the single contact/login associated with one or more communities.

Submission payload shape:

- Previous browser payload sent a single `contactName` field.
- Current browser payload sends `first_name`, `last_name`, and a combined `contactName`.
- The group still stores the combined display value in `public.groups.contact_name`.
- The Community Host profile stores separate names in `public.portal_users.first_name` and `public.portal_users.last_name`.

Future required flow:

1. Normalize `contactEmail` with lowercase and trimmed whitespace.
2. Look for an existing Auth user by normalized email using trusted server-side Admin API access.
3. If found, reuse that Auth user ID and ensure a `public.portal_users` row exists without downgrading `is_admin = true`.
4. If not found, create or invite the Auth user through server-side Admin API tooling and create `public.portal_users` with `is_admin = false`.
5. Insert the group as `pending` with `groups.owner_user_id` set to the resolved Auth user ID.
6. Send dashboard-access email immediately.

The dashboard-access email should explain that the community was received, is pending review, the Community Host may sign in to view and edit it, the Dashboard URL is available, and approval controls remain admin-only. New Community Hosts receive an Auth invite/access email. Existing Community Hosts should not receive repeated invitation emails for every later submission; use a normal informational email only when helpful.

Existing Auth/portal user behavior:

- reuse the existing user ID;
- preserve `is_admin` exactly as-is;
- assign the submitted group to that user;
- do not overwrite nonblank `first_name` or `last_name`;
- fill `first_name` or `last_name` only when the existing value is null or blank;
- keep `portal_users.email` normalized to the Auth email.

Existing Auth user without `portal_users` behavior:

- preserve the Auth user;
- create the missing `portal_users` row with submitted first and last names;
- use `is_admin = false` unless a trusted source explicitly says otherwise.

## Schema Summary

The migration creates `public.groups` as the permanent relational table for community groups.

- Firestore document IDs are preserved in `groups.id`.
- New rows can receive a generated text ID by default without requiring PostgreSQL extensions.
- The legacy Firestore `hidden` field is not stored permanently.
- Publication uses one canonical `status` field with `pending`, `active`, and `inactive`.
- Dashboard ownership uses nullable `groups.owner_user_id`, which references `auth.users.id`; existing migrated rows remain unassigned until explicitly mapped.
- `groups.is_closed` is a non-null boolean that defaults to `false`.
- `portal_users.first_name` and `portal_users.last_name` are nullable dashboard display-name fields.
- `portal_users.email` stores a normalized copy of `auth.users.email` for dashboard user management and is kept synchronized from Auth.
- Meeting time is normalized into one nullable `meeting_time` column.
- Coordinates are stored as nullable `latitude` and `longitude` values without PostGIS.
- Contact phone numbers are stored as text, not numeric values.

Row Level Security is enabled. Browser roles do not receive direct table privileges. Public reads are intended to go through `public.get_public_groups()`, which returns only active records and a limited column list.

## Firestore To PostgreSQL Field Mapping

| Firestore source | PostgreSQL target | Notes |
| --- | --- | --- |
| Firestore document ID | `id` | Preserve exactly during import. |
| `title` | `title` | Required, max 120 characters. |
| `description` | `description` | Required, max 500 characters. |
| `contactName` | `contact_name` | Required. |
| `contactEmail` | `contact_email` | Required, basic email format check. |
| `contactPhone` | `contact_phone` | Required text value. Do not convert to number. |
| `day` | `day` | Nullable; if present must be a valid weekday. |
| `hour`, `minute`, `ampm` | `meeting_time` | Convert as described below. |
| `audience` | `audience` | Required; allowed values are `All`, `Men`, `Women`. |
| `ageGroup` | `age_group` | Required; allowed values are `All-ages`, `Kids`, `Teens`, `Adult`. |
| `city` | `city` | Required, max 120 characters. |
| `zipCode` | `zip_code` | Required text value. |
| `crossStreets` | `cross_streets` | Required. |
| `additionalInfo` | `additional_info` | Nullable. Empty values should not normally block import. |
| `submittedAt` | `submitted_at` | Nullable, but missing values should be reported. |
| Firestore `coords.lat`, if found | `latitude` | Nullable; must be between -90 and 90. |
| Firestore `coords.lng`, if found | `longitude` | Nullable; must be between -180 and 180. |

## Time Conversion

Firestore stores meeting time as separate string-like fields: `hour`, `minute`, and `ampm`. Import should convert those fields into one PostgreSQL `time without time zone` value in `meeting_time`.

Examples:

| Firestore `hour` | Firestore `minute` | Firestore `ampm` | PostgreSQL `meeting_time` |
| --- | --- | --- | --- |
| `"6"` | `"00"` | `"PM"` | `18:00:00` |
| `"12"` | `"30"` | `"AM"` | `00:30:00` |
| `"12"` | `"00"` | `"PM"` | `12:00:00` |

If the time fields are missing, incomplete, or invalid, set `meeting_time` to `NULL` and include the record in the migration exception report for manual review.

## Publication Status Conversion

The current public website treats a Firestore group as published when either:

- `status == "approved"`, or
- legacy `hidden == "no"`

The import used this historical mapping:

1. If `status` is exactly `"approved"`, map to `approved`.
2. Otherwise, if legacy `hidden` is exactly `"no"`, map to `approved`.
3. Otherwise, if `status` is exactly `"rejected"`, map to `rejected`.
4. Otherwise, if `status` is exactly `"archived"`, map to `archived`.
5. Otherwise, map to `pending`.

Records with conflicting values must be included in a migration exception report even though the mapping above determines the imported status.

The portal foundation migration replaces the publication model with:

- `approved` -> `active`
- `pending` -> `pending`
- `archived` -> `inactive`
- `rejected` -> `inactive`

The expected imported totals after conversion are 17 active, 5 pending, and 0 inactive. `public.get_public_groups()` now returns only `active` groups.

Examples of conflicts to report:

- `status = "pending"` and `hidden = "no"`
- `status = "approved"` and `hidden = "yes"`

## Migration Exception Report

The future import script must report these issues:

- Missing required fields
- Invalid audience
- Invalid age group
- Invalid day
- Invalid or incomplete time
- Invalid email format
- Duplicate IDs
- Conflicting `status` and `hidden` values
- Missing `submittedAt`
- Empty `additionalInfo`
- Missing coordinates
- Values altered through normalization
- Records that cannot be inserted due to constraints

Missing coordinates and empty `additionalInfo` are informational and should not normally block import.

## Dashboard Authorization Architecture

The future LifeGate Dashboard uses Supabase email OTP as the initial login method. Password login is not required. Phone/SMS OTP is deferred. OTP requests must set `shouldCreateUser: false`, because arbitrary visitors must not be able to create dashboard accounts. Dashboard users are provisioned ahead of time in `public.portal_users`.

`public.portal_users` stores dashboard profile fields in addition to the Auth user link and admin flag:

- `first_name` and `last_name` are nullable display-name fields. They are initially backfilled from Auth metadata when available, then treated as managed dashboard data.
- `email` is copied from `auth.users.email`, normalized with lowercase and trimmed whitespace, required after backfill, and protected by a case-insensitive uniqueness index.
- A private trigger-only helper keeps `portal_users.email` synchronized when the matching Auth user's email changes.
- No passwords, service-role keys, private keys, or authentication secrets are stored in `public.portal_users`.
- Dashboard user-management UI, owner search, and account provisioning remain future work.

Name handling is intentionally conservative. Do not split `contact_name` into `first_name` and `last_name` automatically, because values such as `Larry and Amy Knepp`, `Ministry Team`, or unusual multi-part names can be corrupted. Email is backfilled automatically from Auth; first and last names use Auth metadata when available and otherwise remain nullable until edited through future admin user-management tools.

Community Host ownership rules:

- One Community Host/login is associated with one or more communities.
- One community has one Community Host for now.
- Pending, active, and inactive owned communities appear in the Community Host's Dashboard.
- Ownership is stored in `groups.owner_user_id`, never permanently inferred from email.
- Contact email is used only by trusted server-side code to locate or provision the Auth user.
- Existing admins must remain admins if they are also Community Hosts.
- Contacts cannot choose or update `owner_user_id` from the browser.

The static dashboard frontend uses Supabase magic links through Resend custom SMTP:

- `portal-login.html` requests the sign-in link with `shouldCreateUser: false`.
- `portal-callback.html` handles the magic-link callback and redirects to the protected shell.
- `portal.html` requires an authenticated session, displays the signed-in email, supports logout, calls `get_my_communities()` for every user, and calls `get_admin_groups()` to render the administrator dashboard when allowed.
- Administrators see all communities as responsive cards with status badges, open/closed availability, schedule, public-safe location summary, and contact fields.
- Administrator search is client-side against already-loaded `get_admin_groups()` data and matches title, city, cross streets, contact name, contact email, and contact phone.
- Administrator status filters support All, Pending, Active, and Inactive counts and combine with search.
- `portal-edit.html` is the protected community edit page. It resolves the selected record only from authorized portal RPC data and does not expose the group ID visibly.
- Contacts may edit owned communities through `public.update_my_community(text, jsonb)`. They control website visibility with active/inactive status, but pending communities keep the visibility control disabled until approval.
- Contacts and administrators may mark a group closed with `is_closed`; closed status does not itself hide the group.
- Administrators edit any community returned by `get_admin_groups()` through `public.update_admin_group(text, jsonb)` and may update status, coordinates, and the owner UUID.
- Edit saves compare the form to the originally loaded record and send JSON patch payloads containing only changed fields. Omitted properties remain unchanged, and JSON null is sent only for approved nullable fields intentionally cleared by the user.
- Unknown emails must not create Auth users. The UI uses a generic success/error response and does not intentionally reveal whether an email address is provisioned.
- Dashboard user-management UI, owner search, and account provisioning remain future work. The public Find a Community page displays open/closed availability, but does not have an open/closed filter yet.

For hosted GitHub Pages testing, add this redirect URL in Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs:

```text
https://wantinglittle.github.io/lifegate_revised/portal-callback.html
```

The browser code derives the callback URL from the current page location so local and repository-subdirectory paths continue to work. Six-digit OTP emails remain future work.

Group ownership is controlled by `groups.owner_user_id`, which references `auth.users.id`. It is independent from `contact_email`; changing a group's contact email does not transfer ownership. One user may own multiple groups, and an administrator may also own groups as an ordinary contact.

Dashboard authorization uses narrow authenticated RPCs rather than broad direct table grants:

- `private.is_portal_admin()` checks the authenticated user's `portal_users.is_admin` flag. It lives in the non-exposed `private` schema to keep helper implementation details out of the public API surface. Browser roles do not receive `USAGE` on the `private` schema and cannot call this helper directly.
- `public.get_my_communities()` returns only groups where `owner_user_id = auth.uid()`, including pending, active, and inactive groups plus private contact fields.
- `public.get_admin_groups()` returns all groups only when `private.is_portal_admin()` is true.
- `public.update_my_community(p_group_id text, p_changes jsonb)` patch-updates contact-editable fields, `is_closed`, and active/inactive status for a group owned by the authenticated user. It does not accept ownership, IDs, timestamps, or coordinates, and contacts cannot set `pending`.
- `public.update_admin_group(p_group_id text, p_changes jsonb)` requires administrator permission and can patch normal group fields, `is_closed`, coordinates, status, and owner assignment.
- `public.get_my_profile()` returns only the authenticated caller's `portal_users` row: `user_id`, `first_name`, `last_name`, `email`, and `is_admin`.
- `public.update_my_profile(p_changes jsonb)` patch-updates the authenticated caller's first and last name. The only allowed keys are `first_name` and `last_name`; `email`, `is_admin`, IDs, and timestamps are rejected. Login email changes must go through Supabase Auth verification.

The base `public.groups` table remains locked down for `anon` and `authenticated`, so contacts cannot bypass column restrictions with direct updates. Direct table `DELETE` is not granted. This RPC shape is safer than plain row-level `UPDATE` policies because PostgreSQL RLS filters rows but does not, by itself, provide ergonomic per-column update restrictions for browser clients.

Dashboard update RPCs use JSON patch semantics:

- `p_changes` must be a non-empty JSON object.
- Omitted properties remain unchanged.
- JSON null clears only nullable fields.
- Required text fields reject JSON null, blank strings, and invalid values.
- Contacts may update only `title`, `description`, `contact_name`, `contact_email`, `contact_phone`, `day`, `meeting_time`, `audience`, `age_group`, `city`, `zip_code`, `cross_streets`, and `additional_info`.
- Contacts may also update `is_closed` and may set `status` only to `active` or `inactive`.
- Contacts cannot set status to `pending`.
- Contacts may clear only `day`, `meeting_time`, and `additional_info`.
- Admins may also update `latitude`, `longitude`, `status`, `is_closed`, and `owner_user_id`.
- Admins may clear only `day`, `meeting_time`, `additional_info`, `latitude`, `longitude`, and `owner_user_id`.
- Admin coordinate patches require `latitude` and `longitude` together; both may be numbers or both may be JSON null.

Personal profile update semantics:

- `p_changes` must be a non-empty JSON object.
- Omitted properties remain unchanged.
- Unknown keys are rejected.
- `first_name` and `last_name` must be nonblank strings of at most 80 characters after update.
- `email` is not accepted by `update_my_profile()`.
- Login email changes are requested by the authenticated browser client with `supabase.auth.updateUser({ email: normalizedEmail })`.
- `portal_users.email` changes only after Supabase Auth confirms and writes the new `auth.users.email`; the Auth-to-portal_users trigger then copies the confirmed normalized email.
- Failed or abandoned email confirmation leaves the original confirmed login email intact.
- Partial success is possible: profile names may save successfully even if the email-change request fails.
- `is_admin` cannot be edited through personal profile settings.

Dashboard profile UI:

- every signed-in Dashboard user, Admin or Community Host, can view first name, last name, and email;
- every signed-in Dashboard user can edit first and last name through `update_my_profile()`;
- email changes are requested through Supabase Auth verification and may require confirmation before the displayed login email changes;
- the dashboard keeps the currently confirmed login email visible until Auth reports the change as completed and the profile reloads;
- the Auth UUID is not displayed;
- changing profile names does not rewrite historical `groups.contact_name` values in this phase.

Public visibility and open/closed meaning:

- `active` determines whether a group appears publicly through `public.get_public_groups()`.
- `inactive` hides a group from the public listing.
- `is_closed` indicates whether an active group is currently accepting new members.
- Public cards and marker-click details display `Open to New Members` or `Currently Closed`.
- Closed active groups remain visible publicly; no public open/closed filter exists yet.

## Future Community Host Ownership Work

Automatic Community Host provisioning, Auth creation, invitation delivery, owner assignment, and existing-community ownership backfill remain future work outside Version 1.0 Internal Beta. No audit or backfill tool is included in the beta publication set.

Future ownership work should preserve admins, avoid overwriting nonblank profile names, use normalized Auth email only as a controlled matching input, and store permanent ownership in `groups.owner_user_id`.

## Security Notes

Anonymous and authenticated browser clients should not query `public.groups` directly. The migration revokes direct table privileges from `anon` and `authenticated` and does not create permissive insert, update, or delete policies.

The public RPC function `public.get_public_groups()` returns only active records and omits private/admin fields such as `owner_user_id`, `contact_name`, `contact_phone`, `status`, `submitted_at`, `created_at`, and `updated_at`.

The function intentionally returns `contact_email` because the current public website needs it for the contact button. That email address is visible to browser clients and may later be replaced by a server-side contact relay.

Public submissions are performed by the Supabase `submit-group` Edge Function. Dashboard operations are designed as authenticated RPCs. Future high-risk administrative workflows may still move behind Edge Functions if server-side auditing, rate limiting, or richer validation becomes necessary.

Auth user creation, invitation, and ownership assignment must remain server-side only. No service-role key, secret key, private key, database password, or Admin API capability may appear in browser JavaScript. The public `submit-group` endpoint can remain callable by anonymous visitors, but privileged work must stay inside the Edge Function. Portal login must keep `shouldCreateUser: false`, and browser roles must not receive direct access to `auth.users`.
