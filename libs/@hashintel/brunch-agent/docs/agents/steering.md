# Strategic steering: orient, choose, execute, reconcile, replan

Use this protocol to keep Brunch aimed at a current, falsifiable proof rather than at whatever
issue happens to be available. The arc driver owns trigger evaluation. Current truth lives in
`STEERING`, which references governing `STRATEGY-LOG` IDs; this document owns only the control loop.

Run a steering pass when:

- work starts or resumes without a current proof target;
- the objective, deadline, use case, or pressure changes;
- a proof succeeds or fails;
- authorities conflict;
- an external gate changes or becomes stale;
- the selected frontier loses value;
- a frontier's durable outputs are all desk, simulated, or evaluation-side, with no production-path
  code changed by the end of one arc (proxy completion); or
- arc close detects strategic drift.

Ordinary ticket movement is not a steering trigger. Proxy completion recurs under new names — a
tracer, a desk rehearsal, a preregistered instrument each stood in for the thing it was meant to
exercise and became the definition of done. An evaluation instrument larger than the thing it
evaluates is itself the finding.

## Orient

Classify every load-bearing input as one of:

- **fact**;
- **belief** with confidence and cited evidence;
- **unknown** with its cheapest probe; or
- **external gate** with owner, source, watch trigger, last-checked date, and consequences.

Do not turn confidence into fact. A confidence change cites the evidence that changed it.

## Choose

Treat the mechanical frontier (open, unblocked issues) as a filter, not a priority rule. Rank
eligible moves by objective contribution, risk retired, information gain,
deadline pressure, and cost/reversibility.

Select one proof frontier, or a deliberate pair whose join is named. Record:

- **claim** — the proposition this frontier can validate;
- **proof bundle** — the fields below;
- **cut** — work explicitly excluded before the proof;
- **issue/gap projection** — existing issues and uncovered work needed to execute it; and
- **stop/replan trigger** — the observation that ends or redirects the attempt.

An ordered frontier is an epistemic strategy, not a queue of tasks. Before dispatch, each step
names the evidence it consumes, the claim it can establish, and the later decision or proof it
informs; a terminal step records `none`. Do not dispatch a successor merely because the preceding
issue moved: first pass the independent review gate in [legibility](legibility.md), reconcile what
the result changed in current truth and confidence, and prepare the successor's dispatch brief from
that result. Deposit any durable change in its owning authority before launch; a dispatch brief is
not a substitute authority. Parallelize steps only after recording why neither step's scope or
interpretation depends on the other's findings and defining the claim and inputs at their join.

## Execute

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

## Reconcile

Deposit each changed truth into exactly one authority and link to it elsewhere:

| Truth | Authority |
| --- | --- |
| Current objective, proof frontier, soft edges, cuts, beliefs, gates, and exceptional roots | `STEERING` |
| Material strategic decision rationale | append-only `STRATEGY-LOG` |
| Issue state, hierarchy, and hard blockers | Linear |
| Required behavior | `docs/specs/` |
| Accepted decisions | `docs/adr/` |
| Observed proof and witness snapshots | `docs/evidence/proofs/` |
| Evaluation runs and readouts | `docs/evidence/evaluations/` |
| Stable explanation and source material | `docs/reference/` |
| Superseded or settled historical context | `docs/archive/` |

Linear writes require explicit approval before creation or mutation. Link; do not copy history or
evidence into mutable controls. Follow [documentation](documentation.md) for placement and
promotion, [legibility](legibility.md) for the second-register read,
[issue-tracker](issue-tracker.md) for tracker mechanics, and [arc-close](arc-close.md) for the
closing control pass.

## Replan

If a trigger fired, return to orient and choose. Otherwise continue the selected frontier; do not
replan merely because ticket state moved.

Append IDs monotonically. A conflicting decision names the governing ID it supersedes; a
complementary decision uses `none`. Only unsuperseded governing IDs remain in `STEERING`. A no-op
writes nothing.

The pass is complete when inputs are classified, one frontier (or named pair) has all choice
fields, its proof bundle is runnable and indexed, every changed truth has exactly one authority,
confidence changes cite evidence, and the next stop/replan trigger is explicit.
