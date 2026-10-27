# Owner release review — current canonical workflows

Status: application and additive database implementation prepared; business operations remain OFF. This document is a concrete review checklist, not an administrator grant or an assertion of approval.

The user's earlier requirement was to preserve security gates until independent release and hosted authorization prerequisites pass. The latest request to make features real does not authorize skipping those checks. Review the current PR #1 diff, exact migration hashes in MIGRATION_REVIEW.json, DATABASE_RESULTS.json, HOSTED_SESSION_RESULTS.json and HOSTED_NEGATIVE_RESULTS.json. Record the reviewed commit and actual owner approval. The application cannot approve itself.

## Bounded development activation

An authorized database owner must approve the existing `synapse_gateway.operations_control` record with the actual active approving administrator ID, timestamp and an explicit release-review reference to the tested commit, then enable `enabled` and `writes_enabled` for the reviewed development release. Set SYNAPSE_HOSTED_OPERATIONS_ENABLED=true in Vercel only for the same reviewed version and redeploy. Never change the legacy read lease, reopen direct public RPCs, grant a service role to the web process, alter Auth ownership, or invent an approving person. No activation statement has been executed by this release.

This enables the existing canonical adapter and original dashboard routes, not a second platform. Zero authorized complaints should produce truthful empty states. System Administrator configuration authority alone does not grant case privileges. Officers keep their existing Case Officer assignments; Bureau-head-only approvals require an actually authorized head. Do not elevate either test officer merely to make a button work.

Keep SYNAPSE_GMAIL_ENABLED=false until the dedicated mailbox and selected intake Bureau are checked, the owner authorizes the first controlled intake, and a real approved test email has produced an actual durable draft/attachments/audit result. The manual ingestion request is itself a real mailbox read; use the original Settings integration card under the authorized administrator. Only after that result should scheduled intake be enabled. OAuth connection alone is not ingestion acceptance.

Keep scanner configuration unapproved until the private deployment and real harmless/EICAR tests pass. Core intake, registration and tasks may retain quarantined bytes; no download or evidence verification may bypass the scanner to complete a test.

## Manual acceptance on the actual site

1. Sign in as each approved account; check profile/settings and logout, including another tab. Sign in as the administrator for account approvals and configuration. Refresh, reopen a protected URL and verify the original dashboard retains current authorized identity.
2. With Officer A, create a clearly labelled development-only intake using an actual development institution and category. Verify its original content, review actual translation/matching results and register once. Refresh; verify the canonical case number, task changes, calendar events and dashboard totals are persisted. Double clicks must not duplicate registration.
3. With Officer B, attempt A's exact case/evidence URLs and mutating endpoints; expect denial. Do not infer isolation merely from an empty list. Verify role, membership and suspension denial using authorized administrative actions and restore only previously approved assignments.
4. With an independently authorized Bureau head, test a narrowly scoped access request/approval/revoke and destination transfer decision. No self-approval. If no approved head exists, report that role as unavailable rather than changing an officer's role automatically.
5. Use the approved dedicated mailbox only for a controlled real test message. Run intake in original Settings, confirm exact draft/original MIME and attachment status, run again and verify deduplication. Review before registration. Verify token refresh and errors without exposing tokens.
6. After private scanner deployment, upload approved harmless bytes, scan, inspect real receipt and download. Verify controlled EICAR detection, invalid service auth, unavailable backend, oversized upload, non-clean review denial and cross-Bureau denial. No confidential evidence to public services.
7. Configure a reviewed development reminder rule against an approved policy. Test actual deadline delivery and deduplication in an authorized environment. The daily free-tier cron is daily, not minute-accurate real-time delivery.
8. Switch original sidebar tabs, profile and notification popovers; verify outside click/Escape, bottom stacked messages, loading/disabled-while-busy feedback, keyboard and mobile layout. Confirm the ViewTransition exception is absent. Browser acceptance has not been automated.

If a step fails, keep the corresponding feature disabled/quarantined, record the real error and retain audit history. Rollback is to set server operations flag false and disable database writes/operations through the authorized owner; preserve all original and newly recorded data. Do not reset the database or restore a permissive public RPC.
