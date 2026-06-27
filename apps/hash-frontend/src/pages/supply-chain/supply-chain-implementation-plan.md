# Supply Chain Implementation Plan

This document sets out the implementation plan for landing the supply-chain experience in HASH. It is intentionally client-agnostic: imported source, comments, tests, fixtures, telemetry, and user-facing copy must not contain customer-specific identifiers, product names, site names, or historical notes about where the source originated.

## Decisions

- [ ] Place the implementation under `apps/hash-frontend/src/pages/supply-chain/` using the fractal file-structuring rules.
- [ ] Do not create or use a separate source tree outside the supply-chain route folder.
- [ ] Keep route files as `*.page.tsx`; place non-route implementation in the route folder's private subtree.
- [ ] Redirect `/supply-chain` to the first available site, falling back to the first product only if there are no sites.
- [ ] Remove static/local data transport from the imported frontend code.
- [ ] Route all supply-chain data reads through HASH's analysis client.
- [ ] Remove the standalone methodology route; keep the contextual docs modal.
- [ ] Create graph-backed product step-scoped status reports as one entity per status update, shared across users in the web.
- [ ] Create graph-backed user-scoped read/unread state without creating one graph entity per read marker.
- [ ] Default the app's active workspace to the user's first organization where possible, rather than their personal web.
- [ ] On supply-chain load, guard against empty active-workspace data by checking accessible webs and selecting the first populated supply-chain dataset.
- [ ] Place the Supply Chain sidebar item below Processes.
- [ ] Use fewer telemetry event names with richer `interaction` and context properties.
- [ ] Port meaningful existing tests and add targeted user-facing tests for calculation correctness and critical workflows.

## Non-Negotiable Rules

- [ ] Do not import client data files.
- [ ] Do not import customer-specific identifiers, product names, site names, or customer-specific operational copy.
- [ ] Do not hardcode the forbidden identifiers in source, tests, fixtures, telemetry events, comments, doc modal copy, or generated files.
- [ ] Add a grep gate for the forbidden identifier list before considering the work complete.
- [ ] Do not preserve comments such as "formerly", "legacy", "ported from", "old app", or "migration-only" in imported source.
- [ ] Use HASH product language: supply-chain analysis, product, site, step, opportunity, status report, preferences.
- [ ] Use `@hashintel/ds-components`, `@hashintel/ds-helpers`, Panda CSS, and Ark UI patterns already present in the app.
- [ ] Avoid new MUI usage in the supply-chain subtree.
- [ ] Use relative imports within `apps/hash-frontend`.
- [ ] Do not add `index.ts` or `index.tsx` files.
- [ ] Keep shared files at the closest current fork; avoid broad `components`, `hooks`, `utils`, `types`, or `services` folders.
- [ ] Co-locate tests next to the files they cover.

## Target File Structure

The implementation should use the route folder as the public boundary and private same-named subtrees for implementation details.

```text
apps/hash-frontend/src/pages/supply-chain.tsx
apps/hash-frontend/src/pages/supply-chain/
  product/
    [product-id].page.tsx
  site/
    [site-id].page.tsx
    [site-id]/
      opportunity/
        [opportunity-type]/
          [product-id]/
            [step-id].page.tsx
  shared/
    supply-chain-layout.tsx
    supply-chain-analysis-requests.ts
    telemetry.ts
  app-shell.tsx
  app-shell/
    shared/
      registry-context.tsx
      scope-context.tsx
      load-state.tsx
      use-search-params.ts
      types.ts
      docs/
        docs-context.tsx
        docs-modal.tsx
        docs-content.tsx
        docs-content/
          product-overview.tsx
          site-overview.tsx
          opportunity-brief.tsx
          settings.tsx
          step-detail.tsx
          step-dwell.tsx
          step-procurement.tsx
          step-production.tsx
          step-qa.tsx
          step-transit.tsx
    product.tsx
    product/
      ...
    site.tsx
    site/
      ...
    opportunity.tsx
    opportunity/
      ...
```

The exact structure can change as files are imported, but it must preserve these boundaries:

