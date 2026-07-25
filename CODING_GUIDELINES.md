# Coding Guidelines

Instructions every future Codex session should follow.

- Read `PROJECT_STATUS.md` first.
- Treat `lifegatecommunity.com` production as the default push target unless the user explicitly asks for the GitHub Pages shadow site or another branch.
- For ordinary "push" requests, commit/push the production branch/source (`main`) and keep feature/shadow branches aligned only when useful.
- Do not update the GitHub Pages shadow site as the primary target unless the user explicitly asks for shadow testing.
- Never redesign architecture unless instructed.
- Never execute SQL automatically.
- Never deploy automatically.
- Never expose secrets.
- Never commit credentials.
- Never remove Firebase until migration is complete.
- Make incremental commits.
- Preserve existing coding style where practical.
- Explain architectural tradeoffs.
- Keep migration reversible.
- Prefer reviewable SQL migrations.
- Prefer PowerShell examples.
- Assume Windows development.
