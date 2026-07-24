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

Phase 2

Preparing Firestore export.

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

# Current Task

Generate a read-only export of the Firestore groups collection.

# Upcoming Tasks

1. Export Firestore
2. Review exported JSON
3. Build importer
4. Import into Supabase
5. Verify migrated data
6. Replace Firestore reads
7. Replace Firebase Function
8. Remove Firebase
9. Build admin dashboard

# Important Decisions

- Firestore IDs are preserved.
- The Firestore `hidden` field is replaced with canonical `status`.
- Legacy publication mapping is intentionally case-sensitive to preserve current live behavior: only `status` exactly `approved` or `hidden` exactly `no` becomes approved.
- `meeting_time` replaces the separate `hour`, `minute`, and `ampm` fields.
- Latitude and longitude are stored in the database.
- The public website should use RPC instead of direct table access.
- Firebase remains production until the migration is complete.

# Deployment Status

Current Production

Firebase

Current Development

Supabase
