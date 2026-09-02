# Side quest — split the future mission spine into provisional drafts

## Status

Active. User-authorized temporary planning remediation inside Mission 4. This file is not a second mission and does not authorize implementation of Missions 5–9 or modification of Mission 4’s product architecture.

## Relationship to Mission 4

Mission 4 remains the sole live execution authority in [`MISSION.md`](MISSION.md). Owner-led architecture work has expanded [`MISSION.next.md`](MISSION.next.md) to roughly 855 lines / 112 KB, where accepted future mission boundaries now compete with shared product framing, standing constraints, historical hypotheses, deployment detail, and unallocated backlog. The owner has ratified progressive disclosure of detailed future clusters into explicit non-authoritative mission-draft files.

This side quest repairs the planning information hierarchy so Mission 4 and its successors can be cut without losing fidelity or creating competing authority. It does not close Mission 4, promote the selected prompt/skill/workpiece architecture, or alter the frozen Mission 3 control.

The Flue composition side quest is closed and recorded in commit `bee37b5e47351c92bde4811187da211736efc6d0`. Its architecture disposition is an input: Mission 4 selects one mounted plugin job skill with core-authored universal elicitation packaged as a lazy resource. Do not reopen that experiment here.

## Imperative

Replace the single sprawling future-planning document with one compact canonical spine plus detailed provisional mission drafts while preserving exactly one live execution authority and every consequential current planning item.

Make authority obvious from file names, headers, pointers, and lifecycle rules. Preserve full semantic fidelity through relocation and condensation: accepted decisions, rejected alternatives, re-entry conditions, scenario classes, evidence, constraints, fog, and stop conditions must each retain one discoverable planning home.

## Target topology

```text
libs/@hashintel/brunch-agent/
├── AGENTS.md
├── MISSION.md                         sole execution authority; unchanged here
├── MISSION.next.md                    compact spine, shared frame, unallocated backlog
├── SIDE_QUEST.md                      this temporary remediation; remove at close
└── docs/
    ├── mission-drafts/
    │   ├── README.md
    │   ├── 5-capture-backed-review.md
    │   ├── 6-traceable-projection.md
    │   ├── 7-bounded-reviewer-revision.md
    │   └── 9-optimisation-handoff.md
    └── mission-archive/               retain existing location
```

Do not create Mission 4 or Mission 8 drafts. Mission 4 is live. Mission 8 ran on the parallel `ln/fe-1569-brunch-agent-deployment` branch and is currently stopped at an application-to-infrastructure handoff, not remotely deployed or accepted.

## Authority contract

### `MISSION.md`

The sole execution authority. It alone contains final `Status`, `Imperative`, `Throughline`, `Proof`, `Constraints`, `Fog-line`, `Stop or reorient`, and `Deferred` sections. Do not edit it in this side quest.

### `MISSION.next.md`

The canonical compact future spine, shared product frame, cross-mission constraints, and unallocated-backlog index. It is not executable and must not duplicate each detailed draft.

### `docs/mission-drafts/`

Detailed provisional context repositories. A draft may preserve a visible product hypothesis, contract stratum, provisional throughline, tracer floor, readiness obligations, joins, constraints, fog, stop conditions, evidence, and rejected alternatives. It must not contain `Status`, a final `Imperative`, or a final `Proof`, and it must begin with an explicit non-authority warning.

### `SIDE_QUEST.md`

At most one temporary user-authorized experiment or remediation under the live mission. Remove this file after its outcome is recorded and the planning split is verified.

### `docs/mission-archive/`

Accepted closed missions retained as evidence, not marching orders. Keep the existing path and links.

## Accepted spine to encode

```text
M4  ship accepted prompt/skill/workpiece architecture
M5  ship mechanical-capture-backed why review over an honest prebuilt pair
M6  ship one meaningful region of automatic traceable projection
M7  ship bounded authorized reviewer revision and scoped patch
M8  parallel deployment mission stopped at application/infra handoff; consume actual contract
M9  ship accepted optimisation handoff, detailed only after consumer contract
```

Mission 4’s exit handoff is a selected frozen workpiece, exact source Flue conversation, exact candidate instrument manifest, and comparative evaluation/adjudication.

