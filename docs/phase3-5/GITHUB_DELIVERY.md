# GitHub delivery evidence

Repository: [abhipatil1403/SYNAPSE-SIH2026](https://github.com/abhipatil1403/SYNAPSE-SIH2026).

Feature branch: **`feature/synapse-phase3-5-platform`**. Draft pull request: **[#1 — Prepare gated platform workflows and session-liveness remediation](https://github.com/abhipatil1403/SYNAPSE-SIH2026/pull/1)**, targeting `main`.

The remote was empty and the local folder initially had no Git metadata. The preserved prototype/security work was committed first and pushed to `main`, giving the feature a reviewable base. No existing history was overwritten. No force push, branch-protection bypass, merge or live deployment was performed.

| Full commit SHA | Verified purpose |
|---|---|
| `42426aefea867ce2931bc7c2b548e0456eb8cd41` | Preserved prototype/Phase 1–2 baseline; initial remote `main` |
| `af8a38425eb7a7f5161e6ea55faf4e567e745281` | Gated contracts, atomic engine, owner-required candidate and local Postgres tests |
| `b58c49ca99f3a99df6c3e0285ca107be1ad88b87` | Isolated platform workspace and browser-tested intake/dashboard flow |
| `e4673704207d1a11b2b65010a0749322915a24b1` | Existing cookie-scope integration, stale-response/sign-out clearing and verified report |
| `e9858d0f55a8a7fba63a820eedc95f211042a7ad` | Exact catalog comparison portable across database collations; GitHub delivery record |

At **2026-10-26T15:10:52.122Z**, GitHub's create-pull-request API returned HTTP **201**, draft **true**, head `e4673704207d1a11b2b65010a0749322915a24b1`, base `42426aefea867ce2931bc7c2b548e0456eb8cd41` and the PR URL above. `git push -u origin feature/synapse-phase3-5-platform` succeeded, and `git ls-remote` returned the same feature/base SHAs. This delivery-record documentation is a subsequent commit on the same branch; the current head is visible in the PR and generated local delivery evidence.

The staged source scan and a scan of **172 reachable Git file blobs** before the feature push found zero configured operator secret/DB URL/test password/original JWT/approved-email matches. Author identity metadata is outside that file-content scan. Actual env files, certificates, DPAPI vaults, screenshots, logs and generated security receipts are ignored. The original design/reference folders remain untouched and untracked; they were not silently deleted or uploaded.

The local checks actually passed: **88 unit tests, 27 browser tests, 15 locked/provider HTTP checks, typecheck, zero-warning lint, production build, deterministic baseline check and disposable PostgreSQL replay with the original 69 authorization assertions plus candidate/core-workflow scenarios**. Four platform browser flows are explicitly MOCKED; local database/session simulations do not certify hosted business writes.

The workflow is `Verify gated SYNAPSE platform` in `.github/workflows/verify.yml`. It receives no hosted Supabase operator configuration. GitHub-run status is recorded separately in ignored `github-ci-results.json`; local passing checks and successful push are not proof that remote CI passed. The PR's Checks tab is authoritative for its current head.

The initial Linux run [40346786440](https://github.com/abhipatil1403/SYNAPSE-SIH2026/actions/runs/40346786440) **FAILED** because database collation changed catalog row ordering. The follow-up compares unordered collections by stable identity while retaining exact row definitions and ordered columns. No baseline bytes or security assertion were removed. The full disposable database suite passed again locally.

At **2026-10-26T15:21:20.394Z**, GitHub reported **SUCCESS** for the correction's PR run [40348200638](https://github.com/abhipatil1403/SYNAPSE-SIH2026/actions/runs/40348200638), head **`e9858d0f55a8a7fba63a820eedc95f211042a7ad`**. All job steps passed, including exact baseline verification, 88 unit tests, typecheck, lint, disposable PostgreSQL replay and production build. Browser/hosted checks remain the separately recorded local/read-only evidence; the workflow does not run them. This evidence update is a documentation-only follow-up; use PR Checks for its latest head.

**Activation is still BLOCKED.** This PR is for review. The candidate is unapplied; hosted aggregate/detail/command RPCs and private evidence infrastructure remain pending. See [REPORT.md](REPORT.md) and [SESSION_REMEDIATION.md](SESSION_REMEDIATION.md).
