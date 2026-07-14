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
user-specific and stored through a supply-chain preferences entity for the user.

### Product Overview

The product overview is reached at `/supply-chain/product/[product-id]`. It
shows the product graph, category view, route and pipeline views, step detail
panels, contextual docs, and analysis settings. The selected step and settings
are URL-backed where appropriate so route transitions and reloads preserve the
view state.

### Procurement planning profiles

Supplier-aware datasets represent procurement at
`material + supplier + receipt basis` grain. Each observed profile is a
separate product-graph node and a separate, sortable site-planning row; profiles
are never blended into a material-level deviation or opportunity.

Schema 1.1 procurement profiles may also provide a selected planning source,
generic planning alternatives, and producer-authored data-quality warnings.
The planning and opportunity tables show warning indicators without changing
opportunity eligibility. In step detail, warning-level messages appear below
the key metrics and the planning-assumption tooltip lists the applicable source
and distinct alternatives using producer-supplied labels.

Schema 1.1 is the sole procurement planning contract: the client reads
`planning_source`, `planning_alternatives`, and `planning_warnings` without
legacy notice or source-specific equivalent fallbacks. It must not hardcode
planning-system or client names. Dock-to-Stock is retained in the contract for
future use but is not shown or included in calculations until a comparable
observed process is validated.

### Opportunity Brief

The opportunity brief route is
`/supply-chain/site/[site-id]/opportunity/[opportunity-type]/[product-id]/[step-id]`.

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
- `statusCategory`

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
- `scope_picker_changed`
- `status_dialog_opened`
- `status_dialog_cancelled`
- `status_dialog_validation_failed`
- `site_step_selected`
- `step_detail_panel_closed`
- `site_tab_changed`
- `table_sort_changed`
- `show_read_enabled`
- `show_read_disabled`
- `opportunity_section_toggled`
- `opportunity_brief_opened`
- `opportunity_brief_print_clicked`
- `opportunity_brief_data_downloaded`
- `brief_link_clicked`
- `data_table_opened`
- `csv_exported`
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
  `siteId`, `productId`, `stepId`, `opportunityType`, `statusCategory`, and
  `source`.
- Status report text is never sent.
- User display names are never sent.

## RudderStack Slack Event Templates

RudderStack Slack event templates use Handlebars. Configure each entry with
regex matching disabled unless noted otherwise. Optional property lines are
wrapped in `#if` blocks because not every event has site, product, step, or
opportunity context. Every event also receives shared server-stamped properties,
including `environment`, `frontendDomain`, `shortname`, and `frontendProvided`.

### `supply_chain_viewed`

```handlebars
:eyes:
{{name}}
viewed Supply Chain{{#if properties.route}}{{newline}}Route:
  {{properties.route}}{{/if}}{{#if properties.source}}{{newline}}Source:
  {{properties.source}}{{/if}}{{#if properties.siteId}}{{newline}}Site:
  {{properties.siteId}}{{/if}}{{#if properties.productId}}{{newline}}Product:
  {{properties.productId}}{{/if}}{{#if properties.stepId}}{{newline}}Step:
  {{properties.stepId}}{{/if}}{{#if
  properties.opportunityType
}}{{newline}}Opportunity type: {{properties.opportunityType}}{{/if}}
```

### `supply_chain_interaction`

```handlebars
:point_right:
{{name}}
used Supply Chain{{#if properties.interaction}}{{newline}}Interaction:
  {{properties.interaction}}{{/if}}{{#if properties.source}}{{newline}}Source:
  {{properties.source}}{{/if}}{{#if properties.siteId}}{{newline}}Site:
  {{properties.siteId}}{{/if}}{{#if properties.productId}}{{newline}}Product:
  {{properties.productId}}{{/if}}{{#if properties.stepId}}{{newline}}Step:
  {{properties.stepId}}{{/if}}{{#if
  properties.opportunityType
}}{{newline}}Opportunity type: {{properties.opportunityType}}{{/if}}{{#if
  properties.opportunityKind
}}{{newline}}Opportunity kind: {{properties.opportunityKind}}{{/if}}
```