Every numbered mission from Mission 4 onward aims to ship a distinct visible product advancement through the deployed Petrinaut/Brunch boundary once that boundary exists. Architecture work, schema repair, evaluation, fixtures, rehearsal, and spikes may be necessary evidence but cannot be the sole mission outcome.

The six-beat FE-1476 review/revise story is the minimum integrated floor, not the product or demo ceiling. The broader demo scenario portfolio has not yet been enumerated. State that honestly. When a draft is later cut into authority, the live mission must name the scenario portfolio and contract classes then accepted within its stratum.

Each future draft must distinguish:

1. **Throughline proof** — the smallest deployed end-to-end path proving the capability crosses the real product boundary.
2. **Readiness gate** — the decision point after that path works: which lateral obligations have become enumerable, which are required to trust the current visible capability, and which first become load-bearing for the next visible product advance.
3. **Stratum closure** — breadth, fidelity, invalid-state, durability, identity, failure, and oracle obligations completed across one named contract layer and accepted scenario/peer set.

Use these terms in planning documents rather than adding more meanings to Brunch’s elicitation-specific “slice” and “sweep” vocabulary.

```text
prior throughline proof
→ inherited stratum closure required by this mission
→ new visible throughline proof
→ readiness gate
├─ close current product contract before this mission ships
├─ admit named lateral obligations into the next product mission
└─ leave unearned breadth beyond the horizon
```

A vertical tracer does not automatically require a horizontal completion pass. Stratum closure is earned when the real path exposes an enumerable peer set or invariant, the current or next accepted product consumer depends on it, and a credible oracle can distinguish closure from presence. Close obligations in the current mission when its visible claim would otherwise be false or unsafe. Carry them into the next mission only when that mission’s new throughline is the first real consumer that makes the broader property load-bearing. Record the owner, re-entry point, and oracle; “a later mission handles it” is not a disposition.

The operational model is recursive:

```text
survey the real territory, not only its maps
→ establish a working line of communication, transport, and evidence
→ stage a dependable camp/base by closing the contract stratum the line has made load-bearing
→ launch the next survey and throughline from that stronger departure point
```

Survey means inspecting or probing the real production/deployed boundary; source documents and intended architecture guide the probe but do not settle terrain claims. Establishing a line means crossing entry to visible exit with the least mechanism that actually carries product data, control, evidence, and failure. Staging a base means making the route dependable for its accepted consumers through the earned peer coverage, identity, durability, recovery, observability, and oracles—not fortifying every imaginable direction. Base-building may close inside the mission that established the line or be inherited by the next mission whose visible advance first depends on it, but the handoff must state which: a provisional route must never be silently treated as a dependable base.

Use the model to reject four failure modes: designing from maps without probing terrain; building infrastructure before a route or consumer exists; declaring a tracer to be a hardened base; and sweeping every adjacent contract merely because one route exposed it.

One green element, region, or correction does not automatically close a mission. “All scenarios” means the named portfolio and contract classes accepted at cut time, not every imaginable operational process.

## Detailed draft contracts

### Mission 5 — capture-backed review of an honest prebuilt pair

Visible advance: through deployed Brunch, a reviewer types a visible SDCPN element name or id and receives the current workpiece rationale, prebuilder projection rationale, and mechanically retained source evidence. The product identifies the net and derivation as prebuilt and claims no automatic projection.

Provisional throughline:

```text
Mission 4 source conversation
→ explicit harness-owned Mission 2 mechanical sweep
→ durable exact-evidence capture ledger
→ selected Markdown workpiece with smallest stable reference seam
→ honestly prebuilt SDCPN + minimal derivation fixture
→ reviewer types visible element name/id in deployed panel
→ provenance capability resolves element → derivation → workpiece → captures
→ evidence-grounded why answer
```

Tracer floor: one consequential visible element resolves to its current workpiece passage, projection rationale, exact evidence excerpts, and relevant uncertainty, assumption, or loss; one deliberately broken link visibly returns unsupported/unavailable.

Readiness must assess every consequential element in the selected prebuilt pair: resolvable provenance or explicit unsupported/unlinked disposition, plus duplicate/ambiguous/stale identity, missing evidence, capture replay, durability, cross-owner refusal, stock-assistant coexistence, visible failure, context source, latency/usage, transcript fallback, and stale-state risk.

