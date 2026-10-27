# Confirmed gateway connection exhaustion

On 27 October 2026, deployed acceptance exposed a new `/api/auth/login` 503. The newly structured proxy logs also classified current `/intake` and `/dashboard` 503s as `gateway_connection_unavailable`. An actual restricted-runtime connection attempt returned SQLSTATE `53300` and the exact known condition `too many connections for role`. Catalog checks confirmed `synapse_web_login` has its original connection limit of 10 and all 10 Supavisor backends were idle. Earlier historical requests without diagnostics cannot independently be assigned this cause.

## Reviewed recovery scope

The authorized operator drained only connections satisfying **all** of these conditions: `usename='synapse_web_login'`, `application_name='Supavisor'`, `state='idle'`, `xact_start IS NULL`, `state_change < now()-interval '2 minutes'`, and `pid<>pg_backend_pid()`. An aggregate precheck found 10 eligible backends with no open transactions. `pg_terminate_backend` then returned true for those 10 only. No active transaction, Auth session record, user, application record, schema, permission, connection limit or activation setting was modified. Existing clients may reconnect after an idle socket is drained. The operator did not assume a runtime role or bypass RLS.

The existing exact pooler hostname was retained and port 6543 was verified by an actual restricted-login TLS connection. A transaction using `SET LOCAL ROLE synapse_web_gateway` reported `row_security=on`; after commit, `current_user` was `synapse_web_login` again. Only the restricted gateway URL's pooler mode changes. Supabase documents shared transaction mode at this port for serverless traffic, with no extra database or paid resource.

The application pool now uses Vercel's documented `attachDatabasePool` lifecycle hook on Vercel only, a bounded three clients and five-second idle timeout. All identity, authorization, claims and session checks remain within their existing transactions. No automatic retry of writes or permission-denied operations was introduced. The helper is imported through its database-only entry point. Its transitive CLI configuration pins an older Zod version; a scoped override uses the already installed patched Zod 4.6.7, with the lockfile and dependency audit verified before release.

## Verification boundary

Transaction pooling must pass the same three-account real-issued-JWT, self-revocation, profile/admin and browser acceptance checks before being reported operational. Full hosted complaint preview remains unapproved and writes remain disabled. Public acceptance and current-head CI results are reported in the release evidence; a connection-mode change does not satisfy unrelated activation prerequisites.

References: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Vercel connection lifecycle](https://vercel.com/kb/guide/connection-pooling-with-functions).
