# Mission 7b — Ordinary batched construction, correction, and provenance (FE-1573 / FE-1478)

## Status

**Live on `ln/fe-1573-mission-7b`, stacked on Mission 7a PR [#9562](https://github.com/hashintel/hash/pull/9562) under Lu's explicit FE-1573 multi-PR exception.** This mission also partially addresses [FE-1478](https://linear.app/hash/issue/FE-1478/provide-provenance-from-a-generated-net-back-to-the-requirements-graph): the batch records declared workpiece basis and canonical direct/derived effects, while reliable ordinary why traversal and Inventory-scale provenance remain with Mission 7c. It does not close FE-1478. Mission 7a remains the workpiece, construction-record and explanation groundwork archived at [`docs/mission-archive/7a-workpiece-construction-explanation-groundwork.md`](docs/mission-archive/7a-workpiece-construction-explanation-groundwork.md). Its pending review and merge do not become acceptance through this branch.

Lu recut this mission on 2026-09-11 around the product path actually implemented and observed. Mission 7b no longer claims an Inventory-comparable flagship, worked-model catalogue, Postgres working-copy path, code-bearing SDCPN capability, automatic layout, reliable mechanical why invocation or complete September demo. Those obligations, including the decisions and evidence that led to the split, now have one planning home in [Draft Mission 7c](docs/mission-drafts/7c-inventory-worked-model.md).

The current implementation mounts a selected ordered `mutate_petrinet` carrier on ordinary configured Brunch, constructs and corrects a small connected root net from a settled workpiece, records complete indexed outcomes and effects, attributes failures, reopens the same conversation, and offers a `brunchDemoMode`-gated experimental create-new picker. The four affected packages pass build, unit, TypeScript and ESLint gates in an isolated fresh worktree; both mutation-batch integrations and repository formatting also pass. The published PR checks predate these close-out fixes, so remote CI and external review remain unresolved.

## Imperative

Ship the smallest honest ordinary-product construction seam that Mission 7a made possible: a person can start with Brunch on a Petrinaut net, settle a workpiece, construct a connected structural region through one bounded ordered mutation call, correct that region in ordinary language through a remove/add batch, and reopen the same conversation and workpiece without fixture query parameters or operator-authored net changes.

Make the carrier and its failures legible enough that Mission 7c can safely deepen it. Do not disguise the observed explanation, compiler, layout, catalogue or model-quality gaps as completion, and do not implement their future architecture on this branch.

## Throughline

```text
ordinary configured Petrinaut
or experimental File → New → Build with Brunch under brunchDemoMode
→ incarnation-scoped Brunch construction conversation
→ user account → settled workpiece revision
→ separate getLatestNetDefinition observation
→ one selected mutate_petrinet proposal
→ browser executes canonical operations in order
→ committed prefix + failed/unknown stop + explicit unattempted suffix
→ complete direct/derived effects and pre/post hashes return once
→ ordinary correction settles a new workpiece revision
→ fresh observation → remove/add mutation batch
→ close/reopen restores the conversation and current workpiece
```

The selected 7b operation set is root `addPlace`, `addTransition`, `addArc`, `removePlace`, `removeTransition`, and `removeArc`. Petrinaut Core defines the individual canonical actions; ordinary Brunch exposes them only as variants inside `mutate_petrinet`. The historical headless construction subset remains a separate proof surface, not product policy.

## Proof

### Visible product advance

**Release-note sentence:** Brunch can now construct and correct a small connected Petrinaut region from an ordinary saved workpiece through one auditable mutation batch, without a prepared fixture or a catalogue of one-operation model tools.

**Product-manager script:** open an empty Petrinaut net with ordinary Brunch, describe a small receiving process, let Brunch save its workpiece and construct the connected region, ask for one routing correction in ordinary language, observe the bounded net change, close the assistant, and reopen it to the same revision. With `brunchDemoMode` enabled, the same experiment can start from File → New → Build with Brunch; without the flag, Petrinaut retains its ordinary New action.

**Previously impossible:** ordinary configured Brunch did not mount the batch carrier, first contact could be poisoned by the prepared crew-reservation fixture, and a correction requiring removal could not be expressed without dead parallel structure or manual editing.

### Acceptance leaves

| Result | Required oracle |
| --- | --- |
| The batch carrier preserves canonical mutation semantics | `libs/@hashintel/petrinaut-core/src/selected-mutation-batch.test.ts` and `libs/@hashintel/brunch-agent/packages/plugin-sdcpn/test/mutate-petrinet.test.ts`: canonical selected schemas, unique operation IDs, ordered stop, committed prefix and explicit unattempted suffix. |
| Invalid server arguments never become executable browser calls | `apps/brunch-agent/test/mutate-petrinet-retry.integration.ts`: wrapped-dialect rejection is withheld; an accepted flat retry crosses the client boundary once. |
| Batched and one-operation execution reach the same structural state | `apps/brunch-agent/test/mutate-petrinet-comparison.integration.ts`: the fixed 25-operation target has equal final hashes and complete outcomes through one batch and 25 one-operation calls. The observed 5.8× settlement difference is local/faux-provider evidence, not a universal performance claim. |
| A real provider can produce the selected flat carrier | Retained local-only native history for the 2026-09-10 Sonnet root-creation turn: one 25-operation `mutate_petrinet` call applied all operations. It is not portable campaign evidence or proof for a broader schema. |
| Ordinary Brunch uses the carrier without fixture preparation | `apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app.test.tsx` and `use-prepare-crew-reservation-conversation.test.ts`: ordinary construction mounts the gated dynamic tool and does not inject the crew-reservation prepared fixture. |
| Ordinary construction and correction work on one real net | Retained local-only browser/Flue records for conversation `brunch-construction-v1:24407d82-c62e-490c-8c33-225cbd47dfb4`: an 11-operation start constructed the receiving-dock region; a fresh-observation remove/add correction committed 9 operations, recorded 2 cascade no-ops and preserved the upstream path. |
| Reopen restores the same local session | Browser inspection on that conversation: closing and reopening the assistant restored revision 3 and the corrected topology without a new turn. This proves same-store local continuity, not exported or Postgres-backed copies. |
| The create-new affordance is experimental and contained | `libs/@hashintel/petrinaut/src/ui/views/Editor/editor-view/create-new-net-menu.test.ts` and editor command tests: with `brunchDemoMode` and a mounted assistant, File → New offers Build with Brunch / Start blank and posture chips; otherwise Petrinaut retains its ordinary single New action. One non-paid browser click-through verifies both branches before close. |
| Failures are attributable at their source | `apps/brunch-agent/test/runtime-diagnostics.test.ts`, provider-accounting tests and Petrinaut error-tracker tests: server, transport and browser mutation failures retain useful development diagnostics while production reporting remains content-safe. |

### Explicit non-claims

- The live receiving-dock model is a small structural witness, not an Inventory-quality or PM-explorable flagship.
- Fluent ordinary answers to the two why questions did not call `brunch_why` or populate the mechanical why pane.
- Types, parameters and differential equations are not admitted on the ordinary 7b batch. Their schema-only admission was retracted because ordinary Brunch has no reliable compilation-feedback continuation.
- No ELK layout command is mounted on ordinary Brunch; overlapping nodes remain a known product limitation.
- `?scenario=` remains Petrinaut's location for a simulation scenario inside the current document. No worked-model catalogue route exists.
- Local conversations use disposable SQLite. No Postgres template, owned working-copy or hosted-access claim is made.
- File → New picker tests and click-through do not prove a paid workpiece-and-net construction initiated through its posture chips.

## Constraints

- **Canonical authority:** Petrinaut Core owns mutation schemas, actions and the selected generic ordered executor. Brunch selects and projects canonical operations; it does not copy their field contracts.
- **One ordinary mutation interface:** ordinary construction mounts `mutate_petrinet`, not a parallel catalogue of individual mutations. One logical operation has one `operationId`; retries, when legal, have distinct attempt identity.
- **Gate then flatten:** server validation and declared-basis checks occur before the browser sees a dynamic call. Operations are flat `{ operationId, basisId, type, input }`.
- **Observed base:** every batch cites the exact preceding browser observation call and hash. Stale, unknown, failed and no-op attempts are not causes and are not silently replayed.
- **Ordered stop:** operations commit individually. The first failed or unknown outcome stops execution; successful prefix operations remain committed and every suffix operation is returned as unattempted.
- **Complete accounting:** direct and derived effects are mechanically derived from canonical pre/post definitions. Cascaded arc deletion does not inherit a separate user basis merely because it is an effect of `removePlace`.
- **Earned safeguards:** a limit, gate or refusal remains only when an observed failure, external constraint or explicit owner requirement earns its friction. The former 64 KiB schema threshold is not a provider limit. The current 30-operation maximum remains a provisional 7b carrier bound, not a product invariant; 7c must test or remove it.
- **Identity and storage:** one conversation remains bound to one document incarnation and principal. Production still fails closed to Postgres; Mission 7b local development deliberately uses disposable SQLite.
- **Experimental picker:** Build with Brunch / Start blank is shown only when the host enables `brunchDemoMode` and mounts an assistant. Stock/default Petrinaut behavior is unchanged otherwise.
- **Scope:** no simulation scenarios/metrics, compiler-feedback architecture, auto-layout integration, tool renaming/topology refactor, bundle persistence/copying, remote write, deployment or Linear write on this mission without another accepted recut.

### Ownership at the 7b boundary

- Brunch core owns universal workpiece tools and formalism-independent guidance.
- Petrinaut Core owns canonical model actions, commands and schemas.
- The SDCPN plugin owns the selected model-facing carrier, formalism-specific operation policy, basis/effect interpretation and construction guidance.
- The Brunch app owns composition, authorized history, browser/document reconciliation, history-backed why execution and operational diagnostics.
- The Petrinaut website owns browser execution and local product integration.
- `docs/reference/architecture/topology.md` is known stale for the batch/why surface. Its authority, naming and file-layout reconciliation belongs to 7c.

## Fog-line

- The published PR checks still report the superseded selected-operation export/type and Petrinaut website lint failures. A fresh remote run after the close-out commit remains the external discriminator.
- The picker was unexpectedly exposed whenever any assistant was mounted. It is now gated by the existing host-controlled `brunchDemoMode` flag as well as assistant availability; remote review remains.
- The live ordinary evidence is local-only and not portable; tests prove mechanics, while Lu's observed browser run is the outer witness for this narrow seam.
- The 25-operation generation proves only the six-operation selected structural schema used in that run. Broader provider/tool selection remains a 7c question.
- Why remains fluent but mechanically uninvoked. Prompt placement follows 7c's tool-authority/topology decision rather than a 7b patch.
- Mission 7a is mergeable but still requires review; 7b remains stacked and cannot merge first.

## Stop or reorient

- Stop close-out if the six-operation batch cannot pass canonical schema, type, unit and integration checks on a fresh checkout.
- Stop if invalid server arguments can reach browser execution, a duplicate result can reapply a mutation, or an unknown/partial outcome is represented as success.
- Stop if removing the unproved type/parameter/dynamics variants damages the already observed structural construction/correction path.
- Stop if the feature-flag repair changes ordinary Petrinaut's single New action or shows Brunch-labelled choices for a stock assistant.
- Stop if the mission or PR implies Inventory quality, compiler cleanliness, legible layout, mechanical why coverage, Postgres copies or deployment.
- Do not spend further paid turns to make 7b appear broader. The next paid construction belongs to a cut 7c mission with its diagnostics and layout contracts selected.

## Deferred

- [Draft Mission 7c — Inventory worked-model capability](docs/mission-drafts/7c-inventory-worked-model.md): Inventory-scale SDCPN construction, operation admission, compiler feedback/repair, ELK layout, reliable why routing, tool naming/homing/topology, Postgres templates and owned bundle copies.
- [After-demo construction and explanation evaluation](docs/mission-drafts/7-explainable-construction.md): broader semantic, behavioral, provenance and lifecycle evaluation after a useful worked model exists.
- [Mission 9](docs/mission-drafts/9-traceable-projection.md): repeat/change/retirement/concurrency breadth beyond the selected worked-model seam.
- [Mission 10](docs/mission-drafts/10-bounded-reviewer-revision.md): general reviewer authority and revision.
- [Mission 11](docs/mission-drafts/11-optimisation-handoff.md): consumer-accepted optimization handoff.
- [Future spine](MISSION.next.md): deployment, provider migration and unallocated product concerns not consumed by Draft 7c.
