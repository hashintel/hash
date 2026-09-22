# Petrinaut tooling remediation replan

**Status:** accepted branch planning authority for `ln/pn-tooling-remediation`; implementation remains paused pending owner acceptance of the final topology amendments below.

**Imperative:** Restore Brunch as the product assistant over Petrinaut’s complete canonical capability surface, preserve invocable controls that isolate transport and prompt-architecture effects, and use matched evidence to decide whether Brunch construction needs a model-visible deep tool.

## Why this replan exists

The branch’s first canonical mode was intended to isolate whether Petrinaut’s Stock prompt and tool catalogue could cross Flue without material loss. That control was promoted into the product path without re-deciding the product contract. The active path therefore returns the Stock prompt and bypasses Brunch’s context projection, elicitation, Ledger, freshness, provenance, and explanation behavior. The subsequent reduction deleted the browser half of the prior Brunch construction path before an integrated Brunch arm completed.

The canonical tracer established schema carriage, real browser execution, and multi-call suspension and continuation. It did not establish completed task parity, comparable latency, automatic diagnostics carriage, effective integration of Stock capability guidance into Brunch, or that a model-visible construction tool is unnecessary.

This plan separates controls from the product and restores the unresolved interface decision as an evidence gate.

## Restoration and merge strategy

Do not replace the deleted browser path with an unrelated new topology. Treat the file tree removed by `47f410d51d` as the first source of candidate seams: selectively restore the modules whose responsibilities remain valid, then rewrite them in place around canonical Petrinaut tools and the contract in this plan. Do not restore obsolete model-facing aliases, model-copied protocol identities, or the old batch contract merely because their former files are available.

The first tracer is expected to add no new production module paths. A genuinely new production file requires a stop and re-decision that identifies the responsibility no restored or retained module can own. Tests and evidence artifacts may be added when no existing path fits them.

Keep the high-conflict `local-storage-demo-app.tsx` patch to composition only: imports, mode selection, adapter construction, and existing `aiAssistant` slots. Put browser execution, recording, settlement, and result shaping in the selectively restored modules. Preserve Voice’s existing transport, Stop, history, source attribution, and UI composition; no source file under `voice-interview/` is an expected implementation target.

## Terminology

**Ledger** is the product and domain term for Brunch’s maintained semantic account. The current implementation uses `workpiece` in symbols and persisted tool names for that account and its revisions. This branch may preserve those implementation names while restoring behavior. The later Ledger architecture rework will make `Ledger` canonical in code and rename the current `workpiece` symbols.

## Settled decisions

1. **Brunch is the product assistant.** The product uses Brunch’s prompt and skill architecture, elicitation, Ledger, provenance, freshness, and explanation behavior.
2. **Full Stock capability parity is standing policy.** Brunch must be capable of everything the Stock assistant can do, including document reads and mutations, hierarchy, scenarios, metrics, layout, documentation, title changes, diagnostics, and experiments.
3. **Stock capability guidance must be integrated into Brunch.** The exact Stock prompt is a control input and capability reference, not the product prompt. Relevant guidance must live in the appropriate Brunch core prompt, SDCPN plugin prompt, modelling skill, or Petrinaut-owned runtime reference and must be proven with the complete capability surface.
4. **Petrinaut owns capability schemas and execution semantics.** Brunch imports or mechanically derives canonical names and schemas and executes through Petrinaut-owned handlers. Brunch does not maintain copied field catalogues.
5. **Brunch owns its mechanics.** Binding, deterministic ordering, persistence settlement, diagnostics carriage, result correlation, record-keeping, provenance, Ledger projection, recovery, and explanation surround canonical execution.
6. **Stock-over-Flue remains a minimal invocable control for this decision.** It uses the exact Stock prompt and canonical catalogue over Flue, with separate history and without Brunch or Ledger claims. It proves Flue and library mechanics, not the product prompt architecture. It gets no dedicated product UI or parallel host adapter and may be removed after the matched proofs if it no longer answers a live diagnostic question.
7. **Ledger architecture stops at the existing interface.** This branch restores the current Ledger contract behind the current `workpiece` symbols but does not redesign its domain model or UX. A child branch may do so later.
8. **Experiments remain in the product capability set.** `createExperiment` executes through Brunch session and record-keeping mechanics, binds to its source document revision, keeps progress correlated and visible, and durably records cancellation, failure, and terminal result. It is not treated as a document mutation when it does not mutate the document.
9. **Deletion follows integrated proof.** Import-graph disuse is insufficient evidence that a product responsibility has been replaced.
10. **Paid inference has a standing testing allowance.** Assume USD 50 is available for each matched set of runs after deterministic and local product-boundary gates pass. Do not block on renewed authorization within that allowance. Estimate or track spend, warn proactively when the remaining allowance may be insufficient, and ask before materially exceeding it.

