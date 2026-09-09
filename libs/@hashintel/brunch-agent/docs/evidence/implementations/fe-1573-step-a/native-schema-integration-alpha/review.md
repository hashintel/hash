# Native-schema repair candidate — integration review

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

The integration owner reviewed the three-package candidate diff and handoff in worker commit `dd79496585b0af71b5fa1a19de931f561fb137a9`, then cherry-picked that evidence-only commit as `bd5ca43326`. The worker's duplicate authority cherry-pick `6c599c87fc` was not integrated. No candidate patch was applied to installed dependencies or HASH production code.

The review checked native input export/default optionality, executable refinements, validation ownership before hooks, explicit normalization, parsed-output typing, raw history/call identity, cancellation and the unchanged generic/Valibot route. The source-map patch is a review companion, not a dependency source-build result. The candidate changes published runtime/type/docs surfaces; it is not merely a serializer substitution.

## Reproduction

To avoid rewriting retained evidence, the integration owner copied the complete evidence directory to `/tmp/m7-native-review.rlWMoi/evidence` and invoked the unchanged reproduction scripts from the clean provider worktree at `dd79496585`. That worktree still matches the instrument's protected source and lockfile pins. Alpha's new browser dev dependency has a different lockfile; no old pin was regenerated or weakened to make a replay pass there. The reproduction copies installed packages into fresh scratch directories, patches only those copies, verifies the original pins again and removes its own scratch copies.

```sh
# cwd: /Users/lunelson/.herdr/worktrees/hash/m7-provider-boundary
node /tmp/m7-native-review.rlWMoi/evidence/reproduce.mjs baseline
node /tmp/m7-native-review.rlWMoi/evidence/safety-gate.mjs baseline
node /tmp/m7-native-review.rlWMoi/evidence/reproduce.mjs flue-only
node /tmp/m7-native-review.rlWMoi/evidence/safety-gate.mjs flue-only
node /tmp/m7-native-review.rlWMoi/evidence/reproduce.mjs two-boundary
node /tmp/m7-native-review.rlWMoi/evidence/safety-gate.mjs two-boundary
node /tmp/m7-native-review.rlWMoi/evidence/reproduce.mjs candidate
node /tmp/m7-native-review.rlWMoi/evidence/safety-gate.mjs candidate
```

All four reproduction commands exited 0 because they assert their named positive/negative observations. The distinct claim gates exited **1, 1, 1, 0**, respectively. Baseline refuses native declaration; Flue-only loses provider schema; two-boundary preserves schema but coerces raw boolean weight to a number; the complete candidate preserves carriage and rejects that input before execution. The candidate replay reports 19 named runtime/method observations, successful strict consumer typechecking and type-aware lint, and **11/11 unchanged admission tests**. Network attempts: zero. Synthetic local SDK/SSE invocations: 26. The mixed-proposal failure stack is an asserted refusal control, not an unhandled failure. `replay.json` records exits and script hashes; logs are retained losslessly beside it. The original worker worktree remained clean.

## Accepted scope and implications

Accepted as bounded local feasibility evidence: Flue can carry a native Standard Schema validator paired with its native Standard JSON Schema input export; Pi AI can preserve the supplied Anthropic schema independently of strict generation; Pi Agent Core can run authoritative per-tool validation before hooks without earlier generic coercion. Ordinary generic validation stays unchanged. Runtime refinements remain executable validation, not invented JSON Schema coverage.

Not accepted as a shipped dependency or final Mission schema path: no full upstream source build, maintained package-manager patch installation, explicit type-dependency resolution, native ChatAgent/basis composition, native browser replay, real-provider schema acceptance or billing readiness has been proved. The separate browser witness uses the interim carrier. Native mounting must preserve that witness's new validation/publication and record/result contracts.

Lu ruled upstream work out after this review and requested the best local solution. The delivery authorization belongs in the separately committed Mission reconciliation: pinned local Yarn patches plus explicit Standard Schema type-dependency wiring, followed by the real native product join and regression gates. This review does not itself amend execution authority. Paid accounting and A4 retained-record work remain independent, and no paid call or Step B acceptance follows.
