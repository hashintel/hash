# Mission 7a — Workpiece, construction and explanation groundwork

## Status

**Part A closeout in progress; UI remediation blocks merge. Not a demo or semantic-quality acceptance.** Lu has directed a split: this branch and [PR #9562](https://github.com/hashintel/hash/pull/9562) carry the mechanical groundwork; Mission 7b continues under the same FE-1573 issue on a child branch. The former full-region/100%-useful-explanation acceptance programme is not a prerequisite to this engineering split. Its surviving evaluation obligations live in the [after-demo evaluation draft](docs/mission-drafts/7-explainable-construction.md); the focused demo successor is the [Mission 7b draft](docs/mission-drafts/7b-september-demo.md).

The current implementation saves and displays evolving workpieces, observes a bounded set of native Petrinaut mutations, and resolves their recorded basis through chat. Controlled browser tests exercise the broader surface. The retained persona session contains one parameter, one type and one equation, not a connected process model. Its lineage queries and original-store reopening were observed; semantic correspondence, automatic citation coverage, a complete construction flow, portability and demo readiness are not established. No persona, browser or paid run is active.

**Local-only / not portable:** the actual-session oracle is `apps/brunch-agent/.data-wipe-me/persona-runs/run-7ceo9j/` and the original `apps/brunch-agent/.data-wipe-me/conversations.db`. Inspect the native history, saved revisions and observed definitions, not an invented reconstruction. These local records establish observed behaviour without claiming repository-reproducible fixtures or teammate access. Commits, tests and the PR are the engineering record.

## Imperative

Deliver the working integration from conversation to saved workpiece, browser-applied net edits and record-backed explanation, with a usable workpiece surface rather than an intrusive debug overlay. Make that bounded result reviewable and landable independently of the complete September demo and evaluation of the prompt/skill architecture's modelling effectiveness.

The harness is structurally checked, not a semantic acceptance engine. A valid reference, applied edit or successful lookup is a mechanical result; a good model or persuasive rationale is a different judgment. Preserve that distinction without making the latter a universal execution gate.

## Throughline

```text
Petrinaut Brunch chat / attached persona
→ mounted Flue ChatAgent
→ core workpiece revision + optional passage/source relations
→ plugin mutation request + declared workpiece basis
→ browser executes canonical Petrinaut operation and returns observed effects
→ chat why resolves element/field → edit → revision/passage → linked source messages
→ reopen the original session and continue querying
```

### Delivered construction boundary

In conversation-bound construction mode, the observed mutation catalog is:

| Object | Operations |
| --- | --- |
| Root place / transition | `addPlace`, `updatePlace`, `addTransition`, `updateTransition` |
| Root place–transition arc | `addArc`, `updateArcWeight` |
| Type / ordered attribute | `addType`, `updateType`, `addTypeElement`, `updateTypeElement` |
| Scenario | `addScenario`, `updateScenario` |
| Root parameter / differential equation | `addParameter`, `addDifferentialEquation` |

These fourteen operations are not stock-tool parity or fourteen genuine-persona demonstrations. Deletion, parameter/equation update, nested nets/components and component-port arcs are outside this observed surface. Typed-state operations also reject documents containing subnets/components. Canonical input/refinement rules still apply. Necessary native reads and compilation checks accompany this surface; compilation does not prove simulation.

### UI closeout before merge

[FE-1645 / PR #9634](https://github.com/hashintel/hash/pull/9634) gates the existing prepared-fixture selector behind an opt-in Brunch demo setting and moves it below the top bar. That selector is distinct from this branch's fixed `BrunchWorkpiecePane`. Preserve the colleague's selector/provider behaviour when integrating; do not restore default fixture chrome or copy a competing settings mechanism.

Replace the workpiece's intrusive placement with AI / Workpiece tabs in the existing assistant panel, selected by Lu in place of the separate dock. Reuse Petrinaut's tab patterns and the assistant's existing resize/collapse behaviour. Keep chat mounted across tab switches so drafts, requests and Voice lifecycle survive; maintain reachable active controls. The additional-tab extension point is generic, while workpiece/provenance semantics stay in the website host. The surface remains readable as it evolves and does not obstruct the canvas, top bar, assistant opener or composer. Keep engineering IDs, hashes and raw why payloads out of the primary reading surface while preserving inspectable provenance and honest freshness/unknown-state reporting. Hiding the useful workpiece together with fixture controls is not the fix. Inspect integration against #9634 without rewriting the colleague's branch; no full editor redesign or construction-tool rewrite belongs in this closeout.

### What is linked

Petrinaut references connect net objects; they do not propagate provenance. Separately, workpiece evidence relations link revision-local text spans to authorized conversation message IDs. A construction request cites a saved revision/hash, passage locators and an operation-level rationale, or an explicit absent-basis reason. The matching browser result records actual changes. Why traverses those records; it does not infer source links from adjacency, graph connectivity or plausible prose. Brunch metadata remains outside canonical Petrinaut documents.

The implemented positive declared-basis path reports `partially-supported`: operation-level links are not independently established field-level intention mappings or semantic grades. Queries can identify an object/field by unique name or ID; canvas-selection-to-source-navigation UX is not claimed by this part.

## Proof

Review the existing code/tests and actual-session records under their respective claim scopes. No new model-quality campaign is required to submit Part A.

| Claim | Oracle and limit |
| --- | --- |
| Saved workpiece is visible and remains queryable | `packages/core/test/update-workpiece.test.ts`, `apps/brunch-agent/test/workpiece-revisions.test.ts`, website `brunch-workpiece-pane.test.tsx`, and actual persona history/display observations. Pointer-only historical results remain readable but do not invent Markdown. |
| Native mutations carry shape, binding and complete effects | Plugin `test/root-node.test.ts`, `test/root-state.test.ts`, `test/declared-basis.test.ts`; app `test/root-creation.integration.ts` and `test/typed-state.integration.ts`. Broader controlled-browser evidence, not a claim of a complete persona-built model. |
| Why resolves recorded changes and citations honestly | App `test/reconciliation.test.ts`, `test/reopened-why.integration.ts` and the retained ordinary persona-session why results. Source linkage may be absent; prose quality is not guaranteed by the structured result. |
| All authorized source IDs remain discoverable | Core `test/update-workpiece.test.ts` and app `test/reopened-why-retention.integration.ts`, implemented in `367d4994fa`. Source text may be clipped; IDs are not windowed. |
| Original-store stop/reopen preserves the actual conversation | Native session history and browser observations under the run above. This is verified local-only evidence, not a fresh-store import, clone or remote durability claim. |
| Persona launching and shutdown use the maintained entrypoint | `src/evaluations/persona/launch.test.ts`, `test/persona-browser.integration.ts`, actual launcher cleanup observations. Run-local Pi trust does not add persona tools or persistent trust. |
| Workpiece UI is usable and compatible with FE-1645 | A real-browser witness at the integrated revision: ordinary mode has no unsolicited fixture chrome; demo mode retains the selector; a long evolving workpiece remains readable with canvas/chat controls reachable; saved-query/freshness behaviour survives. Use the website workpiece and host tests for regression, then Lu reviews the placement before merge. No provider run is required solely to test layout. |
| The PR accurately states the bounded result | Review #9562's purpose, tests, known issues and six-section mission summary against this contract; retain existing package checks and changed-package publication obligations. Review/merge acceptance remains external. |

Before the branch transition, retain unresolved obligations in the future record, remove the consumed ownership side quest after recording its outcome, and archive this contract with the engineering-split status explicit. Do not mark the former full Step A acceptance programme passed.

## Constraints

### Earned data and execution contracts

- Core owns `brunch_mark_question`, durable nonterminating `update_workpiece` and current-workpiece query semantics. Keep one current revision: native tool-call ID, Markdown/hash and display ordinal. A saved version is not an owner-approved meaning.
- Preserve settled revision/basis/locators/rationale/scope or an explicit absent reason in canonical history. Source relations resolve to authorized true-user messages in the same conversation; assistant, signal, prepared and foreign material is not elicited testimony. `brunch_workpiece` returns every authorized source ID; per-source text may be truncated. Unique unchanged same-span carry is bounded; candidate locator queries create no revision, authority or semantic-continuity claim.
- Preserve the current complete-proposal checks, single-browser-call continuation and refusal of mixed browser/server proposals. A future tool-surface redesign must explicitly revisit those contracts where necessary; this split does not weaken or canonize them as the only future design.
- Browser edits use the bound document/incarnation and a prior verified full read. Account independently for all direct and derived effects. Defaults, coercions, generated values and migrations do not inherit testimony or declared intent automatically. Duplicate/retired IDs and conflicting/unknown outcomes remain explicit; failed, no-op, stale and unknown attempts are not causes or permission to replay.
- Keep origin, current changes and attempts distinct. Why uses a verified observation or an explicit as-of scope; a historical call ID alone is not live evidence. Object-key-order equivalence does not relax arrays, field presence, values or mutation base hashes. Outside edits are not attributed to Brunch.
- Petrinaut owns canonical schemas, native input semantics/refinements, mutations, compilation and simulation. Preserve the maintained Flue/Pi carriage/recovery patches, stock-assistant isolation, capacity absence/null/zero/positive semantics, visible Not applied outcomes and publication obligations. No copied schema catalog, second provenance store, graph, observer, runner or generic projection engine.
- Preserve Mission 6b's causal Voice/tool results and active Stop. Direct spoken-user attribution after hydration, durable withholding after settled steps and comparative latency remain unproved. Workpiece/basis/tool payloads are not spoken assistant prose.
- Keep `useBrunchAgent()` plus `useSdcpnPlugin()`, inward dependencies and dedicated `./flue` resources. Prepared fixtures stay test-authored; diagnostic exports are not restoration APIs. No content-bearing telemetry, hidden persona-pack leakage or guessed operational facts labelled as testimony.

### Continuing operating limits

The persona's pack grounds a realistic role, not a closed factual whitelist. Natural improvisation, uncertainty and correction are allowed. Only the actor receives private background; it supplies interview utterances, not construction instructions. Keep persona and operator submissions serial, distinguish operator technical choices from testimony, and never replay old unanswered browser requests.

The maintained launcher uses Pi's run-local `--approve` with its explicit tool/extension allowlist and disabled context/skill/template discovery. Both persona and ChatAgent use `anthropic/claude-sonnet-4-6` with `BRUNCH_STEP_A_ACCOUNTING` unset. Do not revive retired per-request holds, response deadlines, call-count gates or ledger writes; the historical ledger retains its unresolved row and released hold. Existing owner spending/escalation policy remains; this documentation split starts no provider run. Remote writes, release and Linear writes remain separately authorized.

### Owner decisions

- **2026-09-10 — Part A/7b split.** Lu directs this engineering groundwork to its own PR and a focused Mission 7b child branch under the same FE-1573 issue. This is the specific exception to one-issue/one-PR bookkeeping; one live mission per branch remains. It supersedes treating the former semantic-quality/full-region programme as the condition for landing Part A, not the validity of its historical findings.
- **2026-09-10 — UI before Part A merge.** Lu requires UI remediation before merging 7a, coordinated with FE-1645/#9634. This moves the workpiece-placement fix from the proposed 7b scope into Part A closeout. Lu initially selected a separate dock, then replaced it with AI / Workpiece tabs in the existing assistant panel to conserve visual space and limit implementation. The tab choice is current.
- **2026-09-10 — Demo priority.** Live open → explain → correct → update is the assumed demo story; a prerecorded complete elicitation/construction video is the desired additional output. UI remediation and an effective construction path are pre-demo concerns. The tool approach will be discussed separately; neither allowlist expansion nor a replacement construction tool is selected here. The [7b draft](docs/mission-drafts/7b-september-demo.md) owns the successor detail.

## Fog-line

- **Construction surface:** individual instrumented operations work; a smooth complete conversation-driven construction sequence remains unproved. Mission 7b must settle the tool approach before broadening or redesigning it.
- **Link coverage:** optional relations preserve supplied links, not automatic completeness. The demo needs ordinary interaction that creates and retrieves the links it shows, without operator citation-offset instructions.
- **UI:** workpiece visibility is delivered; its placement is an immediate Part A merge blocker. Source-navigation polish and the complete correction interaction remain successor work. The tabbed surface is selected; confirm #9634 integration/landing order before claiming combined verification.
- **Delivery:** original-store recovery is observed. Actual demo host, independent-copy requirements, source selection and current deployed frontend/backend revisions remain to be inspected/decided.
- **Modelling:** the inert clock is an exercised native operation, not an adopted stochastic/dynamics strategy. Modelling effectiveness and broader semantic acceptance remain separate evaluation work.

## Stop or reorient

Stop Part A expansion if a task is building the full demo rather than fixing the explicitly admitted UI blocker or a defect in the PR's stated mechanical claim. Preserve and report source/identity corruption, false effect attribution and unavailable native state; a fluently explained result must not conceal them. Do not gate this engineering split on full model fidelity, a new persona campaign, an optimiser, a new tool design or every historical proof-matrix row. Do not claim the deferred evaluation or demo passed.

## Deferred

- [Mission 7b](docs/mission-drafts/7b-september-demo.md): the focused September live flow, desired construction video, UI/tool ownership work and necessary delivery joins.
- [After-demo construction/explanation evaluation](docs/mission-drafts/7-explainable-construction.md): full-region semantic/behavioural and useful-explanation evaluation, broad passage/adversarial and lifecycle matrices. These remain evaluation questions, not automatic runtime semantic gates.
- [Future spine](MISSION.next.md): template delivery and current-host inspection; Missions 9/10 broader repeat/change/retirement/concurrency/reviewer scenarios; Mission 11 consumer-defined optimisation; assumption-preview and other plugin/source work. Bring forward only what the agreed demo actually consumes.