Opportunity brief interactions currently covered by this template:

- `opportunity_brief_opened`
- `opportunity_brief_print_clicked`
- `opportunity_brief_data_downloaded`

### `supply_chain_status_report_created`

```handlebars
:memo:
{{name}}
created a Supply Chain status report{{#if
  properties.statusCategory
}}{{newline}}Status: {{properties.statusCategory}}{{/if}}{{#if
  properties.source
}}{{newline}}Source: {{properties.source}}{{/if}}{{#if
  properties.siteId
}}{{newline}}Site: {{properties.siteId}}{{/if}}{{#if
  properties.productId
}}{{newline}}Product: {{properties.productId}}{{/if}}{{#if
  properties.stepId
}}{{newline}}Step: {{properties.stepId}}{{/if}}{{#if
  properties.opportunityType
}}{{newline}}Opportunity type: {{properties.opportunityType}}{{/if}}
```

### `supply_chain_error`

```handlebars
:warning: Supply Chain handled error{{#if
  properties.interaction
}}{{newline}}Operation: {{properties.interaction}}{{/if}}{{#if
  properties.source
}}{{newline}}Source: {{properties.source}}{{/if}}{{#if
  properties.route
}}{{newline}}Route: {{properties.route}}{{/if}}{{#if
  properties.siteId
}}{{newline}}Site: {{properties.siteId}}{{/if}}{{#if
  properties.productId
}}{{newline}}Product: {{properties.productId}}{{/if}}{{#if
  properties.stepId
}}{{newline}}Step: {{properties.stepId}}{{/if}}{{#if
  properties.opportunityType
}}{{newline}}Opportunity type: {{properties.opportunityType}}{{/if}}
```

### Global Page Events

Generic page views are already captured from the frontend app shell with
RudderStack's Page API on initial load and on `routeChangeComplete`. The page
name and `path` property are the Next.js `router.asPath` value.

Configure this template with event name `page`:

```handlebars
:page_facing_up:
{{name}}
viewed a page{{#if properties.path}}{{newline}}Path:
  {{properties.path}}{{/if}}{{#if
  properties.environment
}}{{newline}}Environment: {{properties.environment}}{{/if}}{{#if
  properties.frontendDomain
}}{{newline}}Frontend: {{properties.frontendDomain}}{{/if}}{{#if
  properties.frontendProvided
}}{{newline}}Source: frontend{{/if}}
```

### `analysis_run`

`analysis_run` is server-only and cannot be emitted by the browser telemetry
gateway. It is captured when the analysis API resolves a requested analysis.

```handlebars
:bar_chart:
{{name}}
ran an analysis{{#if properties.analysis}}{{newline}}Analysis:
  {{properties.analysis}}{{/if}}{{#if properties.status}}{{newline}}Status:
  {{properties.status}}{{/if}}{{#if
  properties.artifactCount
}}{{newline}}Artifacts: {{properties.artifactCount}}{{/if}}{{#if
  properties.webId
}}{{newline}}Web: {{properties.webId}}{{/if}}{{#if
  properties.environment
}}{{newline}}Environment: {{properties.environment}}{{/if}}{{#if
  properties.shortname
}}{{newline}}Shortname: {{properties.shortname}}{{/if}}
```

### `user_register`

`user_register` is server-only and is captured from the Kratos registration
hook after a HASH user is created. Only route this to Slack if the destination
channel is approved for email addresses.

```handlebars
:bust_in_silhouette: New HASH user registered{{#if
  properties.shortname
}}{{newline}}User: {{properties.shortname}}{{/if}}{{#if
  properties.email
}}{{newline}}Email: {{properties.email}}{{/if}}{{#if
  properties.environment
}}{{newline}}Environment: {{properties.environment}}{{/if}}{{#if
  properties.frontendDomain
}}{{newline}}Frontend: {{properties.frontendDomain}}{{/if}}
```

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

- Add the selected tab value to `site_tab_changed`.
- Track category filter, low-sample toggle, docs topic changes, pipeline control
  changes, and richer what-if interactions once those payloads can stay
  non-sensitive.