Flue history remains the canonical conversation log. Mechanical capture envelopes remain immutable, exact-evidence, domain-opaque source records. The foreground Markdown workpiece owns semantic synthesis. The model neither receives nor schedules a sweep tool. Do not add typed capture payloads, assertion cards, a capture-to-workpiece reducer, an observer, or an ontology.

Minimum currently earned seam: current workpiece revision, workpiece reference, capture evidence references, net element ids, and projection rationale. Its exact representation remains fog for the real tracer.

Capture becomes product data. Mission 5 must consume the actual Mission 8 durability boundary; task-local JSON cannot support a durable provenance claim across a claimed replacement boundary.

### Mission 6 — automatic traceable projection

Visible advance: through deployed Brunch, a person requests projection of a bounded workpiece region, sees a non-empty semantically meaningful live SDCPN region, and can use Mission 5’s why operation for consequential generated elements.

The provider-visible nested-schema repair is the first risk-retiring tracer inside the mission, not completion. The selected region must be operationally meaningful, visually inspectable, exercise the required canonical types/parameters/places/transitions/arcs, preserve stable caller-supplied ids, carry derivations, and support Mission 7’s correction. A toy pair, empty net, parser acceptance, or hermetic-only result is insufficient.

Readiness must assess all canonical schema/mutation contracts used by the bounded stratum, rejection/repair, unsupported defaults, construction-opened losses, repeated projection and changed input, stale/partial state, identity and derivation churn, visible partial failure, provenance completeness, semantic correspondence, path isolation, and latency/usage/transcript fallback. Mission 9 owns broadening to the accepted full handoff scenario rather than Mission 6 stopping automatically at one tracer or expanding without bound.

The projector consumes the current workpiece, not captures as semantic IR and not the transcript as primary input. Petrinaut owns canonical schemas and mutations; do not hand-copy its field shapes into Brunch.

### Mission 7 — bounded authorized reviewer revision and scoped patch

Visible advance: an explicitly authorized reviewer challenges or refines one selected operational meaning in 3–5 focused turns, inspects prior/current workpiece meaning and its change account, and sees the linked SDCPN region patch without unrelated churn. The updated why answer includes retained earlier and newly captured reviewer evidence.

Reviewer authority is scenario-declared and bounded to the chosen region. Evidence remains attributed. Recency alone never authorizes overwrite. Resolve correction versus qualification, contextual coexistence, or conflict before canonical state changes.

Default revision mechanism: one bounded foreground phase-boundary synthesis over the prior workpiece revision plus the newly mechanically captured reviewer evidence. This is the decisive observer-strain gate.

Tracer floor: one selected operational distinction produces an inspectable attributed revision, bounded patch or explicit refusal, updated provenance, and stable unrelated ids/behavior.

Readiness must exercise the currently accepted peer classes within reach: correction, qualification, contextual coexistence, unresolved conflict, rejected/unsupported change, stale revision, impact widening, and any additional class accepted at cut time. Record preservation/disposition of prior meaning, semantic diff, evidence/link churn, latency/usage/blocking, transcript fallback, and compaction/recovery effects where crossed.

Observer/fold remains absent if foreground synthesis works. Repeated consequential blocking, loss of prior meaning, stale state, unrecoverability, or unavoidable unbounded-history dependence triggers stop/reorientation; do not implement an observer by momentum.

### Mission 9 — accepted optimisation handoff

Keep deliberately shallow until Chris and Yannis accept a concrete consumer contract. Known visible outcome: the deployed review/revise path produces a complete selected SDCPN and a visible/exportable package from which they can begin one agreed optimisation experiment.

Known artifact floor: revised workpiece, final SDCPN, capture-backed evidence and derivation, selected scenario and parameters, assumptions, omissions, losses, and unresolved limits.

Before Mission 9 is cut, obtain accepted input artifacts, one concrete optimisation question, required scenario/parameter representation, execution boundary, expected returned result, and minimum credibility checks. Do not invent an export bundle here. The six-beat rehearsal proves that the shipped handoff came through the real path; rehearsal is not the sole output.

## `MISSION.next.md` target structure

Use this information hierarchy, adjusting labels only when migration exposes a concrete need:

```text
# Brunch future mission spine

authority warning

## Current authority and accepted spine

## FE-1476 product frame
### Named scenario portfolio
### Tracer floor and contract readiness
### Cross-mission proof obligations

## Shared constraints and standing locks
### Evidence, workpiece, capture, and projection
### Foreground revision and observer re-entry
### Product and host boundary
### Mission 8 consumed deployment contract

## Detailed provisional clusters

## Unallocated backlog
### Universal elicitation teaching
### SDCPN investigation and construction teaching
### Workpiece hypotheses and cold-reading obligations
### Capture/workpiece seam history and rejected mechanisms
### Gherkin and Dafny pressure tests
### Structured-question vertical capability

## Later and opportunistic concerns
### Host/session continuity and compaction
### Voice
### Observability and simulation viewing
### Simulation-backed checking
### Other substrate and product hypotheses
```

Retain the six FE-1476 beats and these durable relationships:

```text
conversation evidence → workpiece meaning
workpiece meaning → projection decision → SDCPN element
workpiece revision → bounded net change
```

Retain compact cross-mission obligations for workpiece sufficiency, projection fidelity, evidence provenance, revision integrity, patch locality, Petrinaut semantic acceptance, deployed interaction quality, and visible failure.

## Draft-file template

Each numbered draft uses this information hierarchy. Omit a section only when no earned content exists; do not collapse known precision merely because a heading is optional.

```markdown
# Draft Mission N — Name

> Draft cluster only. Not execution authority. Do not implement until this cluster is re-evaluated and cut into `MISSION.md`.

## Cold-start reads

## Visible product advance

## Contract stratum

## Boundary crossings and current throughline hypothesis

## Throughline proof floor

## Readiness ratchet

### Inherited stratum closure

### Readiness gate after the new throughline

## Candidate evidence and oracles

## Verification approach

## Inputs and joins

## Risks and assumptions

## Accepted constraints and guarded invariants

## Cross-cutting obligations

## Expected touched paths

## Fog-line

## Stop or reorient

## Carried evidence and rejected alternatives
```

`Cold-start reads` contains pointers to exact canonical paths or ids, not copied content. It answers whether a separate builder thread could resolve the draft without the originating conversation. If the required reads cannot be named, the cluster remains under-scoped.

`Boundary crossings` renders every layer/actor transition from entry to visible exit, using text arrows, Mermaid, or another compact diagram when topology is consequential. Diagrams preserve known structure; they are not decoration or mandatory symmetry.

`Readiness ratchet` names the prior throughline proof this mission consumes, the lateral contract obligations now load-bearing, which close here, which may become inherited work for the next visible product mission, and why. Every carried obligation names its next owner/re-entry gate and oracle.

`Candidate evidence and oracles` binds every currently observable proof leaf to an exact test file/name, command, fixture, artifact inspection, human witness, or adjudication. If the oracle cannot yet be named, record `ORACLE GAP` and what must resolve it before the cluster can be cut or the leaf claimed. Do not invent a test name to make the draft look complete.

`Verification approach` distinguishes inner mechanism evidence, middle integration/contract evidence where applicable, and outer deployed/user-visible evidence. Outer verification is owned explicitly whenever the product advance is visible; it may be deferred only to a named owner with a re-entry trigger.

`Risks and assumptions` records each consequential assumption with impact if false and the cheapest discriminating validation. `Accepted constraints and guarded invariants` names what must survive and its existing or required guard; stop-the-line invariants are explicit. `Expected touched paths` is a tentative directory/file-level manifest using `+`, `~`, `-`, and `?`, useful for scope/overlap detection but revisable when the real path exposes a better boundary.

In `docs/mission-drafts/README.md`, use a four-backtick outer fence when embedding this three-backtick template.

## Mission 8 reconciliation

Inspect `ln/fe-1569-brunch-agent-deployment` rather than assuming the old prospective Mission 8 cluster landed.

Observed branch status:

- application artifact and local verification exist for Docker image, fail-closed Postgres configuration, IAM/static-password paths, TLS, content-free OTel, liveness, dual architecture, and container/Postgres/collector smoke;
- the mission explicitly stopped at application-to-infrastructure handoff;
- no confirmed ECS service, RDS database/role, hosted collector, restricted ingress, AWS credentials, real IAM probe, restricted Anthropic turn, task replacement recovery, remote telemetry inspection, rollback, or owner acceptance exists;
- the branch archives Mission 4 and installs Mission 8 as live authority, which conflicts with this branch’s still-live and subsequently deepened Mission 4.

