# Brunch agent

Brunch is the elicitation harness and package family at `libs/@hashintel/brunch-agent`. This
directory is its context root, not a package workspace. HASH root guidance wins where it differs
from this file.

## The three laws

1. **Real throughline first, least mechanism.** Cross the real production boundary end-to-end
   before improving anything: use the real entrypoint and wiring, prefer the platform and chosen
   libraries to a custom mechanism, and inline what can stay local. Pin only the invariants and
   constraints the working path actually exposes. Minimum applies to the mechanism, not the
   contract: known consumers of this work must be able to rely on it without inventing missing
   semantics. Then re-decide at the new fog-line instead of running an inherited plan.
2. **Deepen only under observed strain.** An intended design is a hypothesis, not a destination.
   Anti-caricature: a pattern name retrieves relevant properties; it is not a blueprint. Restate
   the local obligation without the name, then implement only what discharges it. Admit the next
   piece of complexity when the current implementation strains under a present requirement
   (duplication diverging, a boundary leaking, an invariant that will not hold locally), and cut
   the design when the design itself is what is straining progress.
3. **A branch is a mission, not a ticket.** Every mission carries an imperative that guides and
   bounds its work; its evidence-gathering and decisions are judged against that imperative, not
   against a plan graph.

## Mission contract

When work starts on a branch, state these six things in [`MISSION.md`](MISSION.md) and copy them into the branch/PR description. These sections are required semantic addresses, not a ceiling on detail or a fixed template budget.

- **Imperative** — what must become true, and why now.
- **Throughline** — the real entrypoint or boundary being changed.
- **Proof** — the observable evidence that would establish progress, and the claim it does not make. A path, a connected skeleton, and a discharged contract are different completions.
- **Constraints** — the few already-earned truths that must stay true.
- **Fog-line** — uncertainty that current evidence cannot yet decide between consequential alternatives, and must not be designed past. Clarifying intent is not clearing terrain. Capture unresolved flags here: why they matter, what they constrain, and what would re-enter them. Running the path may lengthen this list; that is calibration, not regression.
- **Stop or reorient** — evidence that invalidates or changes the route.

The six sections are the live mission contract. Keep a short **Status** header (live / accepted) above the contract and a closing **Deferred** section pointing into the future planning record.

Preserve known precision whenever it changes builder behavior, scope, proof, risk, or handoff. Nest cold-start reads, boundary crossings, risks and assumptions, oracle-bound acceptance leaves, guarded invariants, layered verification, cross-cutting obligations, expected touched paths, and readiness-ratchet sections under the six semantic addresses when earned. Compact trees and flow diagrams are welcome when they make topology or sequencing more legible; omit unearned symmetric filler.

Every final proof leaf in a live mission or side quest must name a credible oracle: an exact test or command, fixture, artifact inspection, human witness, or adjudication that can distinguish the claimed result from mere presence. A provisional mission draft may instead mark `ORACLE GAP` and state what must resolve it, but that gap must close before the draft is cut with that leaf as a claim.

### Mission, current throughline, and delegated work

**Decompose the territory broadly; authorize execution narrowly. A responsibility map is not a completion schedule.**

- **Mission** holds the imperative, accepted meaning and final acceptance bar across many tasks. Acceptance obligations remain visible; they are not automatically prerequisites to the first informative use.
- **Current throughline** names the next real product observation that can change a consequential decision. Use the existing system to obtain it before building more capability.
- **Delegated work** discharges concrete dependencies of that observation. Each task names its consumer or observed failure, bounded change/probe, discriminator and return condition—not independent subsystem completion. Parallelize independent dependencies of that same observation, not empty cells in a responsibility matrix.

Before dispatch, answer: **What next observation becomes possible through this task, and why can't the current system produce it?** Integration returns to that question; it is a decision point, not a successor-task launch trigger.