- [ ] Route files import public mini-libraries from the route subtree, not deep private implementation files.
- [ ] `app-shell.tsx` owns app-wide providers and imports its private implementation from `app-shell/`.
- [ ] `app-shell/product.tsx`, `app-shell/site.tsx`, and `app-shell/opportunity.tsx` are public mini-libraries for their screens.
- [ ] Files under `app-shell/product/` are private to `app-shell/product.tsx` unless moved into the closest `shared/` folder.
- [ ] Files under `app-shell/site/` are private to `app-shell/site.tsx` unless moved into the closest `shared/` folder.
- [ ] Files under `app-shell/opportunity/` are private to `app-shell/opportunity.tsx` unless moved into the closest `shared/` folder.

## Frontend Import Checklist

- [ ] Inventory all source TS/TSX files before copying.
- [ ] Exclude local/static-only data files and any generated data artifacts.
- [ ] Exclude standalone-only local persistence code unless its logic is being rewritten into HASH-specific graph-backed hooks.
- [ ] Exclude the methodology route.
- [ ] Import contextual docs modal components and sanitize all copy.
- [ ] Convert file and folder names to kebab-case where needed.
- [ ] Remove all import paths that point outside the supply-chain route folder.
- [ ] Update imports to route-local relative paths.
- [ ] Replace any static data source setup with calls to HASH analysis request helpers.
- [ ] Remove environment variables specific to the standalone implementation.
- [ ] Remove error messages that tell users to run local data-generation commands.
- [ ] Replace local storage status code with graph-backed hooks.
- [ ] Replace placeholder user names with authenticated HASH user information or server-stamped authorship.
- [ ] Ensure the supply-chain subtree is wrapped in `.hash-ds-root`.
- [ ] Ensure portal-based components use `PortalContainerContext`.
- [ ] Ensure page roots fill the host layout without viewport overflow.
- [ ] Ensure all menus, dialogs, slide-overs, tooltips, and selects work inside the scoped portal container.
- [ ] Fix `apps/hash-frontend/panda.config.ts` to include `./src/pages/supply-chain/**/*.{ts,tsx}`.
- [ ] Remove stale non-route supply-chain globs from Panda once the route-local structure is in place.
- [ ] Regenerate Panda CSS after changing the include globs.
- [ ] Verify the sidebar feature flag still gates `/supply-chain` paths.
- [ ] Move the Supply Chain sidebar item below Processes, not below Inbox or Notes.
- [ ] Verify hidden-path feature flag entries use the actual dynamic route filenames.
- [ ] Verify `/supply-chain/methodology` is removed from route gating if the route no longer exists.

## Route Checklist

- [ ] Fix `apps/hash-frontend/src/pages/supply-chain.tsx` imports.
- [ ] Use `useRegistry()` from the route-local registry context.
- [ ] Redirect to `/supply-chain/site/${sites[0].slug}` when at least one site is available.
- [ ] Fall back to `/supply-chain/product/${products[0].id}` only when there are no sites.
- [ ] Avoid redirect loops while registry data is loading.
- [ ] Product route reads `product-id` from `router.query`.
- [ ] Site route reads `site-id` from `router.query`.
- [ ] Opportunity route reads `site-id`, `opportunity-type`, `product-id`, and `step-id` from `router.query`.
- [ ] Normalize unknown opportunity types to a safe default or show an error state.
- [ ] Preserve URL-backed filters and selected-step state where they are already meaningful.
- [ ] Ensure routes do not fetch data until required route params are available.
- [ ] Ensure route transitions do not drop app-wide settings such as WACC, storage cost, outlier inclusion, measure, procurement basis, and time range.

## Workspace Selection Checklist

Supply-chain analysis artifacts are stored against an organization web for pilot customers. Users may also have a personal web, so the app should not strand them on an empty supply-chain view just because their personal web is active.