For every old Mission 8 subsection, classify content as:

```text
landed application contract
still-open infrastructure/release gate
superseded proposal with surviving branch evidence
```

Keep only successor-relevant actual contracts and open gates in `MISSION.next.md`. Do not copy the deployment branch’s mission-history transition into this branch or imply remote deployment. Do not create a Mission 8 draft.

## Full-fidelity migration

Before editing, inventory current `AGENTS.md`, `MISSION.next.md`, `MISSION.md`, and mission-archive headings. Map every major current `MISSION.next.md` section to exactly one destination:

```text
retained/condensed in MISSION.next.md
moved to one named mission draft
retained as unallocated/later backlog in MISSION.next.md
removed only as duplicate/history with explicit surviving evidence source
Mission 8 content classified through actual branch evidence
```

Preserve, without duplicate planning homes:

- universal elicitation teaching backlog and baseline-gated edits;
- SDCPN investigation obligations, typology decisions, adversarial probes, and return-to-elicitation conditions;
- workpiece hypotheses, observed strain, cold-reader oracle, and rejected mechanism re-entry conditions;
- capture/workpiece seam alternatives and measurements;
- Mission 3’s accepted workpiece/falsified construction split and provider-schema evidence;
- Gherkin Shape C, rejected alternatives, evidence ladder, and reversal conditions;
- Dafny pairing, claim ladders, trust boundaries, vacuity concerns, and reversal conditions;
- observer mechanics only as contingent re-entry evidence, not a planned implementation;
- host choice, session identity, compaction, voice, observability, simulated-conversation viewing, simulation-backed checking, and `HarnessAgent` concerns;
- structured-question semantics and required model → binding → transport → frontend → correlated reply → resumed-turn vertical proof;
- standing locks for AI SDK, stock assistant coexistence, binding ownership, Flue-native composition, and no TUI/generalized runtime.

Do not rely on `/tmp` or an external transcript as the surviving repository record.

## `AGENTS.md` changes

Change only the mission-planning contract needed to permit and govern `docs/mission-drafts/` and preserve earned planning precision:

- preserve the three laws and six-section live mission contract;
- state that the six sections are required semantic addresses, not a maximum detail/template budget;
- require known precision to remain explicit when it changes builder behavior, scope, proof, risk, or handoff, including compact trees and flow diagrams where they make topology legible;
- permit nested cold-start reads, boundary crossings, risks/assumptions, oracle-bound acceptance leaves, guarded invariants, layered verification, cross-cutting obligations, expected touched paths, and readiness-ratchet sections inside the six-section contract;
- require final live mission/side-quest proof leaves to name their oracle; allow a provisional draft to name an `ORACLE GAP`, which must resolve before the leaf can be claimed;
- distinguish throughline proof, readiness gate, and stratum closure, including explicit ownership/oracles for obligations carried into the next visible product mission;
- encode the recursive survey → working line → dependable base → next survey model, where terrain claims require real-boundary evidence and a provisional line is never silently treated as a hardened departure base;
- permit the compact future spine, provisional mission drafts, and one bounded side quest as the only additional planning/control surfaces;
- define the combined future planning record across `MISSION.next.md` and linked drafts;
- require one authoritative planning home per item plus concise spine links;
- prohibit draft implementation before conversion;
- define promotion as re-evaluation and conversion, not rename;
- return material not admitted to the live cut at full fidelity;
- remove a consumed draft;
- compare all affected planning files before and after;
- preserve one issue = one branch = one PR and one live mission.

## Draft lifecycle

`docs/mission-drafts/README.md` must establish:

1. Draft files are context repositories, not authority.
2. Before promotion, re-read evidence/dependencies and inspect the deployed boundary and accepted scenario portfolio.
3. Convert—not blindly rename—the selected draft into the six-section `MISSION.md` contract.
4. Return material not admitted to the cut to `MISSION.next.md` or another draft at full fidelity.
5. Remove the consumed draft so no duplicate quasi-authority remains.
6. Archive the eventual accepted live mission under existing `docs/mission-archive/`.

