# Brunch steering supplement

The `ds-steering` judgment and user-invoked `/ds-steer` procedure own orientation, strategic
reconciliation, proof-frontier choice, minimal control updates, and completion. This supplement
adds only Brunch-specific triggers, metadata, tie-breaking, and execution guidance. `AGENTS.md`
routes steering passes here through `/ds-steer`.

## Triggers

The arc driver evaluates steering triggers. Invoke `/ds-steer` when:

- work starts or resumes without a current proof target;
- the objective, deadline, use case, or pressure changes;
- a proof succeeds or fails;
- authorities conflict;
- an external gate changes or becomes stale;
- the selected frontier loses value;
- a frontier's durable outputs are all desk, simulated, or evaluation-side, with no production-path
  code changed by the end of one arc (**proxy completion**); or
- arc close detects strategic drift.

Ordinary ticket movement is not a steering trigger. Proxy completion recurs under new names — a
tracer, a desk rehearsal, and a preregistered instrument each stood in for the thing it was meant
to exercise and became the definition of done. An evaluation instrument larger than the thing it
evaluates is itself the finding.

## Brunch control fields

External gates in `docs/control/STEERING.md` carry **owner**, **source**, **watch trigger**,
**last-checked date**, and **consequence**. After the skills' posture-aware frontier ranking and
canonical tie-breakers, use **deadline pressure** as Brunch's final tie-breaker.

Linear writes require explicit approval before creation or mutation.

## Parallel partition (Brunch extension of `/ds-steer` step 5)

`ds-steer` selects one proof frontier and leaves other available work as "separate work". Brunch
adds a partition step after that choice, because slicing a plan into efforts that run in separate
worktrees is a planning move this context must be able to make. The single frontier stays; the
partition says what else runs concurrently and how it rejoins.

An **effort** is worktree-separable when it has its own proof (or a named share of a joint proof),
its own projection, and a **write set** disjoint from every other effort's except at named **join
points**. For each effort record: proof, projection, write set, join points and who lands first,
and the base it is cut from. Rules:

- Control documents (`STEERING`, the ledger, the strategy log, `INDEX`, `CONTEXT`) and Linear are
  written only from the **driver** worktree. Efforts deposit through issue comments, commit and PR
  bodies, and evidence under their own path; the driver reconciles at each landing through
  `/ds-steer` (Reconcile). Every other file an effort would share with another effort is a join
  point to name, and shared manifests (`package.json`, `yarn.lock`, Turbo and compose config) are
  join points by default.
- Joined moves (one proof) may be built in separate worktrees; none is done until the joint proof
  runs from one branch that contains them all.
- Cut effort branches from `main` once the pending stack has merged; until then cut from the
  driver branch and rebase at merge. Use Graphite for the stacks.
- Record the partition in `STEERING.md` as a table and revise it at every steering pass; an effort
  that has no proof of its own and no share of a joint proof is not an effort but a task inside one.

## Guidance for procedures that execute the frontier

This section governs the procedure `/ds-steer` selects; `/ds-steer` does not execute the frontier.

Exercise real production entrypoints and wiring. A fixture may supply domain inputs, but it must
not supply product wiring absent from the product. Require both a runnable proof and an immutable
legibility snapshot in another register. UX, interpretation, live-runtime, and demo-comprehension
claims require a human witness unless the claim explicitly records why witness is inapplicable.

The evidence lifecycle is:

```text
corpus/case -> reviewed fixture -> production-path run -> immutable run snapshot
            -> validated claim -> executable oracle
```

Maintain the information wall: hidden answer keys and oracles are evaluation-side material, never
inputs to the interviewee or elicitor under evaluation.

### Proof-bundle fields

- claim and bounded scenario;
- production entrypoint and wiring exercised;
- reviewed fixture and provenance;
- runnable command or procedure and result;
- immutable run snapshot path;
- legibility snapshot path and register;
- witness record, or explicit inapplicability;
- observed failures and residual uncertainty;
- validated, rejected, or narrowed claim;
- oracle candidate and promotion decision; and
- successor decisions or dispatch briefs changed by the result, or `none`.

At selection time, initialize the prospective fields. After independent review, finalize the
result-dependent fields and deposit changed truth in the owning authorities before dispatching a
successor.
