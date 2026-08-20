# Document index

One line per document: what it is, where it lives, where it's used. Protocol:
[`docs/agents/documentation.md`](agents/documentation.md). Statuses: `inbox` (awaiting
settlement) · `active` (artifact of a live effort) · `settled` (permanent home) · `superseded`
(retained history replaced by newer canon) · `accepted` (ratified ADR) · `external` (canonical
copy lives outside the repo).

## Inbox (awaiting settlement)

*(empty — items settle out via the arc-close inbox sweep)*

## Reference (settled sources)

| Document | Status | Date | Digest | Used by |
| --- | --- | --- | --- | --- |
| [agentic-elicitation-challenges](reference/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md) | settled | 2026-08-06 | Turn 1 of the founding analysis: four contracts, packs, IR; source of the "capture meaning before representation" principle | elicitation-kernel spec §1 |
| [agentic-elicitation-criteria](reference/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md) | settled | 2026-08-06 | Turn 2: hourglass, five proof obligations, ten invariants, smells, test matrix | elicitation-kernel spec §14 |
| [SDCPN Library - Ideas](reference/SDCPN%20Library%20-%20Ideas.md) | settled | 2026-08-11 | Eight CPS use-case sketches (physical/cyber/events/continuous-state/emergence anatomy), ChatGPT-drafted | FE-1357 map; FE-1363 candidates |
| [hash-sails-public-report.pdf](reference/hash-sails-public-report.pdf) | settled | 2026-08-11 (pub. 2026-01) | SAILS/ARIA public report: Safeguarded AI gatekeeper (world model + safety spec + verifier), biopharma supply-chain research, tacit knowledge as adoption barrier | FE-1357 map (the "why"); FE-1363 cold-chain anchor |
| [voice-implementation-recommendation-pplx](reference/voice-implementation-recommendation-pplx.md) | settled | 2026-08-11 | Perplexity research: voice-adapter options (ElevenLabs/OpenAI/Gemini/xAI) | FE-1359 (superseded in part by its findings) |
| [yannis-dora-lu-transcript](reference/yannis-dora-lu-transcript-2026-08-11.md) | settled | 2026-08-11 | Meeting transcript: no in-house interviewing practice; SDCPN-as-hypothesis aired; baseline-control and priming ideas | expert-meeting-findings note; FE-1360, FE-1361 |
| [amp-analysis-flue-vs-tilde](reference/amp-analysis-flue-vs-tilde.md) | settled | 2026-08-14 | Amp thread export: comparative assessment of the Flue and tilde agent frameworks (development and deployment stories) and its import for this project; verdict: keep Flue, Tilde is a control plane not a runtime | reconciled into flue-architecture-cheatsheet (2026-08-17); source of the pre-remote-exposure gates |
| [2026-08 SDCPNs for cyber-physical systems](reference/2026-08%20SDCPNs%20for%20cyber-physical%20systems.md) | settled | 2026-08 (settled 2026-08-18) | Unattributed draft blog post (image placeholders, typos): five-level SDCPN explainer applied to gas supply, truck fleet, semiconductor fab; arrived during the FE-1405 arc. Read skeptically: good pedagogy, promotional register — concedes its formal guarantees don't apply once continuous/stochastic features are used (open research problem), models carry heavy kernel/guard logic that strains the "formal and inspectable" claim, and Petrinaut's integrator limitation is admitted | Register-3 background (projection-target expressivity) only; not elicitation design input; no consumer yet |

## planning/elicitation-kernel (effort complete 2026-08-10; settled 2026-08-12)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [spec.md](planning/elicitation-kernel/spec.md) | settled | linked from FE-1366 (repo-canonical) | The elicitation-kernel spec: 14 sections + adjudications; FE-1437 import amendment records the native HASH package family and remote-server application charter |
| [product-description.md](planning/elicitation-kernel/product-description.md) | settled | none | STE-style product description |
| [product-description-plain.md](planning/elicitation-kernel/product-description-plain.md) | settled | none | Plain-prose product description |
| [map.md](planning/elicitation-kernel/map.md) | settled | **mirrored in full**: FE-1366 | Completed wayfinder map |
| [issues/](planning/elicitation-kernel/issues/) 01–13 | settled | **mirrored in full**: FE-1367–FE-1379 (relations preserved) | 13 resolved tickets |
| [notes/consistency-prepass](planning/elicitation-kernel/notes/consistency-prepass-2026-08-10.md) | settled | none | Pre-assembly contradiction audit (7 contradictions, adjudicated in spec Appendix A) |

