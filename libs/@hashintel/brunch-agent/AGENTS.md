# Brunch agent

Brunch is the elicitation harness and package family at `libs/@hashintel/brunch-agent`. This
directory is its context root, not a package workspace. HASH root guidance wins where it differs
from this file.

## The three laws

1. **Dumbest real implementation first.** Cross the real production boundary end-to-end before
   improving anything: use the real entrypoint and wiring, inline what can stay local, and pin
   only the invariants and constraints the working path actually exposes. Then re-decide at the
   new fog-line instead of running an inherited plan.
2. **Deepen only under observed strain.** An intended design is a hypothesis, not a destination.
   Admit the next piece of complexity when the current implementation strains under a present
   requirement (duplication diverging, a boundary leaking, an invariant that will not hold
   locally), and cut the design when the design itself is what is straining progress.
3. **A branch is a mission, not a ticket.** Every mission carries an imperative that guides and
   bounds its work; its evidence-gathering and decisions are judged against that imperative, not
   against a plan graph.

## Mission contract

When work starts on a branch, state these six things in [`MISSION.md`](MISSION.md) and copy them
into the branch/PR description. Do not create additional planning or control documents.

- **Imperative** — what must become true, and why now.
- **Throughline** — the real entrypoint or boundary being changed.
- **Proof** — the observable evidence that would establish progress.
- **Constraints** — the few already-earned truths that must stay true.
- **Fog-line** — what is unknown and must not be designed past.
- **Stop or reorient** — evidence that invalidates or changes the route.

## Correctives

- Before adding structure, name the production pressure that requires it.
- Work the first unproven boundary; do not build toward the imagined end.
- Real entrypoint or it did not happen; a proof is legible when a human can watch it and decide.
- A ticket is a projection; the mission is the authority. If the ticket stops serving the
  imperative, stop and surface the divergence instead of finishing the ticket.
- When evidence changes the route, stop; do not finish the planned neighbourhood.
- When unsure, build the smallest real path that reveals more.
- When things accumulate, subtract before you extend.
- No imperative and proof means it is not a mission yet — do not start it.

## Retained facts

- **Toolchain:** format TS/JSON with root `oxfmt`; lint via `lint:eslint` (Oxlint) and
  `lint:tsc` (`tsgo --noEmit`); unit tests via `vitest run`; build with Vite 8. Run tasks through
  the HASH root Yarn/Turbo workspace — add no `package.json` or lockfile here.
- **Git vs Graphite:** plain `git` for status/diff/add/commit; `gt` for
  `create`/`submit`/`restack`/`sync`/`checkout`. Never `gh stack`. Before switching the branch of
  a shared worktree, check for in-flight work; use a separate worktree rather than stashing,
  resetting, or cleaning anything you did not create.
- **Linear:** team `FE`, project `brunch-agent`. Reading is fine; get explicit approval before
  any write (create, edit, comment, state change).
- **Topology gates** (enforced by tests): plugins never import
  `@hashintel/brunch-agent/prompts`; transport packages never depend on a binding; bindings
  depend inward on core; plugins depend only on core. Evaluation answer keys stay on the
  evaluation side, never inside interviewee or elicitor inputs.
- **Posture:** prototype · stakes high — persisted capture data and merge gates must fail loudly,
  never corrupt silently · horizon: current milestone.
- **Flue design moments:** see
  [`docs/reference/architecture/flue-routing.md`](docs/reference/architecture/flue-routing.md).

## Authorities vs obligations

[`docs/specs/`](docs/specs), [`docs/adr/`](docs/adr) (see its [README](docs/adr/README.md)), and
[`docs/evidence/`](docs/evidence) are history and reference: prior design hypotheses and observed
results. They are not marching orders. Re-earn any design you build to; an implemented decision is
evidence, unimplemented design is a hypothesis. A branch may depart from a recorded decision by
noting the divergence in its commit.
