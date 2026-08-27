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

When work starts on a branch, state these six things in [`MISSION.md`](MISSION.md) and copy them
into the branch/PR description. Do not create additional planning or control documents.

- **Imperative** — what must become true, and why now.
- **Throughline** — the real entrypoint or boundary being changed.
- **Proof** — the observable evidence that would establish progress, and the claim it does not
  make. A path, a connected skeleton, and a discharged contract are different completions.
- **Constraints** — the few already-earned truths that must stay true.
- **Fog-line** — uncertainty that current evidence cannot yet decide between consequential
  alternatives, and must not be designed past. Clarifying intent is not clearing terrain. Capture
  unresolved flags here: why they matter, what they constrain, and what would re-enter them.
  Running the path may lengthen this list; that is calibration, not regression.
- **Stop or reorient** — evidence that invalidates or changes the route.

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
  each fog-line question, and the flags that carry into the next mission. The PR description is
  the only record that survives the squash.

## Retained facts

- **Toolchain:** format TS/JSON with root `oxfmt`; lint via `lint:eslint` (Oxlint) and
  `lint:tsc` (`tsgo --noEmit`); unit tests via `vitest run`; build with Vite 8. Run tasks through
  the HASH root Yarn/Turbo workspace — add no `package.json` or lockfile here.
- **Git vs Graphite:** plain `git` for status/diff/add/commit; `gt` for
  `create`/`submit`/`restack`/`sync`/`checkout`. Never `gh stack`. Before switching the branch of
  a shared worktree, check for in-flight work; use a separate worktree rather than stashing,
  resetting, or cleaning anything you did not create.
- **Linear and GitHub records:** follow
  [`docs/agents/issue-writing.md`](docs/agents/issue-writing.md) whenever creating or editing an
  issue, pull request, or comment. Linear uses team `FE`, project `brunch-agent`; reading is fine,
  but get explicit approval before any Linear write (create, edit, comment, state change).
- **Topology gates** (enforced by tests): plugins never import
  `@hashintel/brunch-agent/prompts`; transport packages never depend on a binding; bindings
  depend inward on core; plugins depend only on core. Evaluation answer keys stay on the
  evaluation side, never inside interviewee or elicitor inputs.
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
