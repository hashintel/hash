# Mission 7c implementation check-in

> Non-normative working record for [Mission 7c](../../MISSION.md), current on
> 2026-09-11. `MISSION.md` is the contract; this file says what the branch
> currently proves, what has only been witnessed, and what remains. Tests,
> code, commits and [PR #9667](https://github.com/hashintel/hash/pull/9667)
> remain the underlying record. Reconcile or remove this check-in when the
> mission closes.

## Branch state

Mission 7c is live on `ln/fe-1573-mission-7c`, stacked on the current-net
freshness work in `ln/fe-1653-alternate`. Mission 7b merged as
[PR #9649](https://github.com/hashintel/hash/pull/9649) and is archived in
[`7b-ordinary-batched-construction-provenance.md`](../mission-archive/7b-ordinary-batched-construction-provenance.md).
Mission 7a landed as [PR #9562](https://github.com/hashintel/hash/pull/9562).
The stock/Brunch selection request in
[FE-1650](https://linear.app/hash/issue/FE-1650/select-stock-or-brunch-assistant-in-petrinaut)
still describes stock-default/Brunch-opt-in behavior and must be amended to
match the mission's Brunch-default contract.

## Current proof ledger

| Result | State | Evidence and residual |
| --- | --- | --- |
| Inventory-derived code-bearing carrier slice | Proven mechanically | `packages/plugin-sdcpn/test/inventory-slice.test.ts` applies `test/fixtures/inventory-slice/batch.json`, including one coloured type, parameters, places and arcs, a stochastic transition and one differential equation, and reaches clean TypeScript diagnostics. This is a frozen mechanism fixture, not Inventory delivery or semantic evidence. |
| Admitted mutation envelope | Proven at schema/plugin/host level | [`../reference/architecture/mutation-capability-matrix.md`](../reference/architecture/mutation-capability-matrix.md) records 22 admitted add/edit/remove shapes. `selected-mutation-batch.test.ts`, plugin `mutate-petrinet.test.ts`, mutation-effect tests and website `mutate-petrinet-tool.test.ts` keep the three admitting layers aligned and require verified `applied` outcomes. The website-owned host executor runs under Vitest here; no live-browser run per shape is claimed. |
| Unsupported-operation refusal | Proven mechanically | Plugin schema tests require an unadmitted operation to be refused at its own `operations[N].type` position with the admitted names, before anything applies. Browser mutation-record integration supplies an end-to-end refusal witness. |
| Compiler-dirty application and repair | Proven in integration | `apps/brunch-agent/test/compiler-feedback.integration.ts` runs dirty batch → correlated `TS2304` → fresh observation → repair → clean. Its Vitest wrapper skips when the website distribution is absent. |
| Diagnostics timeout is not clean | Proven mechanically | `wait-for-diagnostics-refresh.test.ts` forces the timeout and proves the read reports `pending`, never the prior diagnostics, and remains armed until diagnostics pass the mutation version. The diagnostics-aware transport tests prove the same pending context reaches the continuation. |
| Dependency invalidation | Proven mechanically | `petrinaut-core/src/lsp/lib/dependency-invalidation.test.ts` covers type-element, parameter, place-name, arc and colour changes, including unused and referenced removals. The carrier admits the operations those tests exercise. |
| Recorded ELK layout | Proven mechanically and in integration | The compiler-feedback integration records `applyAutoLayout` separately, requires its pre-hash to equal the repaired definition, and requires its post-hash to equal a fresh observation. Website `mutation-record.test.ts` and plugin layout-effect tests require position-only effects. Residual: a user drag during a pending layout confirmation could be attributed to layout. |
| Ordinary why routing | Live witness only | In the dev pair, a fresh ordinary-language question produced `getLatestNetDefinition` followed by `brunch_why` and refused honestly when provenance was absent. A conversation that had just built the net answered from memory instead. Before the two-turn instruction, the model proposed both tools together and provider admission refused the mixed proposal. The why scope remains under owner review. |
| Brunch/stock isolation | Proven at host level; live-checked | `assistant-selection.ts` and the `assistant selection` tests in `local-storage-demo-app.test.tsx` show Brunch default, stock alternate, separate transports, manifests and stores, and no Brunch-only executor, Workpiece, Voice or durable Stop in stock mode. Switching preserves each history. Residual: the readiness gate's flag-off comparison against a pre-Brunch baseline is not yet an automated snapshot. |
| Shared history projection candidate | Freshness consumes it; why does not | `apps/brunch-agent/src/conversation/net-ledger.ts` projects canonical Flue history into read, mutation, layout and unrecorded events. `net-freshness.ts` is its first consumer; `test/net-ledger.test.ts` pins determinism and authority constraints. `why.ts` retains its own attribution walk. Parity has not shown that sharing the projection is better than keeping the two walks. See [`SIDE_QUEST.md`](../../SIDE_QUEST.md). |
| Inventory Postgres template and owned copies | Not implemented | The website search schema has no `bundle` parameter; `inventory-purchasing` remains a `scenario=` document location; the Brunch app has no catalogue or copy tables. Prepared local fixture-resume machinery exists for crew reservation, but it is a legacy test-authored Mission 6 regression fixture—not a bundle, template, copy implementation, product model or precedent for this path. |
| Portfolio portability | Not run | The six packs exist under `evaluations/cases/`; no compatibility/capability probe suite has run them through the construction route, no reusable-guidance Inventory-noun scan is recorded, and no second pack has completed product-route construction and correction. |
| Realistic Inventory persona recording | Not recorded | One operator-driven live construction run is a witness only. There is no accepted persona interview with recurring workpiece revisions, model-authored construction, compiler repair where needed, layout, why traversal, correction and same-copy reopen through the visible product. |
| Tool authority/topology | Partial | The capability matrix records operation ownership and execution hosts. The broader topology document is stale for the batch carrier, freshness marker and history-backed why path; there is no checked catalogue yet that fails on duplicate names, ownerless tools, schema copies or unrecorded mount modes. |

## Live-browser observations retained for the next proof

- The dev pair has been exercised with both Brunch and stock selected. Stock
  retained its local history after switching away and back; Brunch-side
  history did not enter the stock store.
- A fresh why conversation routed through the required observation and then
  refused absent provenance honestly. This is useful routing evidence but not
  the required Inventory recording.
- The current Inventory location is a document scenario, not the required
  Postgres-backed template route.

These observations are not substitutes for the normative product-manager
script. The accepted outer proof must be recorded through the real Inventory
copy path after that path exists.

## Next implementation work

1. Build the Inventory catalogue/template and independently owned copy path on
   the Brunch app's existing Postgres adapter and migrations; add the
   website-owned `?bundle=` route, same-copy resume, clean-copy creation and
   template/sibling isolation proof.
2. Define and run the six-pack compatibility/capability probes, choose one
   non-Inventory pack for the product-route end-to-end run, and scan reusable
   guidance for Inventory-specific nouns and IDs.
3. Record the realistic Inventory persona construction and correction on an
   owned copy, then run Lu's semantic review and the stock-isolation
   comparison.
4. Reconcile the tool topology and catalogue.
5. Run parity tests before making the history projection shared with why;
   retain separate walks if sharing introduces another store, identity scheme
   or authority.

## Legacy crew-reservation disposition

Crew reservation is a legacy, test-authored Mission 6 resume fixture. It proved
only that a prepared conversation, workpiece and SDCPN could load together,
one browser mutation could occur, and local save/reopen worked. It did not
prove construction, provenance, a template catalogue, owned copies, Inventory
delivery or semantic quality.

Keep historical references in archives and minimal frozen histories that
remain useful regression fixtures. Do not adapt its selector, manifest,
local-storage snapshot or preparation flow into the Inventory path. After the
real Inventory bundle path lands, evaluate removing that user-facing prepared
fixture machinery and moving surviving fixtures entirely under tests.
