# Frontend Development Guidelines

Checklist to run through whenever building or reviewing frontend work in this repo
(`admin-frontend/` — covers both the admin/vendor dashboard and the customer storefront
under `admin-frontend/src/storefront/`). Ask Claude to "check FRONTEND_GUIDELINES.md
against the code and fix anything not implemented" to re-audit at any time.

## 1. Media/image URLs must always be absolute

The frontend (Vite dev server, e.g. `localhost:5173`) and the Django API
(`http://127.0.0.1:8000` locally, a different domain in prod) run on different origins.
Any `<img src="...">` fed a root-relative path like `/media/xxx.png` will resolve
against the *frontend's* origin and 404 silently (broken image icon).

- Backend: any serializer/dict-builder that returns a file/image field must call
  `request.build_absolute_uri(field.url)`, not just `field.url`. See
  `app/billing/views/serializers.py::topup_dict()` for the correct pattern.
- This applies to **every** place a URL gets embedded, not just the "primary" object —
  watch for URLs captured into audit logs, JSON snapshots, notifications payloads, etc.
  (Bug precedent: `app/billing/views/validators.py::topup_state_snapshot()` stored a
  raw relative `screenshot.url` into `TopUpAuditLog.previous_state`/`new_state`, so the
  vendor's reply screenshot in the "Information Requests" thread broke even though the
  main top-up screenshot worked fine.)
- When adding a new endpoint that returns any file path, grep for `.url` on the
  relevant model field and confirm it's wrapped in `request.build_absolute_uri(...)`
  before it ships.

## 2. Any growing/repeating list needs a capped scroll region, not unbounded growth

Cards/panels that render a list that can grow over time (chat threads, audit trails,
comment sections, notification feeds, order history, etc.) must NOT be left to grow
the parent card indefinitely. Wrap the repeating items in a dedicated scroll container:

```css
.some-list {
    max-height: 560px; /* pick something sane for the panel */
    overflow-y: auto;
    padding-right: 0.35rem;
    margin-right: -0.35rem; /* offsets the padding so content still aligns */
}
```

Keep the section title/header outside the scroll container so it stays visible.
Precedent: `.dash-qa-list` in `admin-frontend/src/styles/style.css`, used by the
"Information Requests" Q&A thread in
`admin-frontend/src/pages/VendorDashboard/TopUpDetail.jsx`.

## 3. Never filter audit/history data out of view — show every record, with before/after

If a backend audit log records every change (status, screenshot, amount, transaction
ID, etc.), the frontend must never silently drop rows from the visible trail just
because a "friendlier" view (like a paired Q&A thread) already covers them. Show the
full history somewhere on the page, and when a field changed, show what it changed
**from and to** — not just the latest value.

- Bug precedent: `TopUpDetail.jsx`'s "Information Requests" panel paired up
  `INFO_REQUESTED`/reply rows and marked them "consumed", so the Activity Log filtered
  those rows out entirely. On top of that, the reply's screenshot thumbnail only ever
  showed the *new* image, never the one it replaced — from the user's point of view,
  the old screenshot looked "lost" even though it was still in `previous_state` the
  whole time and the old file was never deleted from disk.
- Fix pattern: keep any "friendly" derived view (paired rounds, grouped threads) as an
  *addition*, not a filter — the raw Activity Log / audit trail should always list
  every row. For any row where `previous_state.<field> !== new_state.<field>`, render
  both values (text diff, or before/after thumbnails for images side by side, each
  clickable to the lightbox). See `screenshotDiff()` / `fieldDiffs()` in
  `admin-frontend/src/pages/VendorDashboard/TopUpDetail.jsx` for the pattern.
- Before assuming data was "lost" when a value gets overwritten (a new screenshot
  replacing an old one, a status changing), check whether it's actually recorded in an
  audit/history table first — usually it is, and the real bug is that nothing displays
  it. Confirm on the backend too: does replacing a FileField's value actually delete
  the old file from storage, or does it just stop being referenced by the "current"
  field? (In this codebase, nothing deletes old files — no `django-cleanup`, no
  pre/post-save signal on `TopUpRequest.screenshot` — so old uploads stay on disk and
  stay servable via whatever historical URL points at them.)

## 4. Label/value blocks need the right modifier class, or they render unstyled