- [ ] Review the existing workspace switcher and active-workspace initialization flow.
- [ ] Default the app generally to the user's first organization workspace when a user has at least one organization.
- [ ] Preserve explicit user workspace selections once a user has chosen a workspace.
- [ ] Avoid changing workspace unexpectedly during unrelated navigation.
- [ ] Ensure users with no organizations still default to their personal web.
- [ ] Ensure the defaulting logic runs early enough that route-level data loaders receive the intended web id.
- [ ] Ensure the workspace switcher visibly reflects the selected organization.
- [ ] Add a supply-chain-specific fallback that checks accessible webs for a populated dataset if the active web has none.
- [ ] Fire list-style analysis checks for accessible webs in parallel where the API supports batching or concurrent requests.
- [ ] Select the first accessible web with a populated supply-chain dataset.
- [ ] Prefer organization webs over personal webs when multiple webs have datasets unless the user explicitly selected another workspace.
- [ ] Do not query webs the user cannot access.
- [ ] Do not expose the existence of a dataset in an inaccessible web.
- [ ] Show a clear empty state if no accessible web has a supply-chain dataset.
- [ ] Key all registry, graph, site, status, preferences, and telemetry context by the resolved data web.
- [ ] Ensure switching workspace after auto-selection clears stale supply-chain caches.

## Analysis Data Layer Checklist

- [ ] Keep `supply-chain-analysis-requests.ts` as the HASH data boundary.
- [ ] Route product registry reads through `listProducts`.
- [ ] Route site registry reads through `listSites`.
- [ ] Route product graph reads through `productGraph`.
- [ ] Route step detail reads through `stepDetail`.
- [ ] Route site overview reads through `siteSummary`.
- [ ] Route supplier performance reads through `supplierPerformance`.
- [ ] Ensure every analysis request is scoped to the active workspace web id.
- [ ] Support checking multiple candidate web ids for dataset availability.
- [ ] Fire candidate dataset checks concurrently or via a batched analysis request where available.
- [ ] Resolve the supply-chain data web before loading the registry.
- [ ] Keep downstream analysis requests scoped to the resolved data web, not a stale personal web.
- [ ] Keep validation of product, site, and step identifiers on the API side.
- [ ] Preserve tolerant behavior where optional artifacts are absent, such as sites or supplier performance.
- [ ] Do not let frontend route params resolve arbitrary storage keys.
- [ ] Normalize analysis payloads at the frontend boundary if source data shape is not fully stable.
- [ ] Preserve session-level caches only where they cannot leak data across workspace changes.
- [ ] Clear or key all caches by web id, product id, site id, and relevant product sets.
- [ ] Add error states that are user-actionable in HASH, not standalone instructions.

## System Graph Type Migration

Add a new ontology migration under `apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/migrations/`.

- [ ] Use the next migration number.
- [ ] Prefer a production migration if the feature is intended to ship beyond local development.
- [ ] Use helper functions from `migrate-ontology-types/util.ts`.
- [ ] Avoid direct database writes in the migration.
- [ ] Keep the migration idempotent.
- [ ] Create only client-agnostic type and property names.
- [ ] Run ontology id codegen after the migration has run.
- [ ] Run system type codegen after ontology ids are generated.

### Status Report Entity

Create one entity per status update. These are shared within the web and represent authored history, not mutable aggregate state.

- [ ] Create a `Supply Chain Status Report` entity type.
- [ ] Include a stable product step scope key property.
- [ ] Include product id.
- [ ] Include site id.
- [ ] Include step id.
- [ ] Include opportunity type or category scope, e.g. dwell/planning.
- [ ] Include status category.
- [ ] Include status text/comment.
- [ ] Include created-at timestamp.
- [ ] Include author identity, preferably as a link to the HASH user entity where appropriate.
- [ ] Include optional opportunity kind if useful for filtering.
- [ ] Include optional dataset version if status reports must be interpretable against historical analysis outputs.
- [ ] Do not denormalize customer-sensitive source data into status reports.
- [ ] Treat status reports as append-only unless product requirements explicitly add edit/delete behavior.
- [ ] Query status reports by web, site id, product id, step id, and opportunity type.
- [ ] Sort status reports by created-at ascending for history display.
- [ ] Decide whether deleted or superseded reports need a status field before adding mutation flows.

Suggested properties:

- [ ] `Supply Chain Product Id`: text.
- [ ] `Supply Chain Site Id`: text.
- [ ] `Supply Chain Step Id`: text.
- [ ] `Supply Chain Opportunity Type`: text or custom constrained data type.
- [ ] `Supply Chain Opportunity Kind`: text or custom constrained data type.
- [ ] `Supply Chain Status Category`: text or custom constrained data type.
- [ ] `Supply Chain Status Text`: text.
- [ ] `Supply Chain Scope Key`: text.
- [ ] `Created At`: use an existing timestamp property if available, otherwise create one only if needed.

### User Preferences Entity

Read/unread state should be user-scoped without creating one entity per read marker. Use one preferences entity per user per web for supply-chain preferences.

- [ ] Create a `Supply Chain User Preferences` entity type.
- [ ] Store it in the relevant web or another agreed location that supports querying by current user and web.
- [ ] Include a user link or user id property.
- [ ] Include a web/scope identifier if the entity is not already unambiguously web-scoped.
- [ ] Include a list property for read opportunity keys.
- [ ] Include optional list entries with timestamps if product requirements need "read at" display.
- [ ] Keep the stored key stable across time range and measure changes unless the product decision says read state should be per analysis window.
- [ ] Keep the stored key independent of display text.
- [ ] Include a schema/version property if the read-key format may evolve.
- [ ] Avoid storing a large list on the HASH user entity itself.
- [ ] Avoid creating one graph entity per read marker unless the list approach proves unworkable.
- [ ] Define expected list-size behavior and cleanup strategy before shipping to large datasets.

Suggested read marker shape if object properties are practical:

```text
{
  key: string,
  readAt: string,
  datasetVersion?: string
}
```

Fallback shape if object-list property ergonomics are poor:

```text
readOpportunityKeys: string[]
```

### Read-State Race Conditions

The list-property approach can lose updates if two read/unread writes race. Build the client and API path around merge semantics.

- [ ] Keep local optimistic read state in a reducer keyed by opportunity key.
- [ ] Apply mark-read and mark-unread actions immediately in local state.
- [ ] Serialize writes per preferences entity on the client.
- [ ] Coalesce rapid changes into a single pending mutation where practical.
- [ ] Track pending operations separately from confirmed server state.
- [ ] On mutation success, merge the server-confirmed state with still-pending local operations.
- [ ] On mutation failure, keep the intended local state visible and show a retryable error if needed.
- [ ] On refetch, merge server state with local pending operations rather than replacing local intent.
- [ ] Prefer a server mutation that reads current preferences, applies a patch operation, and writes the merged result.
- [ ] If the graph API supports version/conflict detection for entity updates, use it.
- [ ] If conflict detection is unavailable, refetch-before-write and retry once on stale update failures.
- [ ] Ensure mark-read followed quickly by mark-unread resolves to unread.
- [ ] Ensure mark-unread followed quickly by mark-read resolves to read.
- [ ] Do not use a blind "replace whole list" mutation directly from a stale client snapshot.

## Backend API Work

- [ ] Add API helpers for loading status reports for a site or product-step scope.
- [ ] Add API helpers for creating status report entities.
- [ ] Add API helpers for loading the current user's supply-chain preferences entity.
- [ ] Add API helpers for creating the preferences entity if missing.
- [ ] Add API helpers for patching read/unread markers with merge semantics.
- [ ] Ensure all reads and writes are scoped to the active workspace web.
- [ ] Ensure users cannot write status reports into webs they cannot access.
- [ ] Ensure users cannot modify another user's preferences.
- [ ] Ensure status report authorship is server-derived, not client-supplied.
- [ ] Decide whether the status report feature is exposed through GraphQL, REST, or existing frontend graph helpers.
- [ ] Add backend tests for permission checks and merge behavior.

## Frontend Status Feature Checklist

- [ ] Replace local opportunity status hook with a HASH hook.
- [ ] Load shared status reports for the active site.
- [ ] Group status reports by stable status key.
- [ ] Pass grouped status history into `SiteOverview`.
- [ ] Create a new status report entity when the status dialog is saved.
- [ ] Optimistically append saved status reports where safe.
- [ ] Reconcile optimistic status reports with server-created entities.
- [ ] Show author and timestamp from server-confirmed data.
- [ ] Load current user's read preferences for the active web.
- [ ] Mark rows read/unread through the preferences mutation path.
- [ ] Preserve local intent during rapid read/unread toggles.
- [ ] Keep read state user-specific in the UI.
- [ ] Keep status report history shared in the UI.
- [ ] Ensure status reports show in the step detail panel and opportunities table consistently.
- [ ] Ensure status dialog validation matches `statusCommentRequired`.
- [ ] Ensure status report creation cannot submit empty required comments.

