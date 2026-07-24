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

LifeGate Dashboard database and authorization foundation.

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
- Initial dashboard frontend shell created for magic-link login, callback handling, protected session checks, logout, admin detection, and basic dashboard RPC counts.
- Dashboard magic-link authentication tested successfully on the shadow site.
- Resend custom SMTP tested successfully for portal authentication emails.
- First usable portal admin dashboard created: administrators can view all communities as responsive cards with status and open/closed badges, client-side search, status filters, and edit navigation.
- Full authenticated portal edit form implemented for contact-owned communities and administrator-managed communities. Updates use changed-only JSON patch payloads through the protected portal RPCs.
- Public Find a Community cards and marker-click details now show open/closed availability for active communities.
- Dashboard user profile-field migration drafted for `public.portal_users` with nullable display names and synchronized normalized email.
- Community Host profile RPC migration and dashboard profile editor drafted for review.
- Public Add My Community form now collects separate first and last names in local source, then sends both names plus combined contact name to the Supabase `submit-group` Edge Function.
- Direct one-time Community Host backfill implementation prepared in `scripts/backfill-community-hosts.mjs`.
- Backfill apply attempt hit a `service_role` permission gap updating `groups.owner_user_id`; a narrow permission-fix migration and improved partial-failure report handling are prepared for review.
- Netlify production replacement source prepared in `LIFEGATE-Community`: old active Firebase frontend files removed and the Supabase-based static site copied into the production repository root.

Supabase now contains all 22 migrated group records. Existing Firestore document IDs were preserved. The verified imported status totals are 17 approved, 5 pending, 0 rejected, and 0 archived.

The public-read cutover has passed local validation: `get_public_groups` returned 17 approved groups, 17 group cards rendered, 17 map markers rendered through the existing geocoding fallback, filters worked, AM/PM meeting times displayed correctly, and null meeting times displayed as `N/A`.

The deployed Supabase `submit-group` Edge Function has passed shadow-site OPTIONS preflight and invalid empty POST validation without writing data. The shadow add-group form now targets the Supabase Edge Function, but it has not yet been tested with a successful real submission.

The dashboard frontend is a static Netlify-compatible experience. It uses Supabase magic links with Resend custom SMTP. An admin Auth user has already been provisioned and added to `public.portal_users` with `is_admin = true`.

# Current Task

Replace the Netlify production repository contents with the revised Supabase-based site without rerunning backfill, sending invitations, changing DNS, changing Netlify settings, or modifying Supabase data/Auth users.

# Upcoming Tasks

1. Review and apply the portal foundation SQL migration
2. Verify successful shadow add-group submission through Supabase
3. Review inserted pending submission
4. Deploy public-read and submission cutovers
5. Implement location privacy and automatic geocoding
6. Remove Firebase
7. Build owner search/provisioning and remaining portal administration workflows
8. Review and explicitly execute the direct Community Host backfill when approved

# Important Decisions

