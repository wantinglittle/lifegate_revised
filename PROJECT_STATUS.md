# Project Status

`https://lifegatecommunity.com` is the production LifeGate Community website.

Production is now cut over from Firebase to Supabase and is hosted on Netlify from the `main` branch of the `LIFEGATE-Community` GitHub repository.

# Production Architecture

Frontend:

- Static HTML
- CSS
- JavaScript
- Hosted by Netlify

Backend:

- Supabase PostgreSQL
- Supabase RPCs for public and authenticated data access
- Supabase Auth for Dashboard access
- Supabase Edge Function `submit-group` for Add My Community submissions

Production repository:

- `wantinglittle/LIFEGATE-Community`
- Local working repository: `C:\Users\User\OneDrive\Documents\Websites\Lifegate Website\LIFEGATE-Community`
- Production branch: `main`
- Netlify automatically deploys production from `main`

# Production URLs

Use `https://lifegatecommunity.com` for all production URLs, including:

- Login
- Callback
- Dashboard
- Add My Community
- Sitemap
- Canonical URLs
- Open Graph URLs

Important production auth URLs:

- Supabase Auth Site URL: `https://lifegatecommunity.com`
- Primary Dashboard callback: `https://lifegatecommunity.com/portal-callback.html`

Do not reference `https://wantinglittle.github.io/lifegate_revised/` except where temporary backward compatibility with previously issued invitation links requires it.

The temporary GitHub Pages callback exists only to support invitation emails already sent before production cutover. It may be removed after those invitations are no longer needed.

# Current Phase

Production is live on Netlify using Supabase.

The next development phase is incremental production hardening and Dashboard/Community Host workflow completion.

# Completed

- Firebase architecture inspected and documented.
- Supabase project created.
- PostgreSQL schema designed, reviewed, and deployed.
- Supabase CLI configured.
- Firestore export, audit, transformation, import, and verification completed.
- Existing Firestore document IDs preserved in Supabase.
- Supabase contains all 22 migrated group records.
- Verified imported status totals: 17 approved, 5 pending, 0 rejected, 0 archived.
- Public-read cutover implemented and locally validated.
- `get_public_groups()` RPC used for public listings.
- Supabase `submit-group` Edge Function deployed for Add My Community submissions.
- Add My Community submissions target Supabase and insert new groups server-side as `pending`.
- Dashboard frontend implemented for login, callback handling, protected session checks, logout, admin detection, profile editing, community counts, admin cards, search, status filters, and edit navigation.
- Dashboard magic-link authentication tested successfully.
- Resend custom SMTP tested successfully for Dashboard auth emails.
- Public Find a Community cards and marker-click details show open/closed availability.
- Community Host profile fields and profile RPCs implemented for `public.portal_users`.
- Community Host backfill tooling prepared for explicit operator use.
- Netlify production replacement completed in `LIFEGATE-Community`.
- Production cutover completed for `https://lifegatecommunity.com`.
- Firebase retired from production runtime.

# Official Terminology

- `Dashboard` is the official product/interface terminology.
- `Community Host` is the official role name for a provisioned contact who can manage one or more communities.
- `Admin` means a Dashboard user with `public.portal_users.is_admin = true`.

# Important Decisions

