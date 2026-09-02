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

### Throughline proof, readiness gate, and stratum closure

- **Throughline proof** is the smallest deployed end-to-end path showing that a capability crosses the real product boundary.
- **Readiness gate** is the decision after that path works: enumerate the lateral obligations now exposed, decide which are required to trust the current visible capability, and identify which first become load-bearing for the next visible product advance.
- **Stratum closure** completes breadth, fidelity, invalid-state, durability, identity, failure, and oracle obligations across one named contract layer and accepted scenario or peer set.

A vertical tracer does not automatically require horizontal completion. Close an obligation now when the current visible claim would otherwise be false or unsafe. Carry it only when the next visible product mission is its first real consumer, and name that owner, re-entry gate, and oracle; “later” is not a disposition.

Use the recursive operating model:

```text
survey the real territory, not only its maps
→ establish a working line of communication, transport, and evidence
→ stage a dependable camp/base by closing the contract stratum the line has made load-bearing
→ launch the next survey and throughline from that stronger departure point
```

Terrain claims require inspection or probes at the real production or deployed boundary. A working line crosses entry to visible exit with the least mechanism that carries product data, control, evidence, and failure. A dependable base closes only the earned coverage, identity, durability, recovery, observability, and oracle obligations required by accepted consumers. Never silently treat a provisional line as a hardened departure base, and do not fortify every adjacent contract merely because one route exposed it.

This is an expeditionary posture, not a defensive one. Survey only until the next consequential and reversible move is warranted. Once downside is bounded or explicitly accepted, advance; uncertainty is terrain to reduce through action, not a reason to hold position. Stage only the base the next operation needs, not the safest or most complete base imaginable.

### One live mission and bounded planning surfaces

One Linear issue = one Graphite branch = one GitHub PR, and only one live mission may exist on that branch. [`MISSION.md`](MISSION.md) is the sole execution authority; agents and humans implement only against it.

Only three additional planning or control surfaces are permitted:

1. [`MISSION.next.md`](MISSION.next.md), the compact canonical future spine, shared frame, cross-mission constraints, and unallocated-backlog index.
2. Linked provisional drafts under [`docs/mission-drafts/`](docs/mission-drafts/), which preserve detailed cold-start context for named future clusters under the [draft authority and lifecycle rules](docs/mission-drafts/README.md).
3. `SIDE_QUEST.md`, when present, as the one temporary user-authorized experiment or remediation inside the live mission.

`MISSION.next.md` and its linked provisional drafts form the combined future planning record. They are not execution authority, do not create concurrent missions, and must not be implemented before conversion into `MISSION.md`. Give every planning item one authoritative planning home; the compact spine may carry a concise summary and link, but must not duplicate the detailed contract. Keep each hypothesis, observation, accepted decision, rejected alternative and reason, re-entry condition, question, named mechanism, constraint, fog item, stop condition, scenario class, and evidence source at the fidelity needed for a cold-start builder. Do not rely on a transcript as the surviving record.

A side quest is legitimate only when live-mission evidence exposes a bounded set of concrete residual failures whose investigation helps close that mission or informs named future clusters. It must state its relationship to the live mission, imperative, throughlines, oracle-bound proof, constraints, stop conditions, and budget for each paid activity. It must not supersede or contradict `MISSION.md`, broaden into speculative future work, create a second live mission, or coexist with another active side quest. Record its outcome in affected future-planning homes and in any mission evidence it produced, then remove the active file before archiving the mission. A documentation-only remediation that produces no separate implementation or evaluation evidence records its oracle-bound close audit in the canonical future-planning record rather than inventing another evidence document.

### Conversion and lifecycle