## Prompt and skill integration baseline

Before choosing a construction interface, Brunch must mount the complete canonical catalogue through its normal composition path and integrate the Stock assistant’s capability knowledge into Brunch’s prompt and skill ownership:

- the core Brunch prompt owns universal Ledger and evidence conduct;
- the SDCPN plugin prompt is a short router into the mounted capability and modelling skill;
- the SDCPN skill owns elicitation, modelling, construction, validation, and assumption decisions;
- a Petrinaut-owned runtime reference supplies extension gating, exact executable-code surfaces, scenarios, metrics, hierarchy, layout, diagnostics, experiments, and other canonical capability facts; and
- capability alignment tests prevent Brunch guidance from claiming less or more than the mounted Petrinaut surface.

The integration must preserve the policy that an explicit “use sensible defaults,” “you decide,” “make it up,” or equivalent authorization permits purpose-bounded, labelled assumptions without further interviewing. It must not depend on a duplicated literal copy of one prompt-chip sentence.

This integrated Brunch canonical baseline proves that all Stock capabilities remain usable after adding Brunch prompts, skills, session behavior, and Ledger mechanics. It does not decide the construction interface.

## Expected implementation topology

Legend: `[M]` modifies a retained file; `[R]` selectively restores the deleted path and rewrites it in place; `[=]` reuses the current seam without an expected change; `[V]` verifies a merge-sensitive boundary and changes it only if the real test exposes a contract gap.