## Telemetry Plan

Use a small allowlist of event names and put detail in properties. Add types in `libs/@local/hash-isomorphic-utils/src/telemetry/types.ts` and update API validation tests.

Suggested track event names:

- [ ] `supply_chain_viewed`
- [ ] `supply_chain_interaction`
- [ ] `supply_chain_status_report_created`
- [ ] `supply_chain_error`

Suggested common properties:

- [ ] `route`: current route pattern or pathname.
- [ ] `workspaceWebId`: include only if this is acceptable under telemetry policy; otherwise omit or hash.
- [ ] `productId`: product id when interacting with a product.
- [ ] `siteId`: site id when interacting with a site.
- [ ] `stepId`: step id when interacting with a step.
- [ ] `opportunityType`: dwell/planning.
- [ ] `opportunityKind`: dwell cost/planning over/planning under where applicable.
- [ ] `interaction`: concise action name.
- [ ] `source`: component or surface, e.g. `site_overview`, `product_graph`, `opportunity_table`, `status_dialog`.

Interaction coverage checklist:

- [ ] Product page viewed.
- [ ] Site page viewed.
- [ ] Opportunity brief viewed.
- [ ] Product graph step selected.
- [ ] Product graph step panel closed.
- [ ] Category view opened or changed.
- [ ] Pipeline waterfall interacted with.
- [ ] What-if lever changed.
- [ ] What-if values reset.
- [ ] Site overview tab changed.
- [ ] Site overview sort changed.
- [ ] Category filter changed.
- [ ] Low-sample filter toggled.
- [ ] Settings panel opened.
- [ ] Settings panel closed.
- [ ] WACC changed.
- [ ] Storage cost changed.
- [ ] Outlier inclusion toggled.
- [ ] Measure changed.
- [ ] Procurement basis changed.
- [ ] Time range changed.
- [ ] Opportunity row opened.
- [ ] Opportunity brief opened.
- [ ] Opportunity marked read.
- [ ] Opportunity marked unread.
- [ ] Status dialog opened.
- [ ] Status category changed.
- [ ] Status report submitted.
- [ ] Status dialog cancelled.
- [ ] Status validation error shown.
- [ ] Step detail opened from product page.
- [ ] Step detail opened from site page.
- [ ] Step detail status action clicked.
- [ ] Vendor detail opened.
- [ ] Supplier performance tab opened.
- [ ] CSV/export action triggered, if retained.
- [ ] Contextual docs modal opened.
- [ ] Contextual docs topic changed.
- [ ] Analysis fetch failed.
- [ ] Status report create failed.
- [ ] Preferences update failed.

Telemetry safeguards:

- [ ] Do not send product or site display names.
- [ ] Do not send status report free text.
- [ ] Do not send raw comments.
- [ ] Do not send customer-specific values.
- [ ] Keep event properties bounded and serializable.
- [ ] Ensure telemetry failures never affect UI behavior.
- [ ] Add tests for telemetry event parsing and allowlist behavior.

## Client-Agnostic Content Gate

- [ ] Create a local forbidden-identifier list outside committed source if it contains sensitive strings.
- [ ] Grep the imported source tree for the forbidden identifiers before opening a PR.
- [ ] Grep generated CSS and generated TypeScript if source strings can flow into generated files.
- [ ] Grep tests and fixtures.
- [ ] Grep docs modal copy.
- [ ] Grep telemetry event names and properties.
- [ ] Grep seed data that is intended to ship with HASH.
- [ ] Confirm only generic demo data is present.
- [ ] Confirm no user-facing copy references a specific customer practice.
- [ ] Confirm no comments reference the previous repository, app, route, or implementation history.

## Calculation and Data Pitfalls