Promotion is re-evaluation and conversion, never a rename or wholesale promotion. The ordered conversion and archival procedure lives in [`docs/mission-drafts/README.md`](docs/mission-drafts/README.md#lifecycle).

The always-loaded invariants are: keep exactly one live mission; return every item omitted from a cut to the combined future planning record at full fidelity; remove the consumed draft so it cannot remain duplicate quasi-authority; and compare every affected planning file before and after with no unexplained loss or duplication. A current mission's **Deferred** items belong in that record and must not be silently dropped or superseded.

## Correctives

- Before adding structure, name the production pressure that requires it.
- Work the first unproven boundary; do not build toward the imagined end.
- Real entrypoint or it did not happen; a proof is legible when a human can watch it and decide.
- A ticket is a projection; the mission is the authority. If the ticket stops serving the
  imperative, stop and surface the divergence instead of finishing the ticket.
- When evidence changes the route, stop; do not finish the planned neighbourhood.
- When things accumulate, subtract before you extend.
- No imperative and proof means it is not a mission yet — do not start it.
- Censor noise; keep consequential doubt visible.
- Checking is proportional to consequence and reversibility. Within that budget, a commitment is
  warranted when the premises it depends on are either observed at the real boundary or
  explicitly accepted as risk.
- Low confidence must change the next move — build the smallest real path that reveals more,
  inspect, choose the reversible option, or flag it — or go unsaid.
- At close, update the PR description: what each proof item established, the observed answer to
  each fog-line question, and the flags that carry into the next mission. Archive the closed
  `MISSION.md` as above; the PR description remains the GitHub-facing close report.

## Retained facts

- **Toolchain:** format TS/JSON with root `oxfmt`; lint via `lint:eslint` (Oxlint) and
  `lint:tsc` (`tsgo --noEmit`); unit tests via `vitest run`; build with Vite 8. Run tasks through
  the HASH root Yarn/Turbo workspace — add no `package.json` or lockfile here.
- **Issue, branch, and PR lifecycle:** one Linear issue = one Graphite branch = one GitHub PR; the
  branch mission remains the execution authority. Follow
  [`docs/agents/git-workflow.md`](docs/agents/git-workflow.md) when creating, restacking, or
  submitting a branch or connecting it to an issue or PR.
- **Linear project posture:** Brunch issues live on team `FE`, project `brunch-agent`, whose mixed
  inherited issue history is evidence and inbox rather than an authoritative plan. Follow
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) before creating, reusing, relating,
  or changing an issue. Reading is fine; get explicit approval before every Linear write.
- **Linear and GitHub writing:** follow
  [`docs/agents/issue-writing.md`](docs/agents/issue-writing.md) whenever creating or editing an
  issue, pull request, or comment.
- **Plugin scope:** each plugin pairs one reusable domain typology with one target formalism; it may name concepts from that typology but never facts or nouns from a concrete domain, organization, situation, or scenario.
- **Topology gates** (enforced by tests): core and plugins may expose Flue-native production resources through dedicated `./flue` subpaths; plugins depend inward on core, never bindings, and never import `@hashintel/brunch-agent/prompts`; transport packages never depend on a binding; bindings translate generalized capture machinery into the selected substrate. Evaluation answer keys stay on the evaluation side, never inside interviewee or elicitor inputs.
- **Posture:** prototype · stakes high — persisted capture data and merge gates must fail loudly,
  never corrupt silently · horizon: current milestone.
- **Flue:** when adding state, a loop, a route, or a test harness, consult
  [`docs/reference/architecture/flue-routing.md`](docs/reference/architecture/flue-routing.md)
  before inventing a parallel mechanism.

## Authorities vs obligations

[`docs/specs/`](docs/specs), [`docs/adr/`](docs/adr) (see its [README](docs/adr/README.md)), and
[`docs/evidence/`](docs/evidence) are history and reference: prior design hypotheses and observed
results. They are not marching orders. Re-earn any design you build to; an implemented decision is
evidence, unimplemented design is a hypothesis. A branch may depart from a recorded decision by
noting the divergence in its commit. Provenance is not warrant: a statement is evidence of what
was said, not automatically of the terrain. This holds equally for specs, ADRs, the user's
statements, and the model's own recommendations. Objectives, trade-off preferences, and policy
settle by conversation with their owner; current-state claims, causal claims, and feasibility
settle only at the real boundary.
