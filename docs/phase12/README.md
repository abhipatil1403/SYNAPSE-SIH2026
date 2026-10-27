# Visible gated dashboard and protected navigation

The approved account-only route previously replaced Overview with a permission notice, hiding the dashboard cards. `AccountOverview` now preserves the original themed bento composition: four KPI cards, analytics, deadlines, Bureau coordination, resolution gauge, recent cases, AI findings, activity and the calendar. Unavailable values display **—**, without fabricated zero totals, bars, percentages, records or findings. Actual case reads, permissions, preview gates and complaint writes are unchanged.

The shared quick calendar supports an explicit `eventsUnavailable` state: real current dates, month navigation, Today and date selection remain interactive, while event records/indicators are withheld and the agenda explains that case events are unavailable. The full calendar also renders its real date grid for approved account-only users with the same availability distinction. Existing authorized-data/local calendar behavior is preserved.

## Intake RSC 503 investigation

The owner's reported failure was confirmed in actual Vercel request logs: `/intake` and `/settings` returned 503 from `serverless-middleware`. The response was produced before the page rendered. Those historical records contained no underlying exception message, so the exact root cause is **not established**. A fresh actual-account probe against the public deployment returned 200 for normal `/dashboard` and `/intake`, and concurrent RSC/prefetch requests for Intake, Complaints, Calendar and Settings. That does not prove the transient failure can never recur.

Protected sidebar/account navigation and dashboard calendar links now disable automatic Next.js prefetch. This removes background authenticated route requests from merely displaying the navigation; explicit navigation still performs the existing online Auth and current-approval checks. No RSC/prefetch exemption, role bypass or identity cache was added. The change mitigates unnecessary request bursts; it is not presented as proof of a specific pool-capacity incident.

The proxy now classifies an explicit current-approval 403 separately from service unavailability and avoids redirecting a failed pending-approval request to itself. True 503s return a safe diagnostic category and emit only that category in structured server logs. No claims, tokens, passwords, connection strings, user details, query parameters or raw provider errors are logged. Configuration failures remain fail-closed. Grants and Supabase activation settings were not changed. A subsequent deployed check reproduced a connection failure and established gateway role exhaustion; the scoped recovery and transaction-pool/lifecycle correction are documented in [CONNECTION_RECOVERY.md](CONNECTION_RECOVERY.md). Earlier historical requests without diagnostic detail cannot independently be assigned that cause.

## Verification

- Component tests assert that all four KPI cards remain visible with unavailable values, no fabricated zero resolution rate, and suppressed unavailable calendar event content.
- The actual-account browser test checks all three approved users: visible cards, month/Today navigation, full calendar navigation, Intake RSC 200 and sidebar navigation, profile/admin boundaries, mobile overflow, command denial and logout replay. It uses real hosted Auth/account APIs with no local operational database or mocked API. Evidence is in `BROWSER_EVIDENCE.json`; this production Next.js test runs at a loopback origin and is distinguished from deployed acceptance.
- Existing public authentication browser checks and local complaint-management regression checks remain separate. Those local pipeline tests are not hosted complaint-write activation.
- Screenshots were captured at 1536×1024 and 390×844 and visually inspected. Screenshots and private runtime logs remain ignored; no credential artifacts are published.
- Independent read-preview approval, positive hosted case acceptance, natural JWT-expiry soak, the previously recorded advisories and full hosted workflow integration remain outstanding as documented in Phase 11. Seeing the cards does not grant complaint access.

Reproduce the account UI checks after `npm run build` with `node scripts/phase11/test-browser.mjs`; source and fixtures are explicitly separated from the actual-account results. User manual acceptance remains **AWAITING USER MANUAL TESTING**.

The follow-up uses the same existing restricted Supabase login through its verified shared transaction pooler. All twelve actual-issued-JWT hosted checks passed again through that endpoint, including self-revocation rejection. No new database, connection-limit increase, permission change or business activation was introduced. Dependency audit passes after a scoped patched-Zod override for the new Vercel lifecycle helper.
