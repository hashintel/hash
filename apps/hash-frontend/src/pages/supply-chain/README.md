# Supply Chain

The supply-chain pages provide workspace-scoped analysis views for products,
sites, steps, opportunities, and status reports. The route resolves the HASH web
that contains a populated supply-chain dataset before rendering the app shell, so
users are not stranded on an empty personal web when an organization web has the
data.

## Feature Surfaces

### Site Overview

The site overview is reached at `/supply-chain/site/[site-id]`. It shows a
site-level view across products, including opportunity tables, dwell and
planning views, trend information, supplier performance when enabled, contextual
docs, settings, step detail panels, and status reporting.

Status reports are shared within the resolved data web. Read/unread state is
user-specific and stored through a supply-chain preferences entity for the user
and web, rather than as one graph entity per read marker.

### Product Overview

The product overview is reached at `/supply-chain/product/[product-id]`. It
shows the product graph, category view, route and pipeline views, step detail
panels, contextual docs, and analysis settings. The selected step and settings
are URL-backed where appropriate so route transitions and reloads preserve the
view state.

### Opportunity Brief

The opportunity brief route is
`/supply-chain/site/[site-id]/opportunity/[opportunity-type]/[product-id]/[step-id]`.
It gives focused context for a dwell or planning opportunity without changing
the shared status/read state model.

## Telemetry

Supply-chain telemetry is intentionally grouped into a small allowlist of event
names, with richer properties describing the interaction. Do not add ad hoc
event names for individual buttons or controls.

Allowed event names:

- `supply_chain_viewed`
- `supply_chain_interaction`
- `supply_chain_status_report_created`
- `supply_chain_error`

Supported properties:

- `interaction`
- `source`
- `route`
- `productId`
- `siteId`
- `stepId`
- `opportunityType`
- `opportunityKind`

Do not send status report free text, display names, customer names, site or
product display labels, raw analysis values, or client-specific data.

## Covered Events

### Views

- Product page viewed: `supply_chain_viewed` with `route`, `productId`, and
  `source`.
- Site page viewed: `supply_chain_viewed` with `route`, `siteId`, and `source`.
- Opportunity brief viewed: `supply_chain_viewed` with `route`, `siteId`,
  `productId`, `stepId`, `opportunityType`, and `source`.

### Interactions

- `docs_opened`
- `status_dialog_opened`
- `site_step_selected`
- `site_tab_changed`
- `product_step_selected`
- `product_view_mode_changed`
- `opportunity_marked_read`
- `opportunity_marked_unread`
- `wacc_changed`
- `storage_cost_changed`
- `outliers_excluded`
- `outliers_included`
- `measure_changed`
- `procurement_basis_changed`
- `time_range_changed`

### Status Reports

- Creating a status report sends `supply_chain_status_report_created` with
  `siteId`, `productId`, `stepId`, `opportunityType`, and `source`.
- Status report text is never sent.
- User display names are never sent.

### Handled Errors

Sentry catches uncaught thrown errors. The telemetry error event is for errors
that the supply-chain UI catches and handles itself.

Currently covered handled errors:

- `product_graph_fetch_failed`: product graph fetch failed and the product page
  rendered an error state.
- `status_report_create_failed`: status report creation failed after an
  optimistic UI update, and the status history was reloaded.

Currently not covered by `supply_chain_error`:

- Dataset web resolution failures that fall back to the empty-state view.
- Registry loading failures handled by `SupplyChainDataShell`.
- Step detail panel fetch failures handled inside the panel.
- Opportunity brief fetch failures handled inside the brief view.
- Site-node loading failures handled by site overview hooks.
- Supplier performance fetch failures that degrade to no supplier data.
- Fullscreen request/exit failures that are intentionally ignored.

If one of these handled failures becomes important to analyze, add a
`supply_chain_error` event with an `interaction` value describing the failed
operation and only non-sensitive IDs as context.

## Known Telemetry Gaps

- Track the "show read" opportunity toggle.
- Track brief-link clicks.
- Add the selected tab value to `site_tab_changed`.
- Track scope picker changes.
- Track table filtering and sorting once those interactions are stable.
