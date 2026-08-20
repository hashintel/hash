# Document index

One line per document: what it is, where it lives, where it's used. Protocol:
[`docs/agents/documentation.md`](agents/documentation.md). Statuses: `inbox` (awaiting
settlement) · `active` (artifact of a live effort) · `settled` (permanent home) · `external`
(canonical copy lives outside the repo).

## Inbox (awaiting settlement)

| Document | Date | Digest | Used by |
| --- | --- | --- | --- |
| [agentic-elicitation-challenges](inbox/agentic-elicitation-challenges-2026-08-06T10-02-41Z.md) | 2026-08-06 | Turn 1 of the founding analysis: four contracts, packs, IR; source of the "capture meaning before representation" principle | elicitation-kernel spec §1 |
| [agentic-elicitation-criteria](inbox/agentic-elicitation-criteria-2026-08-06T14-11-18Z.md) | 2026-08-06 | Turn 2: hourglass, five proof obligations, ten invariants, smells, test matrix | elicitation-kernel spec §14 |
| [SDCPN Library - Ideas](inbox/SDCPN%20Library%20-%20Ideas.md) | 2026-08-11 | Eight CPS use-case sketches (physical/cyber/events/continuous-state/emergence anatomy), ChatGPT-drafted | FE-1357 map; FE-1363 candidates |
| [hash-sails-public-report.pdf](inbox/hash-sails-public-report.pdf) | 2026-08-11 (pub. 2026-01) | SAILS/ARIA public report: Safeguarded AI gatekeeper (world model + safety spec + verifier), biopharma supply-chain research, tacit knowledge as adoption barrier | FE-1357 map (the "why"); FE-1363 cold-chain anchor |
| [voice-implementation-recommendation-pplx](inbox/voice-implementation-recommendation-pplx.md) | 2026-08-11 | Perplexity research: voice-adapter options (ElevenLabs/OpenAI/Gemini/xAI) | FE-1359 (superseded in part by its findings) |
| [yannis-dora-lu-transcript](inbox/yannis-dora-lu-transcript-2026-08-11.md) | 2026-08-11 | Meeting transcript: no in-house interviewing practice; SDCPN-as-hypothesis aired; baseline-control and priming ideas | expert-meeting-findings note; FE-1360, FE-1361 |
| [amp-analysis-flue-vs-tilde](inbox/amp-analysis-flue-vs-tilde.md) | 2026-08-14 | Amp thread export: comparative assessment of the Flue and tilde agent frameworks (development and deployment stories) and its import for this project; verdict: keep Flue, Tilde is a control plane not a runtime | reconciled into flue-architecture-cheatsheet (2026-08-17); source of the pre-remote-exposure gates |

## planning/elicitation-kernel (effort complete 2026-08-10; settled 2026-08-12)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [spec.md](planning/elicitation-kernel/spec.md) | settled | linked from FE-1366 (repo-canonical) | The elicitation-kernel spec: 14 sections + adjudications |
| [product-description.md](planning/elicitation-kernel/product-description.md) | settled | none | STE-style product description |
| [product-description-plain.md](planning/elicitation-kernel/product-description-plain.md) | settled | none | Plain-prose product description |
| [map.md](planning/elicitation-kernel/map.md) | settled | **mirrored in full**: FE-1366 | Completed wayfinder map |
| [issues/](planning/elicitation-kernel/issues/) 01–13 | settled | **mirrored in full**: FE-1367–FE-1379 (relations preserved) | 13 resolved tickets |
| [notes/consistency-prepass](planning/elicitation-kernel/notes/consistency-prepass-2026-08-10.md) | settled | none | Pre-assembly contradiction audit (7 contradictions, adjudicated in spec Appendix A) |