```text
libs/@hashintel/petrinaut-core/
└── src/
    ├── ai.ts                                                     [M]
    │   Split the current Stock prompt into a Stock behavioral frame and a
    │   composable Petrinaut capability/runtime reference; retain one Stock prompt.
    └── ai.test.ts                                                [M]
        Pin prompt composition and capability/catalogue alignment.

libs/@hashintel/brunch-agent/packages/
├── core/src/
│   ├── prompts/SYSTEM.md                                         [=]
│   └── skills/elicitation/                                       [=]
│       Keep universal Ledger/evidence/default-authorization ownership here;
│       change only if an observed integration gap belongs to every plugin.
├── plugin-sdcpn/
│   ├── src/
│   │   ├── construction-mode.ts                                  [M]
│   │   │   Name the minimal Stock-over-Flue control, integrated baseline,
│   │   │   Interface A tracer, and Interface B tracer.
│   │   ├── flue.ts                                               [M]
│   │   │   Compose exact Stock only in the control; compose Brunch plus the
│   │   │   canonical catalogue and Petrinaut runtime reference in I/A/B.
│   │   ├── prompts/APPEND_SYSTEM.md                               [M]
│   │   ├── skills/sdcpn-modelling/SKILL.md                        [M]
│   │   ├── skills/sdcpn-modelling/references/pn-construction.md   [M]
│   │   │   Replace obsolete custom-tool choreography with mode-aware guidance.
│   │   ├── tools/petrinaut-construction.ts                        [M]
│   │   │   Continue mechanically deriving every canonical tool schema.
│   │   ├── declared-basis.ts                                     [M]
│   │   │   Host-resolved Ledger basis and the smallest Interface A declaration.
│   │   ├── mutate-petrinet.ts                                    [M]
│   │   ├── tools/mutate-petrinet.ts                              [M]
│   │   └── mutation-record.ts                                    [M]
│   │       Retain the ordered batch and record types only for the bounded B tracer;
│   │       remove model-copied hashes, revisions, observations, and locators.
│   └── test/
│       ├── flue-mounting.test.ts                                 [M]
│       ├── construction-tools.test.ts                            [M]
│       ├── declared-basis.test.ts                                [M]
│       ├── mutate-petrinet.test.ts                               [M]
│       ├── mutation-record.test.ts                               [M]
│       └── sdcpn-modelling-skill.test.ts                         [M]
└── transport-aisdk/
    ├── src/
    │   ├── index.ts                                               [M]
    │   │   Carry Petrinaut's automatic diagnostics context with the correlated
    │   │   client-tool continuation instead of dropping the reserved message.
    │   ├── client-tool-result.ts                                  [M]
    │   │   Carry bounded host metadata without changing canonical tool output.
    │   ├── transcript.ts                                         [=]
    │   └── ui-stream.ts                                          [=]
    │       Reuse retained dynamic-tool, validation, and input-mapping support.
    └── test/
        ├── chat-transport.test.ts                                [M]
        └── client-tool-result.test.ts                            [M]

apps/brunch-agent/
├── src/
│   ├── agents/chat-agent/
│   │   ├── agent.ts                                              [M]
│   │   │   Remove the product early return; compose F separately from I/A/B.
│   │   └── tool-catalogue.ts                                     [R]
│   │       Restore the ownership/conformance map, rewritten for mode-specific
│   │       canonical tools and host capability classifications, not copied schemas.
│   ├── conversation/
│   │   ├── mutation-delivery.ts                                  [M]
│   │   ├── net-ledger.ts                                         [M]
│   │   ├── net-freshness.ts                                      [=]
│   │   ├── reported-document-revision.ts                         [=]
│   │   ├── workpiece.ts                                          [=]
│   │   └── why.ts                                                [M]
│   │       Reconcile canonical host records into the existing Ledger/history seam;
│   │       do not add a second record store or redesign Ledger symbols here.
│   └── evaluations/matched-parity/
│       ├── configuration.ts                                      [M]
│       ├── scenarios.ts                                          [M]
│       ├── browser-run.ts                                        [M]
│       ├── run.ts                                                [M]
│       ├── artifacts.ts                                          [M]
│       ├── summary.ts                                            [M]
│       ├── resume.ts                                             [M]
│       └── README.md                                             [M]
│           Extend the existing evaluator to S/F/I/A/B, USD 50 allowance tracking,
│           deterministic prerequisites, verified resume, and comparison output.
└── test/
    ├── chat-agent-mode.test.ts                                   [M]
    ├── integration/native-schema-carriage.integration.ts         [M]
    ├── anthropic-tool-preflight.ts                               [M]
    └── matched-parity-evaluation.test.ts                         [M]

apps/petrinaut-website/src/main/app/local-storage-demo/
├── brunch-petrinaut-tools.ts                                     [R]
│   Restore this as the shared canonical browser execution adapter: bind, validate,
│   order, observe, settle, diagnose, correlate, retain, and return canonical output.
├── brunch-petrinaut-tools.test.ts                                [R]
├── mutation-record.ts                                            [R]
│   Restore observation/effect/reconciliation machinery, rewritten for canonical
│   calls and honest declared/temporal/absent/external provenance.
├── mutation-record.test.ts                                       [R]
├── mutate-petrinet-tool.ts                                       [R]
│   Restore only when implementing the three-operation Interface B tracer; rewrite
│   it around host-attached base and the retained canonical selected-batch executor.
├── mutate-petrinet-tool.test.ts                                  [R]
│   Recover focused ordering, prefix/suffix, settlement, and effect cases rather
│   than restoring the former 943-line suite wholesale.
├── brunch-client-tools.ts                                        [M]
├── brunch-client-tools.test.ts                                   [M]
│   Derive mode catalogues and adapter policy from petrinautAiTools.
├── brunch-panel-transport.ts                                     [M]
├── brunch-panel-transport.test.ts                                [M]
├── use-flue-chat-history.ts                                      [M]
├── use-flue-chat-history.test.ts                                 [M]
│   Restore metadata/input/result hooks already retained by transport-aisdk.
├── brunch-preview-config.ts                                      [M]
├── brunch-preview-config.test.ts                                 [M]
│   Admit a non-product evaluation mode override; add no product-facing selector.
├── brunch-conversation-id.ts                                     [M]
├── brunch-conversation-id.test.ts                                [M]
│   Keep F/I/A/B histories distinct without multiplying storage systems.
├── live-document-hash.ts                                         [=]
├── documents/document-repository.ts                              [=]
│   Reuse live observation and repository settleRevision; do not replace them.
├── brunch-workpiece-history.ts                                   [M]
├── brunch-workpiece-pane.tsx                                     [=]
│   Feed current Ledger UI from canonical history without redesigning it.
├── local-storage-demo-app.tsx                                    [M]
├── local-storage-demo-app.test.tsx                               [M]
│   Limit the production patch to mode, adapter, automaticTools, transport hooks,
│   settlement callback, and existing Ledger-tab composition.
├── voice-history-continuity.integration.test.tsx                 [V]
└── production-voice-availability.integration.test.tsx            [V]
    Prove Voice continuity, Stop/reload behavior, and source attribution without
    changing Voice implementation files merely to accommodate the adapter.

apps/petrinaut-website/src/main/app/voice-interview/               [V]
└── voice-browser-tools.integration.test.tsx                      [V]
    This is a protected parallel-work boundary: no expected Voice source changes.
```