- [ ] Confirm which calculations are intentionally client-side.
- [ ] Confirm which calculations are precomputed in analysis artifacts.
- [ ] Avoid recalculating server-derived values differently on the client.
- [ ] Preserve fixed-statistic behavior for opportunity qualification where intended.
- [ ] Ensure changing the measure dropdown does not change opportunity eligibility if eligibility is meant to use a fixed statistic.
- [ ] Ensure time-range changes update costs, charts, and opportunity ids consistently.
- [ ] Ensure read-status keys do not accidentally change with display-only filters.
- [ ] Verify low-sample handling is consistent across dwell, planning, trend, and opportunity views.
- [ ] Verify outlier exclusion changes the views it is supposed to change.
- [ ] Verify procurement basis affects only relevant procurement views.
- [ ] Verify currency and storage-cost assumptions are applied consistently.
- [ ] Verify supplier performance can render aggregate-only data when raw lines are absent.
- [ ] Verify site summaries and product graphs use compatible node shapes.
- [ ] Verify fallback from site summary to product graph fetches does not create excessive network traffic.
- [ ] Verify caches cannot serve data across workspace switches.
- [ ] Verify analysis fetch failures surface clear HASH-appropriate errors.
- [ ] Verify route params are slug-validated by the API before artifact resolution.

## Styling and Layout Pitfalls

- [ ] Confirm all Panda classes used by the supply-chain subtree are included in generated CSS.
- [ ] Confirm `.hash-ds-root` wraps the whole supply-chain UI.
- [ ] Confirm overlays portal inside `.hash-ds-root`.
- [ ] Confirm nested scroll containers work below the HASH header.
- [ ] Confirm product graph canvas sizes correctly in the sidebar layout.
- [ ] Confirm tables scroll internally where intended.
- [ ] Confirm dialogs and slide-overs stack correctly.
- [ ] Confirm keyboard focus is managed for dialogs.
- [ ] Confirm Escape closes dialogs where expected.
- [ ] Confirm screen reader labels exist for icon-only controls.
- [ ] Confirm color tokens resolve in light and dark modes if both are supported.

## Test Plan

Port meaningful existing tests and add new tests where HASH behavior differs. Avoid tests that only lock implementation details.

### Unit and Logic Tests

- [ ] Port cost formatting and carrying-cost tests.
- [ ] Port time range tests.
- [ ] Port period trend tests.
- [ ] Port procurement basis tests.
- [ ] Port range filter tests.
- [ ] Port outlier selection tests.
- [ ] Port node badge/stat tests where they validate user-visible classification.
- [ ] Port supplier OTIF tests.
- [ ] Port site aggregation tests.
- [ ] Port opportunity utility tests.
- [ ] Port opportunity builder tests.
- [ ] Port what-if calculation tests.
- [ ] Port wire contract tests after adapting imports and HASH data shapes.
- [ ] Add tests for route-local data request helpers.
- [ ] Add tests for status key stability.
- [ ] Add tests for status category normalization.
- [ ] Add tests for read-preferences reducer merge behavior.
- [ ] Add tests for rapid mark-read/mark-unread operation ordering.
- [ ] Add tests for telemetry event construction helpers.
- [ ] Add tests proving forbidden free-text status content is not sent to telemetry.

### Backend Tests

- [ ] Test the status report ontology migration creates expected types idempotently.
- [ ] Test status report creation uses server-derived author identity.
- [ ] Test status reports are scoped to the web.
- [ ] Test users without web access cannot create status reports.
- [ ] Test loading status reports returns only the active web's reports.
- [ ] Test preferences entity is created once per user per web.
- [ ] Test read marker patch adds a key without dropping existing keys.
- [ ] Test unread patch removes a key without dropping other keys.
- [ ] Test two sequential patches merge correctly.
- [ ] Test conflict/retry behavior if supported by the chosen graph update path.
- [ ] Test users cannot mutate another user's preferences.

### User Stories for Browser or Integration Tests