- Production-first development occurs in `LIFEGATE-Community` unless explicitly directed otherwise.
- Netlify is the production deployment platform.
- Netlify automatically deploys production from `main`.
- Do not prepare GitHub Pages deployments.
- Do not create or modify GitHub Pages CNAME files.
- Do not assume GitHub Pages is production.
- `lifegate_revised` is now an archive/development-history repository only.
- `lifegate_revised` may be used for historical reference, migration history, or rollback reference if needed.
- Do not commit or push to `lifegate_revised` unless explicitly instructed.
- Firebase has been retired from production, but rollback safety should still be preserved until no longer needed.
- Never rerun migration or backfill scripts unless explicitly requested.
- Never expose service-role keys or other secrets.
- Firestore IDs were preserved.
- The Firestore `hidden` field was replaced with canonical `status`.
- Legacy publication mapping was intentionally case-sensitive: only `status` exactly `approved` or `hidden` exactly `no` became approved.
- `meeting_time` replaced separate `hour`, `minute`, and `ampm` fields.
- Latitude and longitude are stored in the database.
- Public listings use the Supabase `get_public_groups()` RPC.
- New public submissions must be inserted server-side as `pending`.
- Public submissions must not accept browser-supplied publication status or coordinates.
- Dashboard login uses Supabase email auth/magic links through Resend custom SMTP.
- Dashboard OTP requests must use `shouldCreateUser: false`; arbitrary visitors must not be able to create Dashboard accounts.
- Dashboard users must be provisioned before login.
- One Community Host may manage multiple communities.
- Administrators may also own groups as ordinary group contacts.
- Administrators see both Admin and My Communities tabs.
- Non-admin Community Hosts see only My Communities.
- Contacts may see their own assigned groups in `pending`, `active`, and `inactive` statuses.
- Contacts cannot approve pending groups, set groups to `pending`, or change ownership.
- Contacts may toggle owned groups between `active` and `inactive`.
- `active` controls whether a group appears publicly; `inactive` hides it.
- `is_closed` indicates whether an active group is accepting new members.
- Contacts and administrators may update `is_closed`.
- Administrators can update group status and ownership through admin portal RPCs.
- Dashboard update RPCs use JSON patch semantics: omitted properties remain unchanged, and JSON null clears only nullable fields.
- Contacts cannot update ownership or coordinates through portal RPCs.
- `public.portal_users` stores nullable `first_name` and `last_name` display fields plus normalized `email` copied from `auth.users`.
- Dashboard email is kept synchronized from `auth.users.email`.
- Passwords, private keys, and authentication secrets are not stored in `public.portal_users`.
- Dashboard display names are managed in `public.portal_users`; Auth metadata is used only for initial backfill when names are blank.
- Dashboard email changes use Supabase Auth email verification through the authenticated client.
- `portal_users.email` changes only after Supabase Auth confirms the new login email and the Auth-to-portal_users trigger copies the confirmed value.
- `update_my_profile(jsonb)` updates only first and last name; it rejects email.
- Group ownership uses `auth.users.id`, not `contact_email`.
- Changing a group's contact email must not automatically transfer ownership.
- `private.is_portal_admin()` is an internal helper and is not directly callable by browser roles.

# Location Privacy

Treat every submitted meeting location as private.

- Never expose or map the exact submitted location.
- Public listings should use a nearby public-safe cross street or generalized area.
- The original submitted location remains private and server-side only.
- Location changes must automatically trigger regeneration of the public-safe map location.
- Prefer a nearby valid intersection for the public-safe location.
- If no reliable intersection can be determined, use a generalized city/ZIP location and flag it for review.
- Do not use random coordinate offsets as the primary privacy method.
- The browser must receive only public-safe labels and coordinates.
- Leaders may include venue details such as "Starbucks" in the group description if desired.

Browser geocoding remains temporarily in place until the privacy-safe location phase is implemented.

# Development Workflow

Future default workflow:

1. Make changes in `LIFEGATE-Community`.
2. Commit to `LIFEGATE-Community`.
3. Push to `main` unless another branch is explicitly requested.
4. Netlify automatically deploys production.

Before every push:

- Summarize changes.
- Show `git diff --stat`.
- Show `git status --short`.
- Identify the destination branch.
- Note that Netlify will auto-deploy from that branch.

# Upcoming Tasks

1. Verify a successful production Add My Community submission through Supabase.
2. Review the inserted pending submission.
3. Implement location privacy and automatic geocoding.
4. Build owner search/provisioning and remaining Dashboard administration workflows.
5. Review and explicitly execute the direct Community Host backfill only if requested.
6. Remove temporary GitHub Pages callback compatibility after old invitation links are no longer needed.

# Rollback Reference

The old Firebase-backed implementation and the `lifegate_revised` repository remain available only as historical/migration/rollback references.

Do not use `lifegate_revised` for future feature work, commits, pushes, or deployments unless explicitly instructed.