`.info-row` / `.info-label` / `.info-value` markup (used for "Payment Details",
"Vendor Information", etc. detail cards) only gets its label-left/value-right row
layout, spacing, and divider borders when the wrapping card also has the
`product-info-card` class — the CSS rule is scoped as `.product-info-card .info-row`,
not a bare `.info-row`. Forget the modifier and the rows silently fall back to plain
stacked `<div>`s (label on its own line, value on its own line, no divider, no
alignment) — exactly the "everything's just crammed together with no design" look.

- Bug precedent: `TopUpDetail.jsx`'s "Payment Details" card used
  `className="info-card"` instead of `className="info-card product-info-card"`, so
  none of the row styling applied even though the markup itself was correct. Working
  examples: `KYCRequests.jsx` and `Vendors.jsx` both use
  `className="info-card product-info-card"` for their "Vendor Information" cards.
- When adding a new `.info-row`/`.info-label`/`.info-value` block, copy the wrapping
  `className="info-card product-info-card"` verbatim from an existing working card —
  don't just copy the inner rows and assume the outer `.info-card` is enough.
- General rule: if a class name only shows up styled as `.parent-modifier .child` in
  `style.css` (grep for it before using it), the parent element in JSX must carry that
  modifier class too, or the rule never matches and you get an unstyled fallback.
- Same failure mode, different shape: hand-rolled `className={`status-badge ${cond ?
  'status-x' : 'status-y'}`}` ternaries silently produce an invisible/unstyled pill
  the moment someone adds a new case (`status-cart`, `status-info`, `status-approved`)
  without also adding that modifier to `style.css` — only `.status-active` and
  `.status-pending` are actually defined there. Found 2026-07-21: "Cart Add" in
  `VendorHome.jsx`'s Recent Product Activity table and "Approved" in
  `DashboardHome.jsx`'s vendor table both rendered as plain unstyled text for exactly
  this reason. Fixed by switching both to the existing `<StatusBadge status={...}
  label={...} />` component (`components/common/StatusBadge.jsx`), which sets
  background/color via inline `style` from a `COLORS` map with a neutral fallback for
  any unmapped status — so a typo'd or new status degrades to a visible gray pill
  instead of vanishing. **Always use `<StatusBadge>` for status/type pills instead of
  raw `status-badge status-X` string concatenation** — this is also already listed as
  a project convention in rule 10, but it's easy to miss when copy-pasting an existing
  raw-class badge instead of using the component.

## 5. Page-level loading: skeleton + blurred overlay on first load, never full-page for actions

Two loading states are different and must be handled differently:

1. **First load of a page** (no data yet, e.g. navigating in from another page) — show
   a skeleton that roughly mirrors the real layout (stat row, cards, table rows —
   whatever the page actually renders) with a full-viewport blurred spinner overlay on
   top. Never fall back to a bare `<div>Loading…</div>` in a corner.
2. **Any refetch triggered by an action on a page that already has data** (approve /
   reject / save / paginate / etc.) — must NOT blank the page back to the skeleton.
   Only the specific section/button doing the work shows its own local busy state
   (spinner on the button, `disabled` while `busy`/`submitting`, or a small
   "Refreshing…" label near the header) while the rest of the page stays exactly as
   it was.

Shared building blocks — use these, don't hand-roll new ones:
- `admin-frontend/src/components/common/PageLoader.jsx` → `<PageLoaderOverlay label="…" />`,
  a fixed full-viewport blurred backdrop + spinner box. Render it as a sibling inside
  the page's outer `<div className="view active" style={{ position: 'relative' }}>`
  only in the "no data yet" branch.
- `admin-frontend/src/components/common/Skeleton.jsx` → `SkeletonBlock`, `SkeletonText`,
  `SkeletonCircle`, `SkeletonButton`, `SkeletonCard`, `SkeletonInfoRows`,
  `SkeletonStatRow`, `SkeletonTableRows`, `SkeletonTileGrid`. Compose these to
  approximate the page's real sections — doesn't need to be pixel-perfect, just
  recognizably "this page, not yet populated" rather than a generic spinner.
