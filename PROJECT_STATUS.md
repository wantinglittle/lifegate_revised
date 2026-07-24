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

LifeGate Portal database and authorization foundation.

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
- Supabase `submit-group` Edge Function deployed and basic preflight/error handling validated
- Shadow add-group form endpoint updated to target Supabase Edge Function
- Initial portal frontend shell created for magic-link login, callback handling, protected session checks, logout, admin detection, and basic portal RPC counts.
- Portal magic-link authentication tested successfully on the shadow site.
- Resend custom SMTP tested successfully for portal authentication emails.
- First usable portal admin dashboard created: administrators can view all communities as responsive cards with status and open/closed badges, client-side search, status filters, and edit navigation.
- Full authenticated portal edit form implemented for contact-owned communities and administrator-managed communities. Updates use changed-only JSON patch payloads through the protected portal RPCs.

Supabase now contains all 22 migrated group records. Existing Firestore document IDs were preserved. The verified imported status totals are 17 approved, 5 pending, 0 rejected, and 0 archived.

The public-read cutover has passed local validation: `get_public_groups` returned 17 approved groups, 17 group cards rendered, 17 map markers rendered through the existing geocoding fallback, filters worked, AM/PM meeting times displayed correctly, and null meeting times displayed as `N/A`.

The deployed Supabase `submit-group` Edge Function has passed shadow-site OPTIONS preflight and invalid empty POST validation without writing data. The shadow add-group form now targets the Supabase Edge Function, but it has not yet been tested with a successful real submission.

The portal frontend is a static GitHub Pages-compatible experience. It uses Supabase magic links with Resend custom SMTP. An admin Auth user has already been provisioned and added to `public.portal_users` with `is_admin = true`.

# Current Task

Review and test the authenticated LifeGate Portal edit form on the shadow site.

# Upcoming Tasks

1. Review and apply the portal foundation SQL migration
2. Verify successful shadow add-group submission through Supabase
3. Review inserted pending submission
4. Deploy public-read and submission cutovers
5. Implement location privacy and automatic geocoding
6. Remove Firebase
7. Build owner search/provisioning and remaining portal administration workflows

# Important Decisions

- Firestore IDs are preserved.
- The Firestore `hidden` field is replaced with canonical `status`.
- Legacy publication mapping is intentionally case-sensitive to preserve current live behavior: only `status` exactly `approved` or `hidden` exactly `no` becomes approved.
- `meeting_time` replaces the separate `hour`, `minute`, and `ampm` fields.
- Latitude and longitude are stored in the database.
- The public website should use RPC instead of direct table access.
- Public listings use the Supabase `get_public_groups()` RPC in development.
- The live site has not yet been deployed with the public-read cutover.
- Shadow add-group submissions now target the Supabase `submit-group` Edge Function.
- The Supabase `submit-group` Edge Function is a feature-parity replacement for the Firebase Function, but successful real submission testing is still pending.
- New Supabase group submissions must be inserted server-side as `pending` and must not accept browser-supplied publication status or coordinates.
- Portal login will start with Supabase email OTP only; phone/SMS OTP is deferred.
- Current development portal login uses magic links through Resend custom SMTP; six-digit OTP emails remain future work.
- Portal OTP requests must use `shouldCreateUser: false`; arbitrary visitors must not be able to create portal accounts.
- Portal users must be provisioned before login.
- The GitHub Pages redirect URL `https://wantinglittle.github.io/lifegate_revised/portal-callback.html` must be added to Supabase Auth redirect URLs before hosted magic-link testing.
- One portal user may manage multiple groups.
- Administrators may also own groups as ordinary group contacts.
- Administrators will see both Admin and My Communities tabs.
- Non-admin contacts will see only My Communities.
- Contacts may see their own assigned groups in `pending`, `active`, and `inactive` statuses.
- Contacts cannot approve pending groups, set groups to `pending`, or change ownership.
- Contacts may toggle owned groups between `active` and `inactive`.
- Portal update RPCs use JSON patch semantics: omitted properties remain unchanged, and JSON null clears only nullable fields.
- Contacts cannot update ownership or coordinates through portal RPCs.
- `is_closed` defaults to `false`.
- `active` controls whether a group appears publicly; `inactive` hides it.
- `is_closed` indicates whether an active group is accepting new members.
- Contacts and administrators may update `is_closed`.
- Administrators can update group status and ownership through admin portal RPCs.
- The public Find a Community page will later display open/closed status.
- Portal administrators can view all communities in responsive cards showing status, open/closed state, schedule, location summary, and contact fields.
- Portal admin search runs client-side against already-loaded `get_admin_groups()` data and matches title, city, cross streets, contact name, contact email, and contact phone.
- Portal admin status filters support All, Pending, Active, and Inactive counts and combine with search.
- Portal edit links open a protected edit form. Contacts may edit owned communities, control website visibility through active/inactive status, and mark a group closed.
- Pending communities show Pending Review for contacts and keep the visibility control disabled until approval.
- Administrators may edit status, coordinates, and owner UUID in addition to normal community fields.
- Portal edit saves send JSON patch payloads containing only changed fields through either `update_my_community(text, jsonb)` or `update_admin_group(text, jsonb)`.
- Owner search and account provisioning remain future work.
- Public Find a Community open/closed display is still pending.
- `private.is_portal_admin()` is an internal helper and is not directly callable by browser roles.
- Group ownership uses `auth.users.id`, not `contact_email`.
- Changing a group's contact email must not automatically transfer ownership.
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
