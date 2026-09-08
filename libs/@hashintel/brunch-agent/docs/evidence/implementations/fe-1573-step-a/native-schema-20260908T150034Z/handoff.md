# Native schema repair handoff

**The bounded candidate passes over isolated copies of the installed dependencies.** The next choice is how to deliver a known repair, not whether to keep building the converter. Full evidence, commands, affected consumers and limitations: [native-schema-boundary.md](native-schema-boundary.md).

## What was proved

- Public Flue `defineTool`/`useTool` accepts canonical Zod through its native Standard Schema + Standard JSON Schema interfaces. Native **input** JSON Schema reaches actual Pi Anthropic preparation and SDK serialization unchanged, with strict generation omitted/false.
- `addArc` root constraints/descriptions, canonical transition `$defs`/recursive references, `addScenario` input default optionality and absent empty `required` survive. Canonical `.check` refinements remain runtime checks; nothing claims they became JSON Schema.
- Actual Flue execution receives canonical defaults/transforms, preserves raw history and call/result ids, supports explicit numeric-string normalization, refuses invalid controls, honors hook blocking/termination and suppresses a late successful validation after cancellation. The correlated client-result signal resumes without re-execution; this is not a browser witness.

## Three dependency targets are required

1. **Flue 2.0.3:** native input schema/validator carriage and type inference, explicit `prepareArguments` normalization, and live/durable consumer joins. Core-owned Valibot contracts remain unchanged.
2. **Pi AI 0.83.0:** preserve supplied Anthropic tool parameters independently of strict mode.
3. **Pi Agent Core 0.83.0:** authoritative per-tool validation callback before `beforeToolCall`. Without this third repair, generic JSON-Schema coercion turns raw `weight: true` into `1` before Zod sees it. The retained two-boundary candidate fails the safety gate. A skip-validation flag would wrongly give the hook raw input labelled validated; the tested callback returns parsed data once instead.

`candidate.patch` / `candidate-edits.json` contain exact copied-package source/types/docs/manifest deltas. `pi-source-candidate.patch` recovers equivalent Pi TypeScript from installed source maps. These are probe candidates, not maintained dependency patches or upstream contributions.

## Verification and remaining choice

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-schema-20260908T150034Z
node "$E/reproduce.mjs" candidate
node "$E/safety-gate.mjs" candidate
```

Pass: **19 named runtime/method observations**, strict consumer typecheck, type-aware lint, **11/11 unchanged admission tests**, schema/SDK captures across both provider methods with generation constraints off, and protected installed/source hash checks. Baseline, Flue-only and two-boundary claim gates remain reproducibly red for distinct reasons. Scratch copies are removed after each run.

**Owner choice:** pursue upstream releases for the three targets, or authorize bounded pinned maintained patches with explicit Standard Schema type-dependency wiring. The candidate executes installed bundles and published declarations; Flue source is not shipped in the installed package, and no full upstream source build was performed. Upstream builds, product native mounting, actual browser integration and real-provider acceptance remain unproved.

Authority was cherry-picked as **`6c599c87fc`** from `2aabffbd27fa3f01913f40ab4bc45074ba50971a`. No product source, canonical schemas, shared installed dependencies, lockfile, ledger or prior accounting evidence changed. **Zero external requests, paid calls or spend. No strict-mode workaround, converter expansion or Step B work.**
