# Close the same aggregate boundary for existing node queries

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

During landing review of typed correction `87beb4c654`, the integration owner traced the shared `explainRootArc` selector beyond the new state-kind allowlist. Existing `locateRootNode` also accepts ordinary `inputArcs` and `outputArcs` fields. They have the same descendant-selection obligation; the typed-only guard leaves that root cause open for already-mounted transition queries.

## Actual discriminator

`/tmp/m7-landing-20260909T055346Z/root-aggregate.mjs` runs production `parseConstructionWhyInput` and `explainRootArc` against the untouched, previously retained actual Chrome `root-creation-post-capacity/browser-final/history.json.gz`, using that run's actual current workpiece and binding. No state import, new history, invented transition or fabricated result is involved. It is a captured-reachable-state product-function test, not a new HTTP/Chrome run.

At typed correction `87beb4c654`, both `Test operation / inputArcs` and `/ outputArcs` return current nonempty arrays with `partially-supported` disposition and governing `creation-step`, whose actual request created both arrays empty. Later actual `creation-input` and `creation-output` calls supplied the contents. The scalar `lambdaCode` control correctly selects `creation-pause`. The aggregate safety assertion exits **1**; raw script/log/results/exit are retained in the landing evidence.

## Bounded disposition

This is the same confirmed selector defect, not a new operation-class campaign. Apply the conservative aggregate guard at its shared root to the existing node and state query kinds, rather than only the three new state kinds. Preserve scalar leaf answers, exact reconciliation and distinct origin/applied history; refuse a whole aggregate instead of inventing a composed basis. Do not widen tool mounting, mutation behavior or schemas, and do not create a provenance engine. Re-run both the original typed discriminator and this node discriminator, add the captured-state regression, and run the combined current product checks before crediting the landing.

**Closed in ALPHA `b522c0d73b`.** The unchanged captured-state discriminator now exits 0. The actual root Chrome witness additionally asks both arc-array queries through mounted `brunch_why` and asserts refusal, absent governing basis/change and retained creation origin; scalar capacity/code positives and reopen remain green (52 synthetic requests, 38 outside-counted callbacks). The combined portfolio passes 66/66 tasks / 3,282 tests. See `integration.md` and the hash-bound verification artifacts.

Earlier root leaf-field proofs remain evidence for their exact queries; they did not cover aggregate arc-array attribution. The fix may honestly refuse additional composite/entity queries. That improves safety, not ordinary useful explanation coverage, and its utility consequence remains in the mission-health assessment.
