# Coding Guidelines

Instructions every future Codex session should follow.

# Required First Step

- Read `PROJECT_STATUS.md` first.
- Treat `PROJECT_STATUS.md` and this file as the authoritative source for current production architecture and workflow.

# Production Source Of Truth

- Production website: `https://lifegatecommunity.com`
- Production hosting: Netlify
- Production GitHub repository: `wantinglittle/LIFEGATE-Community`
- Default local working repository: `C:\Users\User\OneDrive\Documents\Websites\Lifegate Website\LIFEGATE-Community`
- Production branch: `main`
- Netlify automatically deploys production from `main`.

Unless explicitly directed otherwise:

- Modify `LIFEGATE-Community`.
- Commit in `LIFEGATE-Community`.
- Push to `main`.
- Assume Netlify will automatically deploy after the push.

# Legacy Repository Rules

- `lifegate_revised` is no longer the primary development repository.
- Use `lifegate_revised` only for historical reference, migration history, or rollback reference.
- Do not commit or push to `lifegate_revised` unless explicitly instructed.
- Do not prepare GitHub Pages deployments.
- Do not create or modify GitHub Pages CNAME files.
- Do not assume GitHub Pages is production.
- Do not reference `https://wantinglittle.github.io/lifegate_revised/` except where temporary backward compatibility with previously issued invitation links requires it.

# Production URLs

Use `https://lifegatecommunity.com` for all production URLs, including:

- Login
- Callback
- Dashboard
- Add My Community
- Sitemap
- Canonical URLs
- Open Graph URLs

Supabase production authentication:

- Site URL: `https://lifegatecommunity.com`
- Primary callback: `https://lifegatecommunity.com/portal-callback.html`

The temporary GitHub Pages callback exists only to support invitation emails already sent before production cutover. It may be removed after those invitations are no longer needed.

# Deployment Workflow

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

Do not manually deploy unless explicitly instructed. Pushing to `main` is expected to trigger Netlify automatically.

# Engineering Rules

- Production-first.
- Minimize deployment risk.
- Preserve rollback capability.
- Make incremental commits.
- Prefer incremental changes over large rewrites.
- Preserve existing coding style where practical.
- Never redesign architecture unless instructed.
- Explain architectural tradeoffs when relevant.
- Keep migration and rollback paths reviewable.
- Prefer reviewable SQL migrations.
- Prefer PowerShell examples.
- Assume Windows development.

# Safety Rules

- Never expose secrets.
- Never commit credentials.
- Never expose service-role keys.
- Never execute SQL automatically.
- Never rerun migration scripts unless explicitly requested.
- Never rerun backfill scripts unless explicitly requested.
- Do not remove rollback/reference materials unless explicitly instructed.

# Terminology

- `Dashboard` is the official product/interface terminology.
- `Community Host` is the official role name.
- `Admin` means a Dashboard user with `public.portal_users.is_admin = true`.

# Current Production Backend

- Firebase has been retired from production runtime.
- Production uses Supabase PostgreSQL, Supabase RPCs, Supabase Auth, and the Supabase `submit-group` Edge Function.
- Community Host architecture is active.
- Netlify is the production deployment platform.
