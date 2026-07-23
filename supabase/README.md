# Supabase Migration Notes

This directory contains the reviewable PostgreSQL schema design for migrating `lifegatecommunity.com` from Firebase Cloud Firestore to Supabase PostgreSQL.

The current application remains unchanged during this phase. The public website still reads Firestore directly, and the add-group form still submits to the Firebase Cloud Function until a later implementation task replaces those paths.

## Migration File

- `supabase/migrations/20260723_001_create_groups_schema.sql`

## Schema Summary

The migration creates `public.groups` as the permanent relational table for community groups.

- Firestore document IDs are preserved in `groups.id`.
- New rows can receive a generated text ID by default without requiring PostgreSQL extensions.
- The legacy Firestore `hidden` field is not stored permanently.
- Publication uses one canonical `status` field with `pending`, `approved`, `rejected`, and `archived`.
- Meeting time is normalized into one nullable `meeting_time` column.
- Coordinates are stored as nullable `latitude` and `longitude` values without PostGIS.
- Contact phone numbers are stored as text, not numeric values.

Row Level Security is enabled. Browser roles do not receive direct table privileges. Public reads are intended to go through `public.get_public_groups()`, which returns only approved records and a limited column list.

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

Use this import mapping:

1. If `status` is exactly `"approved"`, map to `approved`.
2. Otherwise, if legacy `hidden` is exactly `"no"`, map to `approved`.
3. Otherwise, if `status` is exactly `"rejected"`, map to `rejected`.
4. Otherwise, if `status` is exactly `"archived"`, map to `archived`.
5. Otherwise, map to `pending`.

Records with conflicting values must be included in a migration exception report even though the mapping above determines the imported status.

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

## Security Notes

Anonymous and authenticated browser clients should not query `public.groups` directly. The migration revokes direct table privileges from `anon` and `authenticated` and does not create permissive insert, update, or delete policies.

The public RPC function `public.get_public_groups()` returns only approved records and omits private/admin fields such as `contact_name`, `contact_phone`, `status`, `submitted_at`, `created_at`, and `updated_at`.

The function intentionally returns `contact_email` because the current public website needs it for the contact button. That email address is visible to browser clients and may later be replaced by a server-side contact relay.

Future submissions and administrative operations should be performed by server-side code using Supabase service-role credentials or a purpose-built admin authentication system.
