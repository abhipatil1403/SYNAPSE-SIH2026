# GitGuardian incident review

Incident 39169959 flags commit `0b31337c957b1fc10589ef14861af4addffe8b4c`, `docs/phase14/local-database-results.json:14` as a Generic High Entropy Secret. The value is the output of PostgreSQL `md5(pg_get_functiondef(p.oid))` for `synapse.phase1_auth_subject`, recorded by `scripts/test-database.mjs` in `phase1FunctionHashes`. It is a reproducibility checksum of a SQL function definition, not a password, API key, token, encryption key, or credential. The function source is already tracked in the migration history.

The reviewed location matches the generator and local report. Classification recommendation: false positive / nonsecret checksum. No credential rotation is necessary for this checksum. The report and Git history are preserved. No check suppression, scanner exception or history rewrite was performed. An authorized GitGuardian incident owner must classify the original detection in the GitGuardian workspace; GitHub access alone does not grant GitGuardian incident-administration access. Until that external classification is reflected, the check must be reported as failed, not passed.

The unrelated previous incident 39072928 concerns a temporary initdb password-file path. Do not confuse its classification with this new report-checksum incident.

The incident owner reported completing classification on 28 October 2026 (Asia/Kolkata). The original GitHub check still showed failure at that moment; classification propagation and the final-commit scan are verified separately during delivery. An owner report alone is not recorded as a successful check.