- Firestore IDs are preserved.
- The Firestore `hidden` field is replaced with canonical `status`.
- Legacy publication mapping is intentionally case-sensitive to preserve current live behavior: only `status` exactly `approved` or `hidden` exactly `no` becomes approved.
- `meeting_time` replaces the separate `hour`, `minute`, and `ampm` fields.
- Latitude and longitude are stored in the database.
- The public website should use RPC instead of direct table access.
- Public listings use the Supabase `get_public_groups()` RPC.
- The Netlify production replacement branch contains the Supabase public-read cutover source.
- Add My Community submissions target the Supabase `submit-group` Edge Function.
- The Supabase `submit-group` Edge Function is a feature-parity replacement for the Firebase Function, but successful real submission testing is still pending.
- New Supabase group submissions must be inserted server-side as `pending` and must not accept browser-supplied publication status or coordinates.
- Dashboard login will start with Supabase email OTP only; phone/SMS OTP is deferred.
- Current development portal login uses magic links through Resend custom SMTP; six-digit OTP emails remain future work.
- Dashboard OTP requests must use `shouldCreateUser: false`; arbitrary visitors must not be able to create dashboard accounts.
- Dashboard users must be provisioned before login.
- Admin means a dashboard user with `public.portal_users.is_admin = true`.
- Community Host means the single contact/login associated with one or more communities.
- Each community has one Community Host for now, and one Community Host may own multiple communities.
- `public.portal_users` stores nullable `first_name` and `last_name` display fields plus normalized `email` copied from `auth.users`.
- Dashboard email is kept synchronized from `auth.users.email`; passwords, private keys, and authentication secrets are not stored in `public.portal_users`.
- Dashboard display names are managed in `public.portal_users`; Auth metadata is used only for initial backfill when names are blank.
- The production Dashboard redirect URL `https://lifegatecommunity.com/portal-callback.html` must be added to Supabase Auth redirect URLs before production magic-link testing.
- The old GitHub Pages callback URL may remain authorized temporarily only for previously sent magic links or invitations, then should be removed.
- One portal user may manage multiple groups.
- Administrators may also own groups as ordinary group contacts.
- Administrators will see both Admin and My Communities tabs.
- Non-admin contacts will see only My Communities.
- Contacts may see their own assigned groups in `pending`, `active`, and `inactive` statuses.
- The previously proposed Community Host audit phase is intentionally skipped.
- Direct Community Host backfill is a one-time operator script, not a database migration and not browser-side logic.
- Direct Community Host backfill must provision missing Auth users, create missing `portal_users` rows, preserve existing admins, and assign only null `groups.owner_user_id` values.
- Direct Community Host backfill must not overwrite conflicting existing owners; conflicts are reported for manual review.
- Direct Community Host backfill must send Dashboard invite/login email only to newly created Auth users and must not resend invitations to existing Auth users.
- New public submissions collect `first_name` and `last_name` separately and store the group contact display as combined `groups.contact_name`.
- Community Host profile names are stored on `public.portal_users`; existing nonblank profile names must not be overwritten by later group submissions.
- Group contact information and Dashboard profile information are currently related but separately editable; profile edits do not rewrite historical `groups.contact_name` values.
- Every signed-in Dashboard user may view and edit their own first name, last name, and email workflow regardless of Admin status.
- Personal profile settings cannot edit `is_admin`.
- Dashboard email changes use Supabase Auth email verification through the authenticated client; `portal_users.email` is not directly forced from the browser.
- `update_my_profile(jsonb)` updates only first and last name; it rejects email so pending/unconfirmed email values cannot be written into `portal_users`.
- `portal_users.email` changes only after Supabase Auth confirms the new login email and the Auth-to-portal_users trigger copies the confirmed value.
- A profile save can partially succeed: name changes may be saved even when the email-change request fails.
- Existing profile names may remain null until manually populated or edited through the Dashboard.
- Contacts cannot approve pending groups, set groups to `pending`, or change ownership.
- Contacts may toggle owned groups between `active` and `inactive`.
- Dashboard update RPCs use JSON patch semantics: omitted properties remain unchanged, and JSON null clears only nullable fields.
- Contacts cannot update ownership or coordinates through portal RPCs.
- `is_closed` defaults to `false`.
- `active` controls whether a group appears publicly; `inactive` hides it.
- `is_closed` indicates whether an active group is accepting new members.
- Contacts and administrators may update `is_closed`.
- Administrators can update group status and ownership through admin portal RPCs.
- The public Find a Community page displays open/closed status for active communities.
- Dashboard administrators can view all communities in responsive cards showing status, open/closed state, schedule, location summary, and contact fields.
- Dashboard admin search runs client-side against already-loaded `get_admin_groups()` data and matches title, city, cross streets, contact name, contact email, and contact phone.
- Dashboard admin status filters support All, Pending, Active, and Inactive counts and combine with search.
- Dashboard edit links open a protected edit form. Contacts may edit owned communities, control website visibility through active/inactive status, and mark a group closed.
- Pending communities show Pending Review for contacts and keep the visibility control disabled until approval.
- Administrators may edit status, coordinates, and owner UUID in addition to normal community fields.
- Dashboard edit saves send JSON patch payloads containing only changed fields through either `update_my_community(text, jsonb)` or `update_admin_group(text, jsonb)`.
- Dashboard user-management UI, owner search, and account provisioning remain future work.
- Public Find a Community cards and marker-click details display open/closed availability; closed active groups remain visible.
- No public open/closed filter exists yet.
- `private.is_portal_admin()` is an internal helper and is not directly callable by browser roles.
- Group ownership uses `auth.users.id`, not `contact_email`.
- Changing a group's contact email must not automatically transfer ownership.
- Browser geocoding remains temporarily in place until the privacy-safe location phase.
- Firebase remains preserved as a rollback/reference system until the migration is complete. After the Netlify replacement commit is pushed and deployed, production runtime should use Supabase.
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

Production target

Netlify auto-deploy from `wantinglittle/LIFEGATE-Community` `main`, using Supabase public RPCs and the Supabase `submit-group` Edge Function after the replacement commit is pushed.

Rollback/reference

The old Firebase-backed `LIFEGATE-Community` repository and Firebase project remain intact until parity testing and rollback planning are complete.