## planning/process-model-elicitation (effort active — FE-1357)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [recommendation-demo-vehicle](planning/process-model-elicitation/recommendation-demo-vehicle.md) | superseded | linked from FE-1362/1328/1329/1331/1333 | Demo-vehicle recommendation: demo shell + artifact boundary; superseded by ADR-0004 (18 Aug meeting chose in-Petrinaut staging) |
| [petrinaut-integration-spec](planning/process-model-elicitation/petrinaut-integration-spec.md) | active | FE-1433 | Integration spec: elicitor as remote server behind the `aiAssistant` transport; suspension-borne client tools; `transport-aisdk`; principal + owner key; two gating spikes |
| [FE-1434 suspension verdict](planning/process-model-elicitation/spikes/fe-1434-suspension-verdict-2026-08-19.md) | active | FE-1434 | Flue 2.0.3 carries a terminating client-tool batch through one durable pending slot and one non-user result signal; 3- and 100-result cases preserve ids in two dispatches |
| [FE-1434 suspension evidence](planning/process-model-elicitation/spikes/fe-1434-suspension-evidence-2026-08-19.json) | active | FE-1434 | Deterministic transcript from the faux-provider runtime probe: native tool-result admission refused, signal resume succeeds, returned text is non-user and uncitable |
| [adapter-panel-spike-2026-08-19](planning/process-model-elicitation/adapter-panel-spike-2026-08-19.md) | settled | FE-1435 | Real-panel spike verdict: AI SDK v6 SSE drives Petrinaut text/reasoning, default server-tool summaries, two live-editor client tools in one batched follow-up, and the diagnostics decorator; full POST/SSE transcript frozen as golden fixtures |
| [transport-aisdk-implementation-2026-08-19](planning/process-model-elicitation/transport-aisdk-implementation-2026-08-19.md) | settled | FE-1436 | Durable real-panel transport: application `/api/chat` endpoint, substrate-neutral harness reply events, AI SDK v6 encoding, boundary gates, opt-in protocol inspection, and a clean-checkout local Petrinaut launcher |
| [ask-return-implementation-2026-08-19](planning/process-model-elicitation/ask-return-implementation-2026-08-19.md) | active | FE-1449 | Ask suspend/return over the wire: the ask leaves as an awaiting client tool, the correlated `{ answer }` submission is admitted against durable history and resumes the conversation; stale/forged/duplicate/non-ask outputs refused before dispatch |
| [notes/grilling-inputs-2026-08-12](planning/process-model-elicitation/notes/grilling-inputs-2026-08-12.md) | active | referenced from map | Session carryover: destination trend, facets/motions, Dora-checklist validate table |
| [notes/expert-meeting-prep](planning/process-model-elicitation/notes/expert-meeting-prep-2026-08-11.md) | active | referenced from map | Prep brief for the Yannis meeting |
| [notes/expert-meeting-findings](planning/process-model-elicitation/notes/expert-meeting-findings-2026-08-11.md) | active | referenced from map | Meeting findings: 5 facts, 7 idea seeds, 2 commitments |
| [notes/open-questions-elicitation-design](planning/process-model-elicitation/notes/open-questions-elicitation-design-2026-08-11.md) | superseded | — | Draft; canonical copy is the [Notion page](https://www.notion.so/hashintel/3b93c81fe024801b89b3cf63a9a6ff20) (`external`) |
| [research/petrinaut-survey](planning/process-model-elicitation/research/petrinaut-survey.md) | active | gisted in FE-1358 resolution | Petrinaut architecture/assistant/format survey + coupling audit |
| [research/voice-feasibility](planning/process-model-elicitation/research/voice-feasibility.md) | active | gisted in FE-1359 resolution | Voice verdict: bolt-on with constraints; T0–T3 tiers |
| [research/elicitation-strategy-literature](planning/process-model-elicitation/research/elicitation-strategy-literature.md) | active | gisted in FE-1360 resolution | Literature synthesis, 9 sections, verification-labeled |
| [research/re-interviewing-literature-worker-report](planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md) | active | noted on FE-1361 | Verbatim instruments: 34-mistake taxonomy, question typologies, LLM-interviewer results |
| [baseline/](planning/process-model-elicitation/baseline/) | active | gisted in FE-1361 resolution | Baseline-control experiment: protocol, situation pack, v0 prompt, runner, both transcripts, scored read-out |
| [ir-design](planning/process-model-elicitation/ir-design.md) | active | gisted in FE-1364 resolution | The IR design: Layer A (ratified on worked examples, FE-1397; definition sentence amended by ADR-0003) + the CPS plugin's ten-kind payload (Layer B) |
| [ir-worked-examples](planning/process-model-elicitation/ir-worked-examples.md) | active | gisted in FE-1397 | Layer-A validation across Gherkin/CPS/BPMN + assurance: property verdicts, amendments, sublimation findings |
| [ir-design-plain](planning/process-model-elicitation/ir-design-plain.md) | active | strain findings on FE-1401 | Plain-prose rendering of the IR design; the rendering pass doubled as review (7 strain findings, one load-bearing) |
| [notes/research-patterns-audit](planning/process-model-elicitation/notes/research-patterns-audit.md) | active | FE-1401 / card inputs on FE-1403 | Plain-language audit of ~30 research imports in 7 families, evidence-graded, with an 8-point strain appendix |
| [notes/penciled-directions-2026-08-14](planning/process-model-elicitation/notes/penciled-directions-2026-08-14.md) | active | FE-1401 | Penciled directions from the legibility session: 8 items with firming actions + editorial reflections |
| [capture-store-plain](planning/process-model-elicitation/capture-store-plain.md) | active | strain findings on FE-1401 | STE-leaning rendering of the capture-store semantics (FE-1390/FE-1389) with a load-bearing not-guaranteed section; 8-point strain report incl. two command-reachable unclosable-conflict paths (confirms FE-1419 commits 7/8) and the FE-1405 status-arity answer |
| [notes/deep-read-fe-1389](planning/process-model-elicitation/notes/deep-read-fe-1389.md) | active | FE-1401 / findings in FE-1420 | Deep-read of the walking skeleton: builder's account, spec-discharge table (issues 10/13 capabilities discharged; markdown floor contradicted in the UI), 12 findings; source of PR #10's backfilled record |
| [notes/deep-read-fe-1390](planning/process-model-elicitation/notes/deep-read-fe-1390.md) | active | FE-1401 / probes on FE-1419 | Deep-read of the capture store: spec-discharge table, write-time tiering assessment (penciled item 7), the FE-1405 status-arity answer, and live-probed confirmation of FE-1419's capture-store claims plus one new aliasing hole; source of PR #11's backfilled record |
| [plugin-contract-spec](planning/process-model-elicitation/plugin-contract-spec.md) | active | FE-1431 (spec issue); decided on FE-1405 | Provisional spec: a plugin is two schemas and two tables (model schema, proposal catalog, fold table, demand table) over the three-register IR (ADR-0003) — harness-machinery typology, standard-interiors library, grade-as-narrowing, derived fold rules; strains 4–7 and envelope pressure #2 held open with owners |

## planning/_shared (cross-effort control documents)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [COORDINATION](planning/_shared/COORDINATION.md) | active | cross-project; maintained by arc-close | Current sequencing recommendation, soft cross-map edges, unresolved seams, and exceptional roots; hard blockers, state, and hierarchy remain in Linear |
| [hash-monorepo-import-plan](planning/_shared/hash-monorepo-import-plan.md) | active until FE-1437 lands | FE-1437 | Native HASH workspace assimilation plan: preserved package boundaries and history, reusable `@hashintel` package family, explicit authority cutover, exhaustive repository-material disposition, toolchain port, boundary gates, and verification |
| [SPEC-LEDGER](planning/_shared/SPEC-LEDGER.md) | active until milestone-one closure | FE-1383 | Obligation-level status and evidence ledger for the elicitation-kernel specification; settles when the milestone closes |
| [flue-architecture-cheatsheet](planning/_shared/flue-architecture-cheatsheet.md) | active | commented on FE-1383; feeds docs/agents/flue-routing.md | Architect's consolidation of all 21 Flue guide pages: direct structured generation uses `harness.prompt`; model-delegated work uses `useSubagent`; three-lane boundary summary and ranked divergence risks; reconciled against installed Flue 2.0.3 source |
| [topology](planning/_shared/topology.md) | active | ratified → ADR-0002; N1 discharged by FE-1422 + FE-1392; local N5 implemented by FE-1391; N3 amended by FE-1437 | Pseudo-style verification of the package/app tree against the three-lane model and spec §12.2: portable ask/sweep protocols, Flue binding wiring, package boundaries, and application-only Brunch–Petrinaut composition |

## planning/legibility-sweep (FE-1401 arc records)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [refactor-queue-2026-08-14](planning/legibility-sweep/refactor-queue-2026-08-14.md) | active | FE-1419 | Nine-commit refactor queue from an inductive review of open PR comments: capture-store contract closure + verification-oracle integrity; second-order review of the FE-1400 sweep's own countermeasures |
| [flue-patterns-audit-2026-08-17](planning/legibility-sweep/flue-patterns-audit-2026-08-17.md) | active | commented on FE-1383 | Audit of Flue usage against the official docs: substantially canonical; two fragile spots since fixed; its two "undocumented semantics" strain items were later resolved by the cheatsheet's agent-hooks read (documented after all — the pins stay) |
| [flue-entry-projection-source-read-2026-08-18](planning/legibility-sweep/flue-entry-projection-source-read-2026-08-18.md) | active | FE-1391 source gate + FE-1392 refresh oracle; reshapes FE-1386 | Installed Flue 2.0.3 evidence followed through to the public reader/archive and a causal refresh-before-apply oracle; FE-1386 remains one behavioral pin |
| [remediation-plan-2026-08-17](planning/legibility-sweep/remediation-plan-2026-08-17.md) | active | A1 discharged by FE-1422; A3/B1 by FE-1391; B2/B3 by source read + FE-1392 | Two ledgers from the consolidated sweep. FE-1392 resolves the private-model-call seam with direct `harness.prompt`, while keeping free-text/abandoned accounting in FE-1420 and the compaction pin in FE-1386 |
| [review-remediation-2026-08-18](planning/legibility-sweep/review-remediation-2026-08-18.md) | settled | FE-1432 | Executed queue from the cross-stack review: six lens-backed findings fixed, all 15 residual threads adjudicated and resolved, below-gate findings owned or refused, and three graduation proposals routed to FE-1401's tooling lane |
| [issue-pr-migration-2026-08-20/](planning/legibility-sweep/issue-pr-migration-2026-08-20/) | settled | FE-1451 | Completed legibility migration: byte-exact snapshots of 73 Linear issues and 25 GitHub PRs, reviewed proposals, canonical stored-target hashes, rollback data, a drift-gated validator, and an append-only apply log |

## Decision records (`docs/adr/`)

Decisions taken *after* the elicitation-kernel spec settled. The original spec text remains the
record of what was decided in August; later changes live in ADRs and, when an accepted execution
contract requires the spec to carry the new operating truth, in explicitly dated amendments.

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [0001-brunch-is-the-product-name](adr/0001-brunch-is-the-product-name.md) | accepted | FE-1388; package naming amended by FE-1437 | `brunch` remains the product and durable-agent identity: `brunch_*` tools and `brunch-gherkin-elicitor`; FE-1437 replaces the standalone `@brunch/*` scope with HASH's `@hashintel/brunch-agent*` package family |
| [0002-topology-and-placement-rules](adr/0002-topology-and-placement-rules.md) | accepted | FE-1401; FE-1422 is its one code change | The three-lane topology and placement rules N1–N6 ratified; N3 now places remote Brunch and Petrinaut composition only in applications; N2/N5 become boundary gates |
| [0003-three-register-ir](adr/0003-three-register-ir.md) | accepted | FE-1405 | The IR is the elicited conceptual model, derived by a pure fold — three registers (assertions / model / projections); write-time-only semantics; promotion never refusal; amends ir-design.md Layer A's definition sentence; full FE-1397-style pass is a stated condition |
| [0004-in-petrinaut-staging-and-the-monorepo-import](adr/0004-in-petrinaut-staging-and-the-monorepo-import.md) | accepted | FE-1433; amended by FE-1437 | September demo stages inside demo.petrinaut.org; the private `@hashintel/brunch-agent*` package family moves into `hashintel/hash`; `apps/brunch-agent` is the remote server application; applications remain the only Brunch–Petrinaut meeting point |

## External canonical documents

| Document | Where | Digest |
| --- | --- | --- |
| [Brunch — September Plan](https://www.notion.so/hashintel/Brunch-September-Plan-3b33c81fe02480a5af6bf3089c3ee640) | Notion | Product leadership's September demo vision |
| [Petri Net business use cases (DB)](https://www.notion.so/hashintel/3893c81fe0248064baa9c13fed48e016) | Notion | Use-case database incl. the spec'd Production Scheduling exemplar |
| [Eliciting process models: open questions](https://www.notion.so/hashintel/3b93c81fe024801b89b3cf63a9a6ff20) | Notion | Team-facing known-unknowns doc, awaiting comments |
| [Cyber-physical process elicitation (Dora, PRO-98)](https://www.notion.so/hashintel/3b93c81fe0248019a7beda9bb31df2c8) | Notion | 14-category elicitation ontology + strategy outline + UX ideas; input claims for FE-1362/63/64 grilling — several categories map to net constructs, several "live only in the intermediate representation" |
| Wayfinder maps FE-1357 (live), FE-1366 (archive) | Linear | Issue-tracker records; see `docs/agents/issue-tracker.md` |

## Path migration note (2026-08-12)

`.scratch/` is retired. Both efforts moved wholesale to `docs/planning/<effort>/` (structure
preserved; relative links fixed). Linear references to `.scratch/...` paths predating this date
map 1:1 to `docs/planning/...`.