```text
survey the real territory, not only its maps
→ attempt the next informative use through the actual product
→ inspect what worked, failed or remained unknown
→ repair a blocking or false/unsafe boundary, or advance with explicit limits
→ re-decide the route from that evidence
```

Terrain claims require inspection or probes at the real production or deployed boundary. A working line crosses entry to visible exit with the least mechanism that carries product data, control, evidence and failure. Close an obligation now when it blocks the next observation or makes the current visible claim false or unsafe. Otherwise carry its limitation, named consumer, re-entry trigger and discriminator. That consumer may be later in the same mission; it need not become another mission.

Stratum closure is a deliberate breadth decision for an identified current consumer, not an obligatory stage after every tracer. Never silently treat a provisional line as a hardened departure base, and do not fortify every adjacent contract merely because one route exposed it.

This is an expeditionary posture, not a defensive one. Survey only until the next consequential and reversible move is warranted. Once downside is bounded or explicitly accepted, advance; uncertainty is terrain to reduce through action, not a reason to hold position. Stage only the base the next operation needs, not the safest or most complete base imaginable.

### One live mission and bounded planning surfaces

One Linear issue = one Git branch = one GitHub PR, and only one live mission may exist on that branch. [`MISSION.md`](MISSION.md) is the sole execution authority; agents and humans implement only against it.

Only three additional planning or control surfaces are permitted:

1. [`MISSION.next.md`](MISSION.next.md), the compact canonical future spine, shared frame, cross-mission constraints, and unallocated-backlog index.
2. Linked provisional drafts under [`docs/mission-drafts/`](docs/mission-drafts/), which preserve detailed cold-start context for named future clusters under the [draft authority and lifecycle rules](docs/mission-drafts/README.md).
3. `SIDE_QUEST.md`, when present, as the one temporary user-authorized experiment or remediation inside the live mission.

`MISSION.next.md` and its linked provisional drafts form the combined future planning record. They are not execution authority, do not create concurrent missions, and must not be implemented before conversion into `MISSION.md`. Give every planning item one authoritative planning home; the compact spine may carry a concise summary and link, but must not duplicate the detailed contract. Keep each hypothesis, observation, accepted decision, rejected alternative and reason, re-entry condition, question, named mechanism, constraint, fog item, stop condition, scenario class, and evidence source at the fidelity needed for a cold-start builder. Do not rely on a transcript as the surviving record.

A side quest is legitimate only when live-mission evidence exposes a bounded set of concrete residual failures whose investigation helps close that mission or informs named future clusters. It must state its relationship to the live mission, imperative, throughlines, oracle-bound proof, constraints, stop conditions, and budget for each paid activity. It must not supersede or contradict `MISSION.md`, broaden into speculative future work, create a second live mission, or coexist with another active side quest. Record its outcome in affected future-planning homes, then remove the active file before archiving the mission. A documentation-only remediation records its oracle-bound close audit in the canonical future-planning record rather than inventing an evidence document.

### Conversion and lifecycle

