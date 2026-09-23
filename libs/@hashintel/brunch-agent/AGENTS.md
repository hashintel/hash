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

The six sections are the live mission contract. Above them, **Status** states live/accepted, the established base, the current blocker, and the next authorized observation or decision with its owner and discriminator. Below them, **Deferred** points to the future planning record. The full Throughline describes the acceptance path; Status selects the next move.

Keep each proof obligation's current disposition beside it, with an evidence pointer and any remaining limitation. Distinguish coverage present, reported verification and accepted proof; expected failures are unmet obligations. Refresh Status and dispositions when evidence or owner direction changes the next move. Replace prior state rather than appending chronology; detailed results belong in the PR and native records.

Preserve precision that changes behavior, scope, proof, risk or handoff. Put exact cold-start inputs and boundary pointers under Throughline; place other detail under its owning contract section. Omit unearned template sections and repeated rationale.

Every final proof leaf in a live mission or side quest must name a credible oracle: an exact test or command, fixture, artifact inspection, human witness, or adjudication that can distinguish the claimed result from mere presence. A provisional mission draft may instead mark `ORACLE GAP` and state what must resolve it, but that gap must close before the draft is cut with that leaf as a claim.

### Mission, current throughline, and delegated work

**Decompose the territory broadly; authorize execution narrowly. A responsibility map is not a completion schedule.**

- **Mission** holds the imperative and acceptance bar across many tasks. Acceptance obligations are not automatically prerequisites to the first informative use.
- **Current throughline** is the next decision-changing product observation, selected in Status. Attempt it with the existing system before building capability.
- **Delegated work** discharges its concrete dependencies. Name the consumer or observed failure, bounded change/probe, discriminator and return condition. Parallelize independent dependencies of that observation, not subsystem completion.

Before dispatch and again at integration, answer: **What next observation becomes possible through this task, and why can't the current system produce it?** Re-decide from the result rather than automatically launching a successor task.

Use the real product boundary for terrain claims. Close an obligation now if it blocks the next observation or makes the visible claim false or unsafe; otherwise carry its limitation, consumer, re-entry trigger and discriminator. That consumer may be later in the same mission.

Broader contract closure requires an identified consumer; a provisional path is not a hardened base. Once downside is bounded or explicitly accepted, advance with the base the next operation needs.

### One live mission and bounded planning surfaces

One Linear issue = one Git branch = one GitHub PR, and only one live mission may exist on that branch. [`MISSION.md`](MISSION.md) is the sole execution authority; agents and humans implement only against it.

Only three additional planning or control surfaces are permitted:

1. [`MISSION.next.md`](MISSION.next.md), the compact canonical future spine, shared frame, cross-mission constraints, and unallocated-backlog index.
2. Linked provisional drafts under [`docs/mission-drafts/`](docs/mission-drafts/), which preserve detailed cold-start context for named future clusters under the [draft authority and lifecycle rules](docs/mission-drafts/README.md).
3. `SIDE_QUEST.md`, when present, as the one temporary user-authorized experiment or remediation inside the live mission.

`MISSION.next.md` and its linked drafts form the future planning record, not execution authority. Give each item one home with its binding meaning, rationale, evidence and re-entry condition intact. The spine links to detail; it does not restate live scope or progress. A transcript alone is not a surviving planning home.

A side quest is legitimate only when live-mission evidence exposes a bounded set of concrete residual failures whose investigation helps close that mission or informs named future clusters. It must state its relationship to the live mission, imperative, throughlines, oracle-bound proof, constraints, stop conditions, and budget for each paid activity. It must not supersede or contradict `MISSION.md`, broaden into speculative future work, create a second live mission, or coexist with another active side quest. Record its outcome in affected future-planning homes, then remove the active file before archiving the mission. A documentation-only remediation records its oracle-bound close audit in the canonical future-planning record rather than inventing an evidence document.

### Conversion and lifecycle

