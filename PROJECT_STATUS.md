# Project

Migration of lifegatecommunity.com from Firebase Cloud Firestore to Supabase PostgreSQL.

Goals:

- Preserve all current functionality.
- Improve the backend architecture.
- Minimize production risk.
- Maintain rollback capability until Firebase is retired.

# Current Architecture

Frontend

- Static HTML
- CSS
- JavaScript

Backend

Current:

- Firebase Firestore
- Firebase Cloud Function

Target:

- Supabase PostgreSQL
- Supabase RPC
- Server-side submission endpoint

# Current Phase

Public read migration from Firebase to Supabase.

# Completed

- Repository inspected
- Firebase architecture documented
- Supabase project created
- Initial PostgreSQL schema designed
- SQL reviewed
- Migration deployed
- Supabase CLI configured
- Git branch created
- Firestore export utility created
- Firestore export completed
- Firestore audit completed
- Firestore transformation completed
- Supabase import completed
- Supabase import verification completed
- Public-read cutover implementation completed
- Public-read cutover locally validated

Supabase now contains all 22 migrated group records. Existing Firestore document IDs were preserved. The verified imported status totals are 17 approved, 5 pending, 0 rejected, and 0 archived.

The public-read cutover has passed local validation: `get_public_groups` returned 17 approved groups, 17 group cards rendered, 17 map markers rendered through the existing geocoding fallback, filters worked, AM/PM meeting times displayed correctly, and null meeting times displayed as `N/A`.

# Current Task

Prepare the locally validated Supabase public-read cutover for deployment review.

# Upcoming Tasks

1. Deploy public-read cutover
2. Replace Firebase Function
3. Implement location privacy and automatic geocoding
4. Remove Firebase
5. Build admin dashboard

# Important Decisions

- Firestore IDs are preserved.
- The Firestore `hidden` field is replaced with canonical `status`.
- Legacy publication mapping is intentionally case-sensitive to preserve current live behavior: only `status` exactly `approved` or `hidden` exactly `no` becomes approved.
- `meeting_time` replaces the separate `hour`, `minute`, and `ampm` fields.
- Latitude and longitude are stored in the database.
- The public website should use RPC instead of direct table access.
- Public listings use the Supabase `get_public_groups()` RPC in development.
- The live site has not yet been deployed with the public-read cutover.
- Add-group submissions still use the existing Firebase Function.
- Browser geocoding remains temporarily in place until the privacy-safe location phase.
- Firebase remains production until the migration is complete.
- Treat every submitted meeting location as private.
- Never expose or map the exact submitted location.
- Public listings should use a nearby public-safe cross street or generalized area.
- The original submitted location remains private and server-side only.
- Location changes must automatically trigger regeneration of the public-safe map location.
- Prefer a nearby valid intersection for the public-safe location.
- If no reliable intersection can be determined, use a generalized city/ZIP location and flag it for review.
- Do not use random coordinate offsets as the primary privacy method.
- The browser must receive only public-safe labels and coordinates.
- Leaders may include venue details such as "Starbucks" in the group description if desired.
- Location privacy and automatic geocoding will be implemented after the initial public-read cutover.

# Deployment Status

Current Production

Firebase

Current Development

Supabase