Promotion is re-evaluation and conversion, never a rename or wholesale promotion. The ordered conversion and archival procedure lives in [`docs/mission-drafts/README.md`](docs/mission-drafts/README.md#lifecycle).

The always-loaded invariants are: keep exactly one live mission; return every item omitted from a cut to the combined future planning record at full fidelity; remove the consumed draft so it cannot remain duplicate quasi-authority; and compare every affected planning file before and after with no unexplained loss or duplication. A current mission's **Deferred** items belong in that record and must not be silently dropped or superseded.

### Decision integrity across handoffs

These rules exist because Mission 4 lost its design between the owner conversation and production: each handoff summarized the previous summary, an evaluator narrowed an accepted wording, and prompts were then rewritten to satisfy the evaluator. The record is [`docs/evidence/design/mission-4-handoff-failure-analysis-2026-09-02.md`](docs/evidence/design/mission-4-handoff-failure-analysis-2026-09-02.md).

1. **Current-decision promotion.** When the owner accepts a decision that changes the live mission's implementation or proof, amend `MISSION.md` before any further delegation. `MISSION.next.md`, drafts, evidence, ledgers, and transcripts never substitute for current authority.
2. **Authority amendment before implementation.** The owner reviews and accepts a material recut; that authority change is committed on its own before dependent product or evaluation work begins. Never combine recut, implementation, instrument freeze, or close in one transformation or one commit.
3. **Authority-preserving handoff.** A handoff that translates accepted semantic content, architecture, interaction policy, proof interpretation, or a frozen instrument names the protected source, each production destination, the permitted semantic deltas, and the unresolved choices. An unlisted semantic delta is a stop condition, not a judgment call. Mechanical corrections inside an owner-approved envelope with stated bounds and stop conditions may be batched without a per-change gate.
4. **Oracle non-authority.** An oracle may falsify an implementation or a claim; it may not redefine policy, architecture, or interaction semantics. An operationalization stricter than the accepted wording is an owner decision, and prompts are never rewritten to mirror a checker.
5. **Scoped experimental verdicts.** Every experiment adjudication states which decisions its evidence may update and which remain owner-held. Failure of one implementation mechanism does not select another architecture.
6. **Rationale before disposal.** Before a workbench or draft holding the only explanation of a surviving decision is deleted, move that still-binding reason into `MISSION.md` or an ADR. Otherwise intentionally discard the workbench. Do not copy stale workbenches forward or pin complete run directories in the repository.
7. **Status is present tense.** `MISSION.md` Status carries only the current state and pointers. Commits, tests, and the PR close report are the normal implementation record. Campaign chronology does not live in repository evidence.
8. **Close by external acceptance.** Where closure, witness acceptance, handoff selection, or a paid ceiling is owner-reserved, an agent prepares the packet and stops. It records acceptance only after the owner has performed that gate.

A delegated task returns its result in the PR or chat. It does not create a file under `docs/`. Do not add packets under `docs/evidence/implementations/`. Per-implementation proof is the code, test, commit, and PR.

## Correctives

- Before adding structure, name the production pressure that requires it.
- **Safeguards must earn their friction.** Before adding or defending a limit, gate or refusal, identify the observed failure, concrete external constraint or explicit owner requirement it protects. Inherited code, a safety label and passing enforcement tests do not establish necessity. When a safeguard blocks real use, question its justification before tuning or instrumenting it; preserve the actual data/security contract with the least mechanism.
- Work the first unproven boundary; do not build toward the imagined end.
- Real entrypoint or it did not happen; a proof is legible when a human can watch it and decide.
- A ticket is a projection; the mission is the authority. If the ticket stops serving the
  imperative, stop and surface the divergence instead of finishing the ticket.
- When evidence changes the route, stop; do not finish the planned neighbourhood.
- When things accumulate, subtract before you extend.
- No imperative and proof means it is not a mission yet — do not start it.
- Censor noise; keep consequential doubt visible.
- Checking is proportional to consequence and reversibility: use the narrowest falsifying check, the actual product boundary for an integration claim, and the affected package checks before integrating code. Reuse earned regression tests; a documentation or lane handoff does not itself require another full browser/crash campaign. Within that budget, a commitment is warranted when its premises are observed or explicitly accepted as risk. Evidence retention follows the [retention contract](docs/evidence/README.md).
- Low confidence must change the next move — build the smallest real path that reveals more,
  inspect, choose the reversible option, or flag it — or go unsaid.
- At close, update the PR description: what each proof item established, the observed answer to
  each fog-line question, and the flags that carry into the next mission. Archive the closed
  `MISSION.md` as above; the PR description remains the GitHub-facing close report.

## Development and evaluation execution

Ordinary dependency installation, builds and documentation research may use the network with repository tooling and pinned dependencies; a missing cache is not by itself an AFK blocker. This permits neither unrelated upgrades nor sending private material to external services. Synthetic tests must remain synthetic and must not fall through to live providers.

Before hermetic proofs, provider authentication checks or paid evaluations, read [evaluation execution safety](evaluations/README.md#execution-safety). Isolation follows the proof claim, not all development. Missions specify exceptions and concrete run limits; they need not reauthorize this default, and these standing rules grant no paid allocation or waiver of an existing stop.

## Retained facts

- **Toolchain:** format TS/JSON with root `oxfmt`; lint via `lint:eslint` (Oxlint) and
  `lint:tsc` (`tsgo --noEmit`); unit tests via `vitest run`; build with Vite 8. Run tasks through
  the HASH root Yarn/Turbo workspace — add no `package.json` or lockfile here.
- **Issue, branch, and PR lifecycle:** one Linear issue = one Git branch = one GitHub PR; the
  branch mission remains the execution authority. Follow
  [`docs/agents/git-workflow.md`](docs/agents/git-workflow.md) when creating, rebasing, or
  submitting a branch or connecting it to an issue or PR.
- **Interactive delegation:** before preparing, placing, reusing or closing Herdr-hosted subagents, read [`docs/agents/interactive-work.md`](docs/agents/interactive-work.md) for checkout/configuration readiness, readable layout, lifecycle and cleanup. `MISSION.md` supplies task scope and concrete execution exceptions/allocations.
- **Linear project posture:** Brunch issues live on team `FE`, project `brunch-agent`, whose mixed
  inherited issue history is evidence and inbox rather than an authoritative plan. Follow
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) before creating, reusing, relating,
  or changing an issue. Reading is fine; get explicit approval before every Linear write.
- **Linear and GitHub writing:** follow
  [`docs/agents/issue-writing.md`](docs/agents/issue-writing.md) whenever creating or editing an
  issue, pull request, or comment.
- **Plugin scope:** each plugin pairs one reusable domain typology with one target formalism; it may name concepts from that typology but never facts or nouns from a concrete domain, organization, situation, or scenario.
- **Plugin freshness:** after core guidance changes, re-read roughed-in plugins before treating them as seam evidence. Classify each divergence as lag (realign) or intent (record why), then update the plugin's single `Aligned to core as of <commit>` marker to the reviewed core revision. Coordinate in-progress packages with their assigned owner rather than editing across ownership.
- **Topology gates** (enforced by tests): core and plugins expose Flue-native production resources through dedicated `./flue` subpaths; plugins depend inward on core and never on bindings; transport packages never depend on a binding; suspended code lives under a package's `src/_suspended/` and is never mounted; bindings translate generalized capture machinery into the selected substrate. Evaluation answer keys stay on the evaluation side, never inside interviewee or elicitor inputs.
- **Posture:** prototype · stakes high — persisted capture data and merge gates must fail loudly,
  never corrupt silently · horizon: current milestone.
- **Flue:** when adding state, a loop, a route, or a test harness, consult
  [`docs/reference/architecture/flue-routing.md`](docs/reference/architecture/flue-routing.md)
  before inventing a parallel mechanism.

## Authorities vs obligations

[`docs/specs/`](docs/specs) (see its [README](docs/specs/README.md)), [`docs/adr/`](docs/adr)
(see its [README](docs/adr/README.md)), and [`docs/evidence/`](docs/evidence) are history and
reference: prior design hypotheses and observed results. They are not marching orders. Re-earn any design you build to; an implemented decision is
evidence, unimplemented design is a hypothesis. A branch may depart from a recorded decision by
noting the divergence in its commit. Provenance is not warrant: a statement is evidence of what
was said, not automatically of the terrain. This holds equally for specs, ADRs, the user's
statements, and the model's own recommendations. Objectives, trade-off preferences, and policy
settle by conversation with their owner; current-state claims, causal claims, and feasibility
settle only at the real boundary.