Before cutting, recutting or archiving a mission, follow [`docs/mission-drafts/README.md#lifecycle`](docs/mission-drafts/README.md#lifecycle). It owns conversion, preservation of omitted and Deferred items, duplicate removal and the before/after audit.

### Decision integrity across handoffs

1. **Promote decisions before delegation.** Amend `MISSION.md` when accepted owner direction changes implementation or proof. Keep one dated **Owner decisions** list pointing to the resulting contract, not a second copy of it. Pending choices remain explicit.
2. **Recut before implementation.** Obtain owner acceptance and commit a material authority change separately, before dependent product or evaluation work. Keep recut, implementation, instrument freeze and close distinct.
3. **Preserve handoff authority.** For semantic, architectural, interaction-policy, proof or frozen-instrument translations, name the protected source, production destinations, permitted deltas and unresolved choices. Stop on unlisted semantic deltas. Bounded owner-approved mechanical corrections may be batched.
4. **Keep oracles subordinate.** A checker may falsify a claim, not redefine policy, architecture or interaction semantics. Stricter interpretations require an owner decision; do not rewrite prompts to mirror a checker.
5. **Bound experimental verdicts.** State which decisions evidence may update and which remain owner-held. Mechanism failure does not select a replacement architecture.
6. **Preserve binding rationale before disposal.** Move a surviving decision's only explanation from a workbench or draft into `MISSION.md` or an ADR; discard superseded material rather than copying it forward.
7. **Keep current state, not chronology.** Replace consumed authorizations with the consuming commit and any continuing restriction. Keep detailed results in the PR/native records under [evidence retention](docs/evidence/README.md).
8. **Close by external acceptance.** For owner-reserved closure, witness acceptance, handoff selection or paid ceilings, prepare the packet and stop until the owner performs the gate.

Consult the [Mission 4 handoff analysis](docs/evidence/design/mission-4-handoff-failure-analysis-2026-09-02.md) when the rationale for these protections matters. Delegated results return in chat or the PR, not new documentation packets.

## Correctives

- **Safeguards must earn their friction.** Before adding, preserving, or adapting product behaviour around a limit, gate, or refusal, run the least guarded/unguarded contrast the real boundary permits and identify the observed failure, external constraint, or owner requirement it protects. Inherited code, a safety label, and passing enforcement tests prove enforcement—not necessity or reasonable scope. When a safeguard blocks real use, test whether the platform now carries the obligation, then remove or narrow the safeguard; retain it only at the smallest boundary that prevents the evidenced failure.
- **Reorient on evidence.** If a ticket or planned task stops serving the imperative, surface the divergence rather than finish it. Start only with an imperative and proof; subtract accumulated mechanism before extending it.
- **Verify proportionally.** Use the narrowest falsifying check, the actual product boundary for integration claims and affected package checks before integrating code. Reuse earned regression tests; documentation and handoff work alone do not require a new browser/crash campaign. Commit when premises are observed or explicitly accepted as risk.
- **Act on uncertainty.** Inspect, attempt the smallest revealing path, choose a reversible option or flag consequential doubt; otherwise omit low-confidence commentary.
- **Close legibly.** Update the PR with each proof result, answers to fog questions and carried flags, then archive under the lifecycle rules. The PR remains the GitHub-facing close report.

## Development and evaluation execution

Ordinary dependency installation, builds and documentation research may use the network with repository tooling and pinned dependencies; a missing cache is not by itself an AFK blocker. This permits neither unrelated upgrades nor sending private material to external services. Synthetic tests must remain synthetic and must not fall through to live providers.

Before hermetic proofs, provider authentication checks or paid evaluations, read [evaluation execution safety](evaluations/README.md#execution-safety). Isolation follows the proof claim, not all development. Missions specify exceptions and concrete run limits; they need not reauthorize this default, and these standing rules grant no paid allocation or waiver of an existing stop.

### Test oracle ownership

Add or retain a unit test only when it is the narrowest credible oracle for a runtime, package-boundary, or deterministic structural regression that typecheck, build, lint, or evaluation would not report more directly. Name the artifact or current consumer whose failure the test owns.

- Put assignability and rejected-call contracts in non-Vitest `test/types/` fixtures, with allowed controls beside `@ts-expect-error` cases; `lint:tsc` owns those claims.
- Prompt and skill tests may protect deterministic packaging, reference integrity, machine-consumed identifiers or grammar, reusable-content exclusions, and justified size bounds. Positive inventories of headings, phrases, or teaching prose do not establish agent behavior; use the real product boundary or an evaluation for that claim.
- Do not test repository presence, non-emptiness, source-barrel inventories, or deliberately unmounted stubs unless a named consumer requires the exact artifact or inventory. Check public surfaces through the declared package import, then run the owning typecheck and build.
- Give each generated-schema artifact or family one comparison owner. Keep materially different boundaries and concrete parsing, defaulting, normalization, and refusal behavior covered, but do not repeat the same schema fact at several internal layers.
- Suspended behavior earns an export and regression test only while a named repository consumer or private-package contract depends on it. Confirm ownership with a repository-wide usage search and affected package checks; directory placement alone neither requires coverage nor proves safe deletion.

### Run directories

Before retaining run output, preparing a handoff or wrapping a run, read [run-directory retention](docs/evidence/README.md#run-directories). It owns native records, the single current handoff and local-only evidence treatment.

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
- **Stable documentation references:** do not put exact Git commit hashes in live documentation,
  skills, mission files, reference guides or planning records. Rebases and squash merges make
  those references stale or unreachable. Use durable PR or issue links, named tags, current file
  paths, or dated retained artifacts instead. Historical evidence and archive records may retain
  an exact hash when it is part of the event or artifact provenance they record, but that hash is
  never live authority.
- **Plugin scope:** each plugin pairs one reusable domain typology with one target formalism; it may name concepts from that typology but never facts or nouns from a concrete domain, organization, situation, or scenario.
- **Plugin freshness:** after core guidance changes, re-read roughed-in plugins before treating them as seam evidence. Classify each divergence as lag (realign) or intent (record why), and record the review outcome in the owning PR rather than a commit marker in the plugin. Coordinate in-progress packages with their assigned owner rather than editing across ownership.
- **Topology gates** (enforced by tests): core and plugins expose Flue-native production resources through dedicated `./flue` subpaths; plugins and transport packages depend only inward on core, never on one another or an application; core depends on no sibling package; production source never imports test code. Evaluation answer keys stay on the evaluation side, never inside interviewee or elicitor inputs.
- **Posture:** prototype · stakes high — persisted conversation data and merge gates must fail loudly,
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