## Precision and cold-start standard for this side quest

This side quest itself is builder-facing authority. Preserve the detailed topology, Mission 8 evidence, migration obligations, and accepted mission boundaries above; do not collapse them into a shorter generic template during implementation.

### Cold-start reads

A fresh builder must read completely before editing:

- [`AGENTS.md`](AGENTS.md)
- [`MISSION.md`](MISSION.md)
- [`MISSION.next.md`](MISSION.next.md)
- [`docs/mission-archive/README.md`](docs/mission-archive/README.md)
- deployment branch `ln/fe-1569-brunch-agent-deployment`: its `MISSION.md`, `MISSION.next.md`, `docs/evidence/implementations/mission-8-deployment-handoff.md`, Mission 4 archive, and archive README
- commit `bee37b5e47351c92bde4811187da211736efc6d0` and the v3 composition comparison it records

These are pointers, not invitations to copy their content wholesale.

### Risks and assumptions

- RISK: condensation silently drops rejected alternatives, re-entry conditions, or named mechanisms → MITIGATION: build a before/after migration ledger and require one destination or explicit surviving evidence source for every source section.
- RISK: draft files read as concurrent authority → MITIGATION: path naming, warning header, prohibited final sections, AGENTS rules, and negative verification checks.
- RISK: Mission 8’s local application artifact is represented as deployed infrastructure → MITIGATION: reconcile every deployment subsection against branch evidence and retain the stopped-at-handoff qualification.
- RISK: added template detail becomes mandatory empty ceremony → MITIGATION: include earned precision, omit unearned optional subsections, and prohibit symmetric filler.
- ASSUMPTION: four mission drafts plus a compact shared spine are sufficient disclosure boundaries → IMPACT IF FALSE: either shared contracts duplicate or one draft accumulates unrelated branches → VALIDATE: after migration, inspect each file for one coherent invocation/consumer and stop rather than adding another document type automatically.

### Invariants preserved

- `MISSION.md` remains byte-identical — guarded by: pre/post SHA-256 and `git diff --exit-code -- MISSION.md`.
- One live execution authority remains unmistakable — guarded by: exact warning/header review and grep for prohibited draft `Status`, final `Imperative`, and final `Proof` headings.
- Every consequential future-planning item survives in one home — guarded by: source-heading/migration ledger plus named-mechanism, rejected-alternative, re-entry, fog, constraint, stop, scenario, and evidence-source inventories.
- Mission 8 remains a stopped application/infra handoff rather than a remote deployment claim — guarded by: comparison against the deployment branch mission and handoff evidence.
- Existing archive paths remain valid — guarded by: relative-link validation and no rename/move in git diff.

### Verification approach

- Inner: structural checks — exact files, required/prohibited headings, `MISSION.md` hash, Markdown fences, and relative links.
- Middle: semantic migration audit — every old section and named obligation has one destination; no full mission contract is duplicated in the compact spine.
- Outer: cold-start builder review — an independent reader can identify sole authority, locate each future mission’s full context, state its visible advance and readiness ratchet, and distinguish Mission 8’s landed application artifact from its open infrastructure proof.

### Cross-cutting obligations

- Preserve the product-visible mission law and FE-1476-as-floor distinction.
- Preserve core semantic authority with packaged-B runtime topology.
- Preserve mechanical capture versus semantic workpiece versus absent observer boundaries.
- Preserve Mission 8 security, durability, telemetry, stock-assistant, and exposure gates as actually evidenced.

### Expected touched paths

```text
libs/@hashintel/brunch-agent/
├── AGENTS.md                                      ~
├── MISSION.md                                     unchanged
├── MISSION.next.md                                ~
├── SIDE_QUEST.md                                  - at close
└── docs/
    ├── mission-drafts/
    │   ├── README.md                              +
    │   ├── 5-capture-backed-review.md             +
    │   ├── 6-traceable-projection.md              +
    │   ├── 7-bounded-reviewer-revision.md         +
    │   └── 9-optimisation-handoff.md               +
    └── mission-archive/                           unchanged
```

## Throughline