## planning/process-model-elicitation (effort active — FE-1357)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [recommendation-demo-vehicle](planning/process-model-elicitation/recommendation-demo-vehicle.md) | active | linked from FE-1362/1328/1329/1331/1333 | Demo-vehicle recommendation: demo shell + artifact boundary; evidence for 18 Aug discussion |
| [notes/grilling-inputs-2026-08-12](planning/process-model-elicitation/notes/grilling-inputs-2026-08-12.md) | active | referenced from map | Session carryover: destination trend, facets/motions, Dora-checklist validate table |
| [notes/expert-meeting-prep](planning/process-model-elicitation/notes/expert-meeting-prep-2026-08-11.md) | active | referenced from map | Prep brief for the Yannis meeting |
| [notes/expert-meeting-findings](planning/process-model-elicitation/notes/expert-meeting-findings-2026-08-11.md) | active | referenced from map | Meeting findings: 5 facts, 7 idea seeds, 2 commitments |
| [notes/open-questions-elicitation-design](planning/process-model-elicitation/notes/open-questions-elicitation-design-2026-08-11.md) | superseded | — | Draft; canonical copy is the [Notion page](https://www.notion.so/hashintel/3b93c81fe024801b89b3cf63a9a6ff20) (`external`) |
| [research/petrinaut-survey](planning/process-model-elicitation/research/petrinaut-survey.md) | active | gisted in FE-1358 resolution | Petrinaut architecture/assistant/format survey + coupling audit |
| [research/voice-feasibility](planning/process-model-elicitation/research/voice-feasibility.md) | active | gisted in FE-1359 resolution | Voice verdict: bolt-on with constraints; T0–T3 tiers |
| [research/elicitation-strategy-literature](planning/process-model-elicitation/research/elicitation-strategy-literature.md) | active | gisted in FE-1360 resolution | Literature synthesis, 9 sections, verification-labeled |
| [research/re-interviewing-literature-worker-report](planning/process-model-elicitation/research/re-interviewing-literature-worker-report.md) | active | noted on FE-1361 | Verbatim instruments: 34-mistake taxonomy, question typologies, LLM-interviewer results |
| [baseline/](planning/process-model-elicitation/baseline/) | active | gisted in FE-1361 resolution | Baseline-control experiment: protocol, situation pack, v0 prompt, runner, both transcripts, scored read-out |
| [ir-design](planning/process-model-elicitation/ir-design.md) | active | gisted in FE-1364 resolution | The IR design: Layer A (ratified on worked examples, FE-1397) + the CPS plugin's ten-kind payload (Layer B) |
| [ir-worked-examples](planning/process-model-elicitation/ir-worked-examples.md) | active | gisted in FE-1397 | Layer-A validation across Gherkin/CPS/BPMN + assurance: property verdicts, amendments, sublimation findings |
| [ir-design-plain](planning/process-model-elicitation/ir-design-plain.md) | active | strain findings on FE-1401 | Plain-prose rendering of the IR design; the rendering pass doubled as review (7 strain findings, one load-bearing) |
| [notes/research-patterns-audit](planning/process-model-elicitation/notes/research-patterns-audit.md) | active | FE-1401 / card inputs on FE-1403 | Plain-language audit of ~30 research imports in 7 families, evidence-graded, with an 8-point strain appendix |
| [notes/penciled-directions-2026-08-14](planning/process-model-elicitation/notes/penciled-directions-2026-08-14.md) | active | FE-1401 | Penciled directions from the legibility session: 8 items with firming actions + editorial reflections |
| [capture-store-plain](planning/process-model-elicitation/capture-store-plain.md) | active | strain findings on FE-1401 | STE-leaning rendering of the capture-store semantics (FE-1390/FE-1389) with a load-bearing not-guaranteed section; 8-point strain report incl. two command-reachable unclosable-conflict paths (confirms FE-1419 commits 7/8) and the FE-1405 status-arity answer |
| [notes/deep-read-fe-1389](planning/process-model-elicitation/notes/deep-read-fe-1389.md) | active | FE-1401 / findings in FE-1420 | Deep-read of the walking skeleton: builder's account, spec-discharge table (issues 10/13 capabilities discharged; markdown floor contradicted in the UI), 12 findings; source of PR #10's backfilled record |
| [notes/deep-read-fe-1390](planning/process-model-elicitation/notes/deep-read-fe-1390.md) | active | FE-1401 / probes on FE-1419 | Deep-read of the capture store: spec-discharge table, write-time tiering assessment (penciled item 7), the FE-1405 status-arity answer, and live-probed confirmation of FE-1419's capture-store claims plus one new aliasing hole; source of PR #11's backfilled record |

## planning — repo implementation (cross-effort)

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [CONVERGENCE](planning/CONVERGENCE.md) | active | FE-1401 (created); maintained per legibility.md | The convergence record between the two root maps (FE-1383 build, FE-1357 demo/plugin-spec): per-obligation status ledger (~73 rows incl. 7 contradicted), vocabulary-drift table, the inter-map seam record, and the living cross-map sequencing strategy. Rows and sequencing update as branches land |
| [refactor-queue-2026-08-14](planning/refactor-queue-2026-08-14.md) | active | FE-1419 | Nine-commit refactor queue from an inductive review of open PR comments: capture-store contract closure + verification-oracle integrity; second-order review of the FE-1400 sweep's own countermeasures |
| [flue-patterns-audit-2026-08-17](planning/flue-patterns-audit-2026-08-17.md) | active | commented on FE-1383 | Audit of Flue usage against the official docs: substantially canonical; two fragile spots since fixed; its two "undocumented semantics" strain items were later resolved by the cheatsheet's agent-hooks read (documented after all — the pins stay) |
| [flue-architecture-cheatsheet](planning/flue-architecture-cheatsheet.md) | active | commented on FE-1383; feeds docs/agents/flue-routing.md | Architect's consolidation of all 21 Flue guide pages: affordances, recommended patterns, do-not-rebuild warnings per concern; three-lane boundary summary (consume / translate-in-binding / own); five ranked divergence risks; reconciled against the flue-vs-tilde analysis (pre-remote gates, churn, at-least-once floor, skills-need-the-build-graph) |
| [remediation-plan-2026-08-17](planning/remediation-plan-2026-08-17.md) | active | A1 → FE-1422; corrections on FE-1391/96/1420 | Two ledgers from the sweep's consolidated read: A — eleven wrong-or-fragile items with owners and plan corrections (one decision, three folded into FE-1393/1405 design moments, pre-remote gates → FE-1423); B — seven information gaps routed by cheapest honest resolution (types < raw page < probe < spike) |
| [topology](planning/topology.md) | active | ratified → ADR-0002 | Pseudo-style verification of the package/app tree against the three-lane model and spec §12.2 (one violation: the ask protocol in the binding → FE-1422; two tolerated-untils) + normative placement rules N1–N6 for the sweep executor, packs/cards, demo shell, experiments, and storage-port implementations |

## Decision records (`docs/adr/`)

Decisions taken *after* the elicitation-kernel spec settled. Where an ADR
supersedes part of the spec, the spec file is left unedited — it is the record
of what was decided in August, and the ADR is how a later change is recorded.

| Document | Status | Linear | Digest |
| --- | --- | --- | --- |
| [0001-brunch-is-the-product-name](adr/0001-brunch-is-the-product-name.md) | accepted | FE-1388 | `brunch` settles as the product name and may appear in structure: `brunch_*` tools, `@brunch/*` scope, `brunch-gherkin-elicitor` agent identity. Supersedes spec §12.3's `bl_*` provisional; the ban on function-naming (`elicit_*`) survives |
| [0002-topology-and-placement-rules](adr/0002-topology-and-placement-rules.md) | accepted | FE-1401; FE-1422 is its one code change | The three-lane topology and placement rules N1–N6 ratified (topology.md stays the living reference); N2/N5 to become boundary gates |

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