- [ ] As a user with the feature flag, I can open `/supply-chain` and land on the first site.
- [ ] As a user without the feature flag, I cannot access supply-chain routes.
- [ ] As a user with at least one organization, the app defaults me to my first organization workspace.
- [ ] As a user who explicitly selected a workspace, the app preserves my selection.
- [ ] As a user whose active personal web has no supply-chain dataset, `/supply-chain` checks my accessible organization webs and uses the first populated dataset.
- [ ] As a user with no accessible supply-chain dataset, I see a clear empty state instead of a broken page.
- [ ] As a user, I see Supply Chain in the sidebar below Processes when the feature flag is enabled.
- [ ] As a user, I can switch from one site to another and see site-specific metrics.
- [ ] As a user, I can open a product page and see the process graph.
- [ ] As a user, I can select a product step and see the step detail panel.
- [ ] As a user, I can close the step detail panel and remain on the same product page.
- [ ] As a user, I can change time range and see site metrics update.
- [ ] As a user, I can change measure and see table values update without unintended opportunity churn.
- [ ] As a user, I can toggle outlier inclusion and see relevant metrics update.
- [ ] As a user, I can change WACC and storage-cost assumptions and see carrying-cost values update.
- [ ] As a user, I can filter planning/trend categories.
- [ ] As a user, I can sort dwell, planning, trend, and supplier tables.
- [ ] As a user, I can open an opportunity brief from the site overview.
- [ ] As a user, I can navigate directly to an opportunity brief URL and see the correct context.
- [ ] As a user, I can mark an opportunity as read and see it remain read after refresh.
- [ ] As a user, I can mark an opportunity unread and see it remain unread after refresh.
- [ ] As a user, I can rapidly mark multiple opportunities read without losing any read state.
- [ ] As a user, I can rapidly mark the same opportunity read then unread and the final state is unread.
- [ ] As a user, I can save a status report against a step.
- [ ] As another user in the same web, I can see the shared status report history.
- [ ] As another user in the same web, I do not inherit the first user's read/unread state.
- [ ] As a user, I cannot save a required-comment status without text.
- [ ] As a user, I can see status history in the opportunity table and step detail panel.
- [ ] As a user, I can open contextual docs from product, site, opportunity, settings, and step-detail surfaces.
- [ ] As a user, missing supplier-performance artifacts do not break the site overview.
- [ ] As a user, an analysis fetch failure shows a clear error state.
- [ ] As a user, switching workspace reloads registry and cached data for the new web.

### Manual QA Checklist

- [ ] Run the app with the example supply-chain dataset.
- [ ] Visit `/supply-chain`.
- [ ] Verify first-site redirect.
- [ ] Visit each route directly by URL.
- [ ] Exercise all tabs and filters.
- [ ] Exercise all settings.
- [ ] Open and close every overlay.
- [ ] Create a status report.
- [ ] Refresh and verify status persistence.
- [ ] Sign in as a second user in the same web and verify shared status reports.
- [ ] Verify read/unread state is not shared between users.
- [ ] Switch workspace and verify no stale data remains.
- [ ] Inspect network calls for analysis, telemetry, status reports, and preferences.
- [ ] Confirm telemetry batches contain no free text or display names.
- [ ] Run the forbidden-identifier grep gate.

## Validation Commands

Exact commands may change as the work lands, but completion should include targeted checks.

- [ ] Run `yarn workspace @apps/hash-frontend codegen` after Panda include changes.
- [ ] Run TypeScript checks for `@apps/hash-frontend`.
- [ ] Run ESLint for `@apps/hash-frontend`.
- [ ] Run relevant frontend unit tests.
- [ ] Run relevant API tests for telemetry, analysis, status reports, preferences, and migrations.
- [ ] Run ontology id generation after the new migration.
- [ ] Run system type generation after ontology ids are updated.
- [ ] Run the forbidden-identifier grep gate.

## Open Design Points

- [ ] Decide whether status reports include dataset version.
- [ ] Decide whether read state keys include dataset version.
- [ ] Decide whether read state should be per opportunity kind, per step/opportunity type, or per generated opportunity id.
- [ ] Decide whether status reports can be edited or deleted.
- [ ] Decide whether status report categories should be constrained custom data types or text properties validated by app code.
- [ ] Decide whether user preferences should store `readAt` timestamps or only keys.
- [ ] Decide whether telemetry may include workspace web id or should avoid it.
- [ ] Decide whether status report and preferences APIs should be GraphQL-first or use smaller route-specific API helpers.