The following deleted files do not return: `brunch-ask-interactive-tool.tsx`, `brunch-ask-mapping.ts`, and their tests. Elicitation remains prompt/skill behavior and ordinary conversation, not a custom browser question widget. The old contents of the three restored browser modules are evidence and test-vector sources, not authoritative implementations; obsolete Brunch aliases and model-authored protocol bookkeeping must not reappear.

### Merge-compatible implementation order

1. Split Petrinaut’s existing `ai.ts` prompt content and repair server composition without touching the website shell.
2. Restore and rewrite the browser adapter and record modules, with their focused tests, while they are still unwired.
3. Restack or merge the latest Voice work before the composition commit.
4. Make one narrow `local-storage-demo-app.tsx` wiring change and run the existing Voice history, availability, browser-tool, Stop, and reload integration tests.
5. Add the A and B three-operation tracers behind evaluation-only modes; do not broaden the production file tree before adjudication.

If Voice work changes the panel composition seam while steps 1–2 are underway, preserve both sides and re-derive the narrow wiring patch against the landed Voice topology rather than treating either branch as automatically authoritative.

## Open construction-interface decision

The branch must compare two viable Brunch construction interfaces before selecting one.

### Interface A — declared projection followed by canonical calls

Brunch first records a bounded projection declaration against the current settled Ledger revision: intended effects, optional literal Ledger excerpts and rationale, stable identities, and expected impact. The host resolves that declaration to the current Ledger revision and authorized evidence. The model then calls Petrinaut’s canonical tools. The host attaches the verified document base and reconciles observed effects against the declaration.

Direct canonical calls remain available. A call without a declared projection receives honest temporal or `basis-absent` attribution rather than inferred passage-level provenance.

**Expected advantages:** exact canonical mutation schemas, fine-grained corrections, and the smallest browser-facing mutation interface.

**Expected strain:** an extra server/browser phase because mixed proposals remain forbidden; more model choreography; less explicit partial-sequence behavior.

### Interface B — canonical catalogue plus one ordered construction tool

Interface B is the original plan’s proposed deep construction tool. Brunch retains the complete canonical catalogue and adds one operation, provisionally `apply_petrinaut_construction`, whose bounded ordered steps are mechanically derived from canonical Petrinaut schemas.

The model supplies intended operations and optional literal Ledger excerpts and rationale. The host resolves current Ledger attribution and attaches the latest verified document base; the model does not copy document hashes, revisions, observation IDs, or Ledger locators. The host then:

1. executes the bounded ordered steps through canonical Petrinaut handlers;
2. preserves successful-prefix and unattempted-suffix semantics;
3. awaits exact document persistence;
4. reads diagnostics automatically after code-bearing changes and dependency changes;
5. applies layout when the request asks for it and the applied structural changes make it relevant; and
6. returns per-step outcomes, independently derived effects, final revision and hash, diagnostics, and layout status.

A successful mutation result becomes the next verified base. A fresh canonical net read remains necessary only when state is absent, externally changed, or otherwise stale.

Reads, documentation, interactive layout that requires a separate user decision, diagnostics, and experiments remain canonical calls. Direct canonical mutations remain possible and receive weaker provenance when no declared basis exists.

**Expected advantages:** explicit declared basis without model-copied protocol identities, deterministic order, fewer model/transport phases, bounded partial outcomes, and one diagnostics and settlement point.

**Expected strain:** a large discriminated schema, two mutation paths, greater provider-schema cost, and possible overuse for trivial edits.

Neither interface is selected by this document. Interface A is the canonical-granularity alternative raised by the owner’s challenge to the original Step 3; Interface B is the original Step 3 proposal corrected to keep base resolution and protocol bookkeeping host-owned.

## Shared host execution contract

The integrated canonical baseline and Interfaces A and B use the same host execution module. For every admitted browser call it must:

1. verify the immutable conversation, document, and incarnation binding;
2. parse input with the canonical Petrinaut schema;
3. execute sibling calls deterministically in assistant-message order;
4. retain bound observations for reads, including document revision, definition hash, and tool-call identity;
5. observe canonical pre-state and post-state for mutations and commands;
6. classify outcomes as `applied`, `no-op`, `blocked`, `failed`, `stale`, `unknown`, or `unattempted` where applicable;
7. await the exact repository revision’s persistence settlement before reporting durable success;
8. derive effects independently rather than trusting the model’s declared effects;
9. deliver current diagnostics automatically after code-bearing changes and dependency changes;
10. persist terminal calls, results, records, experiment dispositions, and correlation identities in canonical Flue history;
11. return retained results rather than re-executing settled tool-call identities after retry or reopen; and
12. derive Ledger state from canonical history, representing missing or unverifiable records as unrecorded rather than repairing them retrospectively.

The model’s projection or construction plan is intent. Only observed host records establish effects.

## Experimental conditions

Matched evidence must keep these conditions distinct:

| Arm | Behavior | Tool interface | Mechanics | Question |
| --- | --- | --- | --- | --- |
| S — native Stock | Stock prompt | Canonical catalogue | Native AI SDK path | What can Stock do, and at what cost? |
| F — Stock-over-Flue | Exact Stock prompt | Exact canonical catalogue | Flue transport only | What drag does Flue introduce? |
| I — integrated Brunch canonical | Brunch prompt and skill architecture with Stock capability guidance | Exact canonical catalogue | Full Brunch host and Ledger contract | Do all Stock capabilities survive Brunch integration, and what drag does that integration add? |
| A — Brunch declared projection | Same integrated Brunch architecture | Interface A | Same full Brunch host and Ledger contract | Is canonical mutation granularity sufficient for bounded, explainable projection? |
| B — Brunch deep construction | Same integrated Brunch architecture | Interface B | Same full Brunch host and Ledger contract | Does the original deep-tool proposal materially improve the result? |

S and F must use the same provider, model, reasoning setting, scenario, and effective diagnostics behavior. I establishes the product prompt and capability baseline. A and B must inherit I and differ only in their construction interface.

## Reversible proof sequence

1. **Separate the modes.** Rename or fork the current canonical mode into the Stock-over-Flue control. Add distinct integrated Brunch modes and separate conversation identity so histories cannot contaminate one another.
2. **Repair the control.** Ensure automatic Petrinaut diagnostics reach the Stock-over-Flue continuation, then prove the control uses the exact Stock prompt and catalogue without Brunch contributions.
3. **Integrate capability guidance.** Compose the complete canonical catalogue and Petrinaut-owned runtime guidance through Brunch’s core prompt, plugin prompt, and skill architecture. Prove catalogue and guidance alignment without a duplicated prompt-chip literal.
4. **Build the shared adapter through one mutation.** Record binding, pre-state and post-state, settlement, effects, diagnostics, and duplicate-delivery behavior for one canonical `addPlace` call.
5. **Prove canonical ordering.** Exercise `addPlace → addTransition → addArc` from one assistant response, including one no-op and one late failure. Pin whether canonical siblings continue or stop rather than assuming deep-tool prefix semantics.
6. **Cover host capability classes.** Add reads, title, layout confirmation and decline, code-bearing mutation diagnostics, hierarchy, scenarios, metrics, and experiment progress and cancellation through the same record contract.
7. **Prove the integrated baseline.** Exercise the complete capability classes through Brunch prompts, skill, session, and Ledger mechanics while retaining canonical calls.
8. **Implement the smallest Interface A slice.** Record one declared projection and reconcile three canonical operations against it.
9. **Implement the smallest Interface B slice.** Support the same three operations through one mechanically derived ordered construction request and the same host adapter.
10. **Run deterministic A/B probes.** Include duplicate delivery, reload between call and result, hand edit between observation and mutation, persistence refusal, pending diagnostics, partial failure, document-incarnation switch, and experiment cancellation.
11. **Adjudicate the interface.** Compare correctness, provenance honesty, schema carriage, model steps, tool calls, repair count, latency, context growth, history size, and semantic quality. Select B only if it materially improves an observed obligation; select A if it meets the obligations without that extra interface.
12. **Broaden after selection.** Mechanically admit the remaining canonical mutation classes and rerun schema-alignment and product-boundary gates.
13. **Run within the standing testing allowance.** Run S, F, I, A, and B under a stated provider, model, reasoning level, call bound, timeout, and USD 50 matched-set allowance. Warn before launch if estimated remaining cost may exceed the allowance and pause only to approve the excess or revise the set.
14. **Delete from evidence.** Remove losing or superseded mechanisms only after the integrated Brunch path completes and its downstream obligations have named owners.

## Deterministic decision probes

The integrated baseline and A/B decision must include:

- full capability alignment across canonical reads, mutations, hierarchy, scenarios, metrics, layout, documentation, title, diagnostics, and experiments;
- unchanged repeat with no duplicate, identity churn, unrelated mutation, or false success;
- one changed fact with a frozen expected impact set and stable untouched definitions;
- one retirement with retained origin and change history;
- a hand edit between observation and apply that refuses rather than overwrites;
- a valid prefix, canonical no-op, invalid late step, and suffix where Interface A pins its continuation semantics and Interface B satisfies its advertised unattempted-suffix semantics;
- duplicate client-result delivery and reopen without re-execution;
- persistence refusal after browser mutation;
- diagnostics pending and then settled;
- requested structural layout, irrelevant layout omission, and interactive layout decline;
- experiment progress, cancellation, and terminal result bound to the source revision;
- one generated element and one correction whose why answer distinguishes declared, temporal, absent, and external basis; and
- one direct canonical mutation under Interface B with an honestly weaker provenance disposition.

## FE-1769 sequence

This remediation is substrate work for [FE-1769](https://linear.app/hash/issue/FE-1769/complete-the-full-proofs-of-ai-petri-net-creation-lifecycle), not proof that its children are complete.

1. **FE-1438 — repeated bounded updates** is the primary A/B discriminator. It requires idempotent repeat, bounded identity-preserving change, honest retirement, concurrent or hand-edit refusal, and current-state explanation.
2. **FE-1394 — reviewer refinement** consumes FE-1438. It adds reviewer authority, retained original and reviewer evidence, semantic revision classes, bounded patch or visible widening, and refusal.
3. **FE-1334 — surprising valid scenario** uses ordinary Brunch reasoning and the selected frontend tool path. It must not introduce a separate hidden analysis representation. It does not by itself select A or B.
4. **FE-1503 — optimisation handoff** remains behind consumer acceptance. Existing Petrinaut experiment capability is terrain, not a selected handoff architecture. Chris and Yannis must first settle the accepted Ledger and model artifacts or constraints, one optimisation question, scenario and parameter representation, execution boundary, expected result, credibility checks, and fixture.

The current FE-1503 description and older issue comments differ on whether the exact SDCPN is handed over or Brunch supplies constraints and an optimisation scenario. Resolve that consumer contract before selecting package, transfer, or execution topology.

## Acceptance before product selection

A product interface may be selected only when:

- S and F are demonstrably distinct from I, A, and B;
- the integrated Brunch baseline proves complete capability and prompt-guidance alignment;
- automatic diagnostics reach all relevant continuations;
- I, A, and B cross the same real browser and persistence boundaries;
- I, A, and B preserve complete Stock capability parity;
- deterministic probes establish binding, settlement, stale refusal, effects, retries, and experiment lifecycle behavior;
- provenance comparisons distinguish declared intent, temporal association, absent basis, external changes, and observed effects;
- semantic review is separate from schema validity and compiler cleanliness; and
- the selection cites observed benefit or strain rather than architectural preference.

## Stop and re-decide

Stop before implementation broadens if:

- the Stock-over-Flue control and Brunch product share prompt, history, or Ledger state;
- the integrated Brunch baseline omits canonical capability guidance or duplicates the Stock prompt as an undifferentiated product prompt;
- canonical Petrinaut schemas must be copied into Brunch;
- a host record claims semantic basis that the model did not declare;
- the model must copy document hashes, revisions, observation IDs, or resolved Ledger locators;
- sibling execution order depends on asynchronous callback scheduling;
- a browser result reports durable success before persistence settles;
- experiment execution lacks a source revision or durable terminal disposition;
- Interface B is broadened before the three-operation comparison demonstrates a benefit;
- a paid arm is retried without verified completion state, or the matched set is likely to exceed its USD 50 allowance without a proactive warning;
- FE-1438, FE-1394, FE-1334, or FE-1503 acceptance is inferred from tool-call success; or
- the FE-1503 consumer contract is inferred from current Petrinaut or optimizer code.

## Current branch state

At commit `47f410d51d`, the product selects the Stock-over-Flue-like canonical path, while the passive Ledger tab remains visible without active Ledger producers. Automatic diagnostics are computed by Petrinaut but dropped by the Flue continuation projection. Canonical mutations do not await repository settlement, independently verify intended effects, or carry declared basis. The retained batched and validated server modes have no first-party product launcher; the current browser cannot execute the retained batched protocol.

These are starting observations, not accepted target architecture.