```text
freeze current planning inventory
→ create mission-draft authority/lifecycle README
→ create detailed drafts 5, 6, 7, and deliberately shallow 9
→ migrate old Mission 5–7 material into accepted new boundaries
→ reconcile old Mission 8 material against actual branch evidence
→ rebuild MISSION.next.md as compact spine/shared frame/backlog index
→ update AGENTS.md planning rules
→ compare every source section and named mechanism before/after
→ verify authority, links, formatting, and one surviving home per item
→ record side-quest outcome
→ remove SIDE_QUEST.md
```

## Proof

Observe all of the following:

1. `MISSION.md` remains byte-identical and is called the sole execution authority everywhere.
2. Exactly four draft files exist: Missions 5, 6, 7, and 9. No Mission 4 or Mission 8 draft exists.
3. Every draft begins with the non-authority warning and contains no `Status`, final `Imperative`, or final `Proof` section.
4. `MISSION.next.md` presents the accepted M4–M9 spine, FE-1476 floor, unenumerated broader portfolio, tracer/readiness law, shared obligations/locks, actual Mission 8 handoff status, draft links, unallocated backlog, and later concerns without duplicating full draft contracts.
5. Mission 5/6/7/9 drafts preserve all accepted product boundaries, tracer floors, readiness obligations, constraints, fog, and stop conditions.
6. Every major old `MISSION.next.md` section has one recorded destination; every removal identifies a surviving evidence source and current consequence/re-entry condition.
7. Universal/SDCPN teaching, workpiece/seam hypotheses, Gherkin, Dafny, observer re-entry, host, compaction, voice, observability, simulation, structured questions, standing locks, and Mission 3 evidence remain discoverable at full semantic fidelity.
8. Mission 8 text matches the actual branch: application artifact locally verified, infrastructure deployment/replacement proof open, mission-history conflict explicit.
9. `AGENTS.md` permits the new topology while preserving one live mission and the branch/issue/PR law.
10. Every draft includes cold-start pointers sufficient for a new builder to resolve the cluster, explicit boundary crossings, the readiness ratchet from inherited stratum closure through new proof to successor admission, risks/assumptions, candidate oracles or named oracle gaps, guarded invariants, layered verification, cross-cutting obligations, and a tentative touched-path manifest wherever corresponding precision is already earned.
11. Every final side-quest acceptance leaf is bound to a named command, file/assertion, artifact inspection, or cold-reader check; no leaf relies on an unnamed future test or vibes.
12. All relative links resolve; no repository planning file links to `/tmp`; Markdown fences and tables render; prose is not hard-wrapped; repository formatting/checks pass.
13. A before/after semantic audit compares headings, named mechanisms, rejected alternatives, re-entry conditions, constraints, fog, stop conditions, scenario classes, and evidence sources, with no unexplained loss.
14. The active side quest is removed only after the split and outcome are recorded.

This proof establishes a coherent planning information hierarchy. It does not execute a future mission, close Mission 4, remotely deploy Brunch, or promote production prompt/skill/workpiece code.

## Constraints

- Budget: **USD 0.00**. No paid model, judge, grader, or external service call.
- Do not edit `MISSION.md`.
- Do not alter frozen Mission 3 evidence or v1–v3 Flue composition evidence.
- Do not implement Missions 5–9, source topology, prompts, skills, tools, capture, projection, revision, observer, deployment, or frontend behavior.
- Do not move `docs/mission-archive/`.
- Do not create documents beyond the ratified topology.
- Do not create a Mission 8 draft or represent its handoff as completed remote deployment.
- Do not create a second backlog or standing-lock document.
- Keep each planning meaning in one authoritative home; spine summaries and links are pointers, not duplicated contracts.
- Preserve unexpected worktree changes and modify only files owned by this side quest.
- Use targeted edits and literal-path staging; do not broadly add unrelated files.

## Stop or reorient

Stop and report the smallest blocker if:

- any current planning item cannot be assigned one honest destination;
- the split requires editing live `MISSION.md` to remain coherent;
- Mission 8 branch evidence cannot distinguish landed application contract from open infrastructure work;
- condensation would erase a rejected alternative, re-entry condition, scenario class, or evidence consequence;
- a draft begins to read as executable authority;
- the broader scenario portfolio must be invented rather than honestly marked unenumerated;
- additional document types appear necessary;
- or concurrent changes touch the same planning files and ownership cannot be established.

Do not solve a blocker by duplicating material or weakening the one-live-mission rule.
