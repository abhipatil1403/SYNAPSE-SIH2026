# SYNAPSE Codex Starter Pack

## Contents
- `CODEX_MASTER_PROMPT.md`: detailed execution prompt for Codex.
- `reference/designmd/designmd-demo-codeandchill-store/`: direct Fernly design extraction (the primary ZIP unpacked).
- `reference/screenshots/`: seven user-provided Fernly page screenshots, numbered 01–07.
- `docs/SYNAPSE_Complete_PRD_v1.0.md`: product requirements.

## Quick start
1. Extract this pack into your SYNAPSE repository root. Do not put ZIP files inside `src/`.
2. Open the repository folder in VS Code/Codex.
3. In Codex, ask: `Read CODEX_MASTER_PROMPT.md and execute it end-to-end. Begin implementation immediately, run and test the application, and report verified results.`
4. Provide Supabase environment credentials via local `.env.local` only when ready, never in chat or committed to Git.
5. Add the real deployed Supabase schema/migrations or generated database types when available; otherwise the prompt instructs Codex to build a functioning clearly labeled Demo Mode.

## Reference priority
Screenshots = visual appearance; direct DesignMD = measured tokens; PRD = behavior; verified deployed schema = persistence. The mixed-design ZIP is optional and should not be used as a competing primary design reference.

## Reminder
This is a starter/reference pack, **not a pre-built running SYNAPSE app**. Codex will create the app in your local repo.
