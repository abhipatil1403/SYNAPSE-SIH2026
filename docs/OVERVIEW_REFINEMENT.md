# Overview refinement — 26 October 2026

This pass refines the existing application. It does not replace the data store, repositories, permissions, workflow commands, routing, or Supabase configuration.

## Visual calibration

The reference screenshots are now present in `SYNAPSE_Codex_Starter/reference/screenshots/`. Dashboard screenshot **fernly-reference-04.png** is the composition reference, at **1763×1163**. The existing 1536-pixel dashboard capture was retained as `screenshots/overview-before-1536.png` for comparison.

| Dimension | Existing Overview at 1536px | Refined Overview |
|---|---|---|
| KPI number / label | 42px / 13px | 52px / 16px, aligned equal-height cards |
| KPI arrow control | 29px | 36px |
| Card headings | 16px | 19px, 17px at narrower desktop widths |
| Supporting card text | Often 9–11px | Generally 12–14px for operational content |
| Navigation labels | 12px | 15px desktop, independently scrolling navigation |
| Chart columns | Fixed 44px | Responsive substantial columns, up to 76px |
| Chart scale | Automatic 0–8 for a maximum count of 5 | Zero to the actual selected-series maximum; no minimum-size fake zero bars |
| Chart margins | Top 20px, left −28px | Top 8px, explicit 24px value axis |
| Card gaps / padding | 16px / 20px | 14px / 18–20px |
| Gauge | 232px wide, 24px stroke, 40px value | 280px wide, 30px stroke, 54px value |
| Bento composition | Broad two-column rows | Three-column desktop composition, calendar in the right column across two rows |

The redundant dashboard status line and generic chart/Bureau subtitles were removed. A duplicate calendar CTA in the deadline card was removed; its header still opens Calendar, and the widget has an explicit Open Full Calendar action. Recent Cases shows three complete previews and Recent Activity shows two, retaining metadata and links to the existing full views. The AI feature card emphasizes the actual pending-finding count. All eight functional content sections remain present.

Styles are scoped to `.overview-dashboard` and `.overview-shell` in `app/overview.css`, except the deliberately stronger shared sidebar/topbar typography. The existing full Calendar layout and CSS classes are retained.

## Calendar and chart behavior

- `lib/calendar.ts` provides the shared authorized event selector and India-time civil-date helpers. Both calendar views use it, and both render the shared `CalendarMonthGrid` component.
- Current available events come from open case SLA deadlines and unfinished review/follow-up work items. Optional typed scheduled hearing, approval and Bureau-activity records are supported by the selector when provided by an authorized adapter; no such records or dates are fabricated.
- Scheduled rows and tasks are filtered against the authorized case set. Event ordering compares instants, including inputs with different UTC offsets.
- Previous/next month, Today, day agenda, case links, event indicators and full-calendar navigation work in Demo Mode. Opening the full Calendar carries the selected date in a validated `date` query parameter.
- The month view uses a stable six-week grid, handles leap years/year boundaries and supports arrow keys, Home/End and PageUp/PageDown. Today updates at India midnight and on window focus/visibility changes.
- The widget has explicit loading/error rendering paths and a compact no-events state. The application's existing provider still handles repository hydration/errors.
- `lib/dashboard.ts` supplies seven disjoint civil-date bins for 7D/30D/90D. Current-day registrations after the original seed time are included. Axis values, labels, tooltips and accessible summaries are calculated from scoped records. A zero-only series gets an honest empty-period message.
- Card entry, month fade, chart updates and gauge changes use 170–250ms motion. OS reduced-motion and the saved app preference disable it.

## Validation artifacts

The unit suite passes 49/49 tests, the full production browser suite passes 18/18, and the four focused Overview tests pass again after the final mobile width correction. Typecheck, zero-warning lint and the optimized build pass. At the same 1536×1024 viewport, full-page height is 1457px versus the preserved 1832px baseline (20.5% less), including the added calendar. The exact reference-width capture is 1763×1429 full-page from a 1763×1163 viewport.

The final verification and dimensions are recorded in `TEST_RESULTS.md`. Updated captures use the `screenshots/overview-refined-*.png` naming pattern, including the exact 1763×1163 reference viewport, 1536×1024 and smaller layouts. Supabase's previously documented integration blockers remain unchanged; this pass does not assert a new live integration.