- The shared `Table` component (`admin-frontend/src/components/common/Table.jsx`)
  already renders `SkeletonTableRows` internally when its `loading` prop is true — any
  page using `<Table loading={loading} .../>` gets this for free, including on
  pagination refetches (that's fine: the table body is its own "section", so a
  skeleton-in-place there doesn't violate rule 2 above).

**The bug this fixes, and how to spot it**: many pages reuse one `loading` boolean for
*both* the initial fetch *and* every refetch after an action, because the fetch
function is shared (e.g. `fetchDetail()` called from `useEffect` on mount *and* from
every action handler afterwards). If the page's render gate is `if (loading) return
<Skeleton/>`, then clicking Approve/Save/Cancel re-triggers that same gate and the
whole page — header, buttons, everything — flashes back to the loading skeleton on
every click. Fix: gate the full skeleton on **data presence**, not the loading flag —
`if (!topup)` / `if (!data)` / `if (!campaign)`, not `if (loading || !topup)`. The
`loading` flag is still useful — read it to show a small non-blocking "Refreshing…"
indicator near the page title while data already on screen — but it must never be
the sole condition that decides whether the skeleton replaces the whole page.

Fixed under this pattern already: `VendorSubscription.jsx`, `TopUpDetail.jsx`,
`VendorCampaignDetail.jsx`, `VendorHome.jsx`, `DashboardHome.jsx`, `Analytics.jsx`,
`Setting.jsx`, `BillingReports.jsx`. Use any of these as a reference when adding the
pattern to a new page. Pages that only ever pass `loading` down to `<Table>` (most
list pages — Products, Vendors, Customers, Categories, Guests, KYCRequests, etc.)
already do this correctly and don't need a page-level skeleton on top.

## 6. Two stat badges that look different must actually query different things — and every plan-cap is a flat row limit, not a visitor limit

If two stat badges show different numbers (e.g. "Visitors: 10" vs "Total Views: 47"),
they must open modals backed by genuinely different queries, and whatever plan cap
locks part of the list must be expressed as "first N **rows**", full stop — never "the
first N visitors, plus however many rows that happens to produce."

- Bug history (`VendorProducts.jsx` / `Products.jsx` / `AnalyticsDetailModal.jsx` /
  `analytics_service.py`): both badges originally called the same
  `fetchVisitorAnalyticsData(productId, page, title)`, which always hit the
  visitor-grouped `views` endpoint (one row per distinct visitor, "Total Visits"
  column). Clicking "Total Views" (47) opened a modal titled "Total Views" that showed
  the *same* 2-of-10 visitor rows as "Visitor Details", captioned "8 more visitors
  hidden" — the number 47 never appeared anywhere, and the visible rows (2 + 4 = 6
  visits) looked disconnected from the badge. First fix pass added a reconciling
  summary line ("10 unique visitors · 47 total views") — better, but still cosmetic:
  the two badges were still driven by identical data.
- **Real fix**: built a second, genuinely different backend query,
  `ProductAnalyticsService.get_view_events_analytics()`, returning one row per
  individual view *event* (its own timestamp) instead of grouped-by-visitor. Wired via
  a `granularity=event` query param on `vendor_detailed_views`/`admin_detailed_views`
  (`analytics_views.py`) — "Total Views" passes it, "Visitor Details" doesn't, so they
  now hit different code paths, not the same one under two labels. Frontend:
  `AnalyticsDetailModal.jsx`'s `eventLevel` prop switches the table to a single
  "Viewed At" column and switches the locked-count wording ("N more views hidden") via
  the same `noun` variable used everywhere else — no hardcoded "visitor" left in that
  banner text.
- **Confirmed business rule (2026-07-21, extends monetization-feature-decisions)**:
  every subscription plan cap across all 5 analytics popups (Visitor Details,
  Total Views, Favorites, Clicks, Cart Adds) is a **flat row limit** — "your plan shows
  the first N rows" — not "first N distinct visitors." For the 4 visitor-grouped
  popups this changes nothing (1 row = 1 visitor there already). For Total Views it
  meant replacing "lock by visitor, then include all of that visitor's events" with a
  plain "the oldest N individual view rows are visible, rest locked" slice — deliberately
  the *oldest* N (grandfathered), matching the same ordering convention
  `_cap_visitors_per_product` already uses for the other four, not the most recent N.
  If a 6th analytics type gets added later, cap it the same way: slice the first N rows
  of whatever the popup's *actual* listing is, don't invent a visitor-count proxy.
- General rule: before wiring a second badge to an existing fetch/modal because "it's
  basically the same data," check whether the two numbers can be reconciled by a user
  looking at the shared popup. If they can't without already knowing the math, that's a
  sign the two badges need their own query, not just their own title.

## 6b. Any page that MERGES multiple capped types must cap the merged total, not each type separately

When a single page/table combines several analytics types that each have their own
plan-cap limit (e.g. views + favorites + clicks + cart adds shown together as one
"activity feed"), the limit is "N interactions **total** per product," not "N of each
type per product." Applying the cap before merging silently multiplies it by however
many types get combined.

- Bug precedent (`VisitorAnalytics.jsx`'s "Product Analytics" page, backed by
  `ProductAnalyticsService.get_merged_analytics()` / `vendor_merged_analytics`,
  2026-07-21): each of views/favorites/clicks/cart-adds was fetched already capped at
  the plan's limit (say 2), then the four already-capped result sets were merged. A
  vendor with a limit of 2 could see up to 8 rows for one product (2 of each type)
  while the on-screen text said "Your plan shows only the first 2 interactions per
  product" — the text was correct, the enforcement wasn't.
- **Fix pattern**: fetch every type fully uncapped (`visitor_limit=None`) inside the
  merge function, combine into one list per product, *then* apply a single cap across
  the combined rows — `ProductAnalyticsService._cap_interactions_per_product()` keeps
  only the oldest N rows of any type per product (same grandfathered-oldest-first
  ordering as `_cap_visitors_per_product`, rule 6's per-type capper), re-sorted
  most-recent-first for display. The effective limit is the `min()` of the per-type
  entitlement limits, so a future plan with divergent limits per category still errs
  conservative rather than over-revealing.
- Same page also switched from grouped rows (one row per visitor with a "Count"
  column, e.g. "Guest X · Visitor · 4") to one row per individual interaction (each
  view/click event on its own row, no Count column) — apply that "every interaction is
  its own row" rule from rule 6's `eventLevel`/`granularity=event` pattern here too,
  don't let a merged/combined view reintroduce grouping that a single-type view
  already fixed.
- General rule: whenever a merge/combine step sits on top of several independently-
  capped queries, ask "is the cap supposed to apply per source, or to the combined
  result?" before wiring it — defaulting to "per source" (the easy way, since each
  source function already knows how to cap itself) silently multiplies the limit by
  the number of sources merged.

## 7. "Locked rows" upsell paywall: always the blurred-dummy-table + centered overlay

When a table shows a subset of rows because the vendor's plan caps how many are
visible (visitors, favorites, cart adds, recent activity, etc.), the locked portion
must render as: a **separate small table of blurred rows with real-looking dummy
content** ("Hidden Product", `••••••`, etc.), with a **centered overlay on top** — lock
icon, "N more X hidden" heading, one-line subtext, and a "Subscribe to Unlock" button.
Never fall back to empty `&nbsp;` rows blurred-into-nothing plus a separate banner
below the table — that reads as broken/blank, not as "content is hidden".

- Bug precedent: `AnalyticsDetailModal.jsx` (the "Visitor Details" popup opened from
  stat card clicks) had this rich treatment hand-built inline. But the shared
  `LockedRowsBanner.jsx` component — used by `VendorHome.jsx` ("Recent Product
  Activity"), `VendorCartDetails.jsx`, and `VisitorAnalytics.jsx` — only rendered empty
  `<td>&nbsp;</td>` rows blurred via CSS (so they just looked blank) plus a plain text
  banner below the table with no overlay. Two different implementations of the same
  upsell concept, one clearly worse, both present in the app at the same time.
- Fix pattern: use `LockedRowsPanel` from
  `admin-frontend/src/components/common/LockedRowsBanner.jsx` for any locked-rows
  section — it renders `LockedTableRows` (now with real dummy content, not `&nbsp;`)
  inside `.dash-locked-panel` (`position: relative`), blurred via `.dash-locked-table`,
  with `.dash-locked-overlay` absolutely centered on top (lock icon + message + CTA).
  Render it as its own block **after** the real table/pagination, not mixed into the
  real table's `<tbody>` — the overlay needs a clean `position: relative` container to
  center itself against, which a shared `<tbody>` with real rows doesn't give you.
  Pass `ctaTo={null}` to suppress the button for views where "subscribe" doesn't apply
  (e.g. an admin looking at a vendor's capped data, not their own subscription).
- General rule: when the same UI concept (a paywall, a loading state, a label/value
  row) has more than one implementation in the codebase, that's a signal one of them is
  stale — check for a richer version elsewhere before building a third, and when
  fixing, prefer consolidating onto the better one over patching each site separately.

## 8. Long add/edit forms: sectioned two-column layout, not one stacked column in a 540px modal

The default `Modal` is `maxWidth: 540px` — fine for a confirm dialog, cramped for any
form with more than ~4 fields (name/type/price/category/description/images/settings all
stacked vertically becomes a long, narrow scroll with no visual grouping).

- Bug precedent: the Add/Edit Product modal (`VendorProducts.jsx` / `Products.jsx`) had
  ~10 field groups plus a CKEditor and an image manager all stacked in the 540px
  default, with a big "flat" submit button — dense and hard to scan on both admin and
  vendor variants.
- Fix pattern: pass `maxWidth="920px"` and wrap the form in `.product-form-grid` (a
  `1.5fr 1fr` two-column grid, collapsing to one column under 760px), with related
  fields grouped into `.product-form-section` cards (background `--dash-surface-alt`,
  a small uppercase `.product-form-section-title`) — e.g. "Basic Details" / "Pricing" /
  "Description" on the left, "Media" / "Settings" on the right. Finish with
  `.product-form-actions` (Cancel + Submit right-aligned, separated by a top border)
  instead of one full-width submit button. All defined in `style.css`, scoped so they
  don't affect `.form-group`/`.form-row` usage elsewhere (Setting.jsx, confirm modals,
  etc. are untouched).
- Toggle switches: for boolean settings inside a form (e.g. "Active Product", "Premium
  Product"), use `.dash-toggle-row` (label + hint on the left, switch on the right) with
  `.dash-toggle`/`.dash-toggle-track`/`.dash-toggle-thumb` instead of a raw
  `<input type="checkbox">` next to a label — same underlying checkbox, just styled as
  a switch. Don't invent a new toggle component elsewhere; reuse these classes.
- Apply this same "sectioned two-column card layout" treatment to any other add/edit
  form that grows past ~4-5 fields, rather than letting it stay a single stacked column.

## 9. Every form field needs backend validation — frontend attributes alone are not validation

An HTML `required`/`min`/`max`/`accept` attribute, or a proactive JS check in
`handleSubmit`, only stops the *form*. Anyone hitting the API directly (curl, Postman,
a modified request) skips all of it. Before calling a field "validated," check the
backend, not just whether the input has a constraint attribute.

- Bug precedent (full audit + fix, 2026-07-21, `app/marketplace/models/product.py` +
  `serializers/product_serializer.py`): price/discount/original_price had **no**
  backend bound (price could be 0 or negative, discount could exceed 100) despite the
  admin form having `min="0"` HTML — that attribute did nothing once you called the API
  directly. Image uploads had **zero** validation anywhere (no size/count/content-type
  check, frontend or backend) even though a `serializers.ImageField` was defined in the
  serializer — because the real upload path pulls straight from `request.FILES` and
  never touches that field. `is_premium` was directly vendor-writable via the edit
  endpoint despite the UI hiding the checkbox — nothing server-side stripped or
  rejected it.
- Checklist for any new/edited form field, in order of importance:
  1. **Bounds/format on the model or serializer** — `MinValueValidator`/
     `MaxValueValidator` on numeric model fields (auto-picked-up by
     `ModelSerializer` field generation, confirm via
     `ProductSerializer().fields['x'].validators` in a shell, not just by reading the
     model), `MinLengthValidator` for text, real format checks (`URLField` auto-runs
     `URLValidator` — don't reinvent it).
  2. **File uploads**: enforce extension allowlist + size cap + genuine-content check
     (open with PIL and call `.verify()` — a renamed `.txt` is not a jpg just because
     the extension says so) + a total count cap, all **before** any DB write (i.e. in
     `validate()`, not in a post-save hook) so a rejected upload never leaves a
     half-saved row. See `_validate_new_images()` for the pattern — size 5MB, count 8,
     matches `app/billing/views/validators.py`'s screenshot convention.
  3. **Authorization on every writable field** — if a field should only be settable by
     one role (admin-only, or only via a specific paid/approval flow), check that a
     *different* role's endpoint can't set it too. `grep` for every place the same
     serializer is reused across roles; don't assume the frontend hiding a checkbox is
     enough.
  4. **Uniqueness/business-rule checks belong in `validate()`** (object-level), scoped
     correctly (e.g. per-vendor, not global, when duplicates across different owners
     are legitimate) — check for existing duplicate data first if adding a new
     uniqueness rule, since a hard DB `unique_together` migration will fail outright if
     violating rows already exist; a serializer-level check degrades gracefully and
     gives a proper per-field error message either way.
  5. **Only then** add matching frontend `min`/`max`/`accept`/`required` attributes and
     a proactive `handleSubmit` check, for fast feedback — never treat step 5 as a
     substitute for steps 1-4.
- Verify server-side validation by testing the serializer/view directly (fake `request`
  object exposing `.FILES`/`.data`/`.user`, or a fake object with just `.getlist()` on
  `.FILES` — see this session's transcript for the pattern), not by trial-and-error
  through the UI — the UI can't produce values the frontend's own `min`/`type="number"`
  attributes already block, so it can't prove the backend actually enforces anything.
- Two more gap categories found auditing the top-up flow (`app/billing/`,
  2026-07-21), on top of the Product checklist above:
  6. **Numeric parsing must reject non-finite values, not just non-numeric ones.**
     `Decimal("nan")`/`Decimal("inf")` both parse successfully from a raw string —
     `except (InvalidOperation, TypeError)` around the `Decimal(...)` call does **not**
     catch a later `amount <= 0` comparison on a NaN, which raises an *uncaught*
     `InvalidOperation` (unhandled 500), while `Infinity` silently passes an `> 0` check
     and blows up later at the DB layer instead. Always call `.is_finite()` (Decimal) or
     equivalent before any comparison, not just a try/except around the parse. See
     `parse_amount()` in `app/billing/views/validators.py`.
  7. **A duplicate/uniqueness check that's just an application-level query has a race
     condition** — two near-simultaneous requests can both pass the same `.exists()`
     check before either commits. The query is a nice fast-fail/friendly-error layer,
     but the actual guarantee has to be a DB constraint. Use a **partial** unique
     constraint (`UniqueConstraint(fields=[...], condition=Q(...))`) when only a subset
     of rows need to be unique (e.g. `transaction_id` unique only among non-rejected
     top-ups — a rejected one must remain reusable) — check for existing violating rows
     first (same caution as item 4), then wrap the actual write in `transaction.atomic()`
     and catch `IntegrityError` as the final backstop, returning the same friendly error
     the pre-check would have given. See `TopUpRequest.Meta.constraints` +
     `admin_topup_detail`/`vendor_views.topup_update`'s `try/except IntegrityError`.
  8. **Conflict-of-interest / self-review checks**: if a role check is implemented as
     "any of several independent flags" (e.g. `is_admin()` = `role==ADMIN OR is_staff OR
     is_superuser`, independent of the `role` field a *different* check uses), a single
     account can satisfy both a vendor-only and an admin-only gate at once. Any
     approve/reject/edit action taken *on* another user's submission needs an explicit
     `submission.owner_id != request.user.id` check — don't assume the role gates alone
     prevent self-dealing. See `_reject_self_review()` in `app/billing/views/admin_views.py`.
  9. **Multi-step flow "Continue"/"Next" buttons must gate on a selection being made,
     not just on there being something to select.** `disabled={list.length === 0}`
     stops the button when the list is empty, but says nothing about whether the user
     actually picked an item from it — the step can be skipped entirely with the
     "required" field left `null`. Bug precedent: the top-up modal's step 1 ("Choose
     Payment Method") only disabled "Continue" when zero payment methods existed, not
     when none was *selected* — a vendor could click straight through without ever
     tapping a method card, silently submitting a top-up with no payment method
     attached (`VendorWallet.jsx`'s topup-step-1 button, 2026-07-21). The condition
     needs both: `disabled={list.length === 0 || !selection}`. And per item 3 above,
     if the field matters enough to gate a UI step on, it almost certainly needs the
     same requiredness enforced server-side too — a direct API call skips the UI
     entirely (`vendor_views.py`'s top-up create endpoint now rejects a missing
     `payment_method_id` outright, it isn't just optional-with-a-nice-frontend-nudge).

## 9b. Session/auth timing: one source of truth, sliding expiry, real logout

Audited 2026-07-21 and found four uncoordinated timers (frontend hard 2h timeout,
backend token 24h, Django session cookie 2 weeks default, CSRF cookie 1 year default),
no backend logout endpoint (`django.contrib.auth.logout` was imported and never
called), a dead `/auth/refresh-token/` endpoint the frontend never called, and no
warning before the frontend silently hard-logged-out an active user. Fixed:

- Auth tokens now live in a real indexed `AuthToken` model
  (`app/auth/models/auth_token.py`: `token` unique+indexed, `user` FK, `expires_at`),
  not embedded inside the Django session dict scanned row-by-row
  (`app/auth/permissions/auth_token.py` was `for session in Session.objects.all()` —
  O(n) per authenticated request). `BearerTokenAuthentication` now does a single
  indexed `AuthToken.objects.select_related('user').get(token=token)`.
- `POST /api/auth/logout/` (`views.logout_view`) actually deletes the caller's token
  row server-side — logout previously only cleared localStorage client-side, leaving
  the server-side credential live for up to its remaining life.
- `POST /api/auth/refresh-token/` was dead code (needed the raw session cookie +
  matching body token, which the frontend never sent). Repurposed as
  `views.extend_session`: Bearer-token authenticated, no body needed, just pushes
  `expires_at` forward — this is what makes activity-based extension possible.
- Password reset (`confirm_reset`) now deletes **all** `AuthToken` rows for that user
  (log out everywhere), not just clear one session key.
- Frontend (`admin-frontend/src/context/AuthContext.jsx`): a throttled activity
  listener (`mousedown`/`keydown`/`touchstart`/`scroll`, throttled to once per
  `SESSION_ACTIVITY_EXTEND_INTERVAL` = 5 min, see `config/session.js`) calls
  `authService.extendSession()` → `POST auth/refresh-token/`, sliding the session
  forward so an actively-working user is never evicted mid-task. A genuinely idle
  user still hard-expires at `SESSION_TIMEOUT` (2h) since nothing resets the timer
  without real activity.
- `SessionExpiryModal.jsx` warns `SESSION_WARNING_BEFORE` (2 min) before the hard
  timeout with a live countdown and "Stay signed in" / "Log out now" — mounted once
  at the app root (`main.jsx`, inside `AuthProvider`), not inside `AuthContext.jsx`
  itself (that would be a circular import: the modal calls `useAuth()`, so it can't
  live in the same module that defines the context it consumes).
- `logout()` in `AuthContext` is now `async` and awaits the real backend call before
  clearing local state — matches the pattern of "server truth first, then client
  state," don't assume clearing localStorage alone means the user is logged out.

**Follow-up fix (2026-07-21): the sliding-extend was silently using the wrong
duration, and automatic timeout still bypassed the backend.** A vendor reported
getting logged out despite being "active for a long time" — investigating surfaced
three real bugs in the flow above, all in `AuthContext.jsx`:

- `extendSession()` was setting the *local* UX deadline (the one `scheduleTimeout`
  and the warning modal are scheduled against) from the **backend's** response
  `expires_at` — which is the raw `AuthToken`'s TTL, `SESSION_REFRESH_TOKEN_EXPIRY_MINUTES`
  = 1440 minutes (24h), not the 2h `SESSION_TIMEOUT` the UI is supposed to enforce.
  Since the activity listener fires an extend call within the first 5 minutes of any
  real session, this meant the "2 hours of inactivity" policy only ever held for the
  first few minutes — after that the deadline jumped to 24h out, and the 2-minute
  warning modal effectively never appeared in normal use. Fixed: `extendSession()`
  still calls the backend (so the underlying token doesn't die mid-session) but
  computes its own local target as `Date.now() + SESSION_TIMEOUT`, independent of
  what the server returns.
- `handleSessionExpiry()` (the automatic-timeout path) never called
  `authService.logout()` — only the manual "Logout" button did. So an automatic
  2-hour timeout left the `AuthToken` row alive server-side for up to its full
  remaining life, contradicting "real logout" above, and leaving no server-side
  trace of the event (nothing in the request log to confirm it happened). Fixed:
  `handleSessionExpiry` now awaits a real backend logout call (wrapped in
  try/catch — a failed/already-dead token must not block clearing local state)
  before redirecting.
- Neither `logout()` nor `handleSessionExpiry()` had a last-chance check before
  tearing the session down. Because the local per-tab clock only resets on DOM
  activity (`mousedown`/`keydown`/`touchstart`/`scroll`) captured by *that specific
  tab*, a tab that's merely backgrounded (switched away, or the device slept) never
  fires an extend call even while the user is legitimately working elsewhere —
  its timer just runs out on schedule. Fixed: `handleSessionExpiry` now calls
  `authService.checkUser()` first; if the backend still considers the token valid
  (e.g. a sibling tab already extended it, propagated via the existing `storage`
  event listener, but this tab's own `setTimeout` fired first on a stale schedule),
  it resyncs `expiresAt` from `localStorage` and reschedules instead of logging out.
  Also hardened `logout()`'s own backend call with try/catch — previously an
  unhandled failure there (network hiccup, already-expired token) would throw before
  `clearAuth()`/redirect ran, leaving the user stuck appearing logged in after
  clicking "Logout."

**How to apply**: any new auth-adjacent endpoint must authenticate via
`BearerTokenAuthentication` and use `request.auth` (now an `AuthToken` instance, not
a raw string) if it needs to touch the caller's own token row — don't reach into
`request.session` for auth state, that path is gone. If you add a new activity signal
that should count as "the user is here" (e.g. a WebSocket ping), route it through the
same `extendSession()` throttle rather than inventing a second timer.

## 9c. Multi-select-from-catalog pickers: add-as-needed, not "render every row every time"

`VendorCampaigns.jsx`'s "Create Campaign" product picker (2026-07-21) used to render
every active product as a permanent checkbox row with 4 objective checkboxes next to
it, all the time — fine for a handful of products, but a vendor with 50+ active
products got a form that was mostly a wall of unchecked checkboxes. Redesigned as an
add-as-needed picker:

- The selected-products list (`.product-picker`, already capped per rule 2) starts
  **empty**, with a dashed empty-state card, not a full dump of the catalog.
- A single "+ Add Product" button opens a small anchored dropdown
  (`.product-add-wrap`/`.product-add-dropdown`) with a search input and a scrollable
  list — closes on outside click (`mousedown` listener + a ref, removed on unmount).
- The dropdown's list only shows products **not already added**
  (`availableProducts = myProducts.filter(p => !selection[p.id] && ...)`) — this is
  what stops a vendor from adding the same product to a campaign twice; there's no
  separate dedupe check because the already-added item simply isn't offered again.
- Clicking a product in the dropdown adds it to the selected list immediately (no
  intermediate confirm step) so a vendor can add several products in one pass; each
  added card gets a `checkbox-pill`-styled objective row (not raw
  `<input type="checkbox">`+label — see rule 4/8's "always use the styled component,
  not raw form elements") and a `Trash2` "Remove" button.
- Objectives on an already-added card stay independent of removal — unchecking the
  last objective does **not** silently delete the product row (that was the old
  behavior and is surprising once products are an explicit add/remove action); instead
  a red "Pick at least one objective" hint shows, and submit-time filtering drops any
  product with zero objectives checked from the payload rather than blocking the
  whole submission.

**How to apply**: any future "pick N things out of a big list, each with per-item
sub-options" UI (e.g. adding coupons/products to a bundle) should follow this
add-as-needed + already-added-items-excluded-from-the-picker shape instead of
rendering the full catalog inline.

## 10. Project conventions to follow (don't reinvent)

- **API calls**: go through `admin-frontend/src/services/api.js` (axios instance with
  `VITE_API_URL` base + bearer token interceptor). Storefront has its own instance at
  `admin-frontend/src/storefront/services/storefrontApi.js` — don't cross-wire them.
- **Env config**: `VITE_API_URL` in `admin-frontend/.env` controls the API host. Confirm
  it's pointed at the right backend (`127.0.0.1:8000` for local dev) before assuming a
  "nothing loads" bug is code, not config.
- **Toasts**: use `useToast()` from `admin-frontend/src/context/ToastContext` for
  success/error feedback, not ad-hoc alerts.
- **Confirm dialogs**: use `usePrompt()` from
  `admin-frontend/src/components/common/CustomPrompt` instead of `window.confirm`.
- **Status pills**: reuse `<StatusBadge status={...} label={...} />`
  (`admin-frontend/src/components/common/StatusBadge`) instead of inline badge markup.
- **Theming**: colors/spacing are CSS custom properties (`var(--dash-*)`) defined in
  `admin-frontend/src/styles/style.css` — don't hardcode hex colors in components.
- **Image lightbox pattern**: click-to-enlarge images use local `lightboxSrc` state +
  a fixed-position overlay (see `TopUpDetail.jsx`) — reuse this pattern rather than a
  new modal library for simple image previews.

## 11. Before calling frontend work done

- Test both the admin view and the vendor/customer view of a shared page (many pages
  take an `isAdminView` prop and render differently) — don't just check one role.
  Same idea applies to storefront vs admin-dashboard when a feature touches both.
  For UI/frontend changes, follow this before reporting the task complete.
- If a list/thread/log can have zero, one, or many items, actually test the "many"
  case (this is exactly how the unbounded-growth bug above was found) — don't just
  eyeball it with one seed item.
- Check the browser console/network tab for 404s on images/assets, not just JS errors.
