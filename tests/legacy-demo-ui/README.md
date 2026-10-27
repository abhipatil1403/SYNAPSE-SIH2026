# Historical Demo interface tests

These regression sources document the retired browser-local Demo and separate
`/platform` shell. They are outside Playwright's active `tests/e2e` directory
because those interfaces are no longer application destinations. They are not
evidence for the connected application.

Current tests retain public authentication/security checks in
`tests/e2e/auth.spec.ts`. The original dashboard's operational acceptance test
is `tests/e2e/connected.spec.ts`, executed by `scripts/phase10/test-connected.mjs`
against actual Supabase Auth and a fresh PostgreSQL database. It never seeds
business records or mocks an API. Current owner-captured credentials are
required; a missing/rejected account is a real blocker, never a simulated pass.
