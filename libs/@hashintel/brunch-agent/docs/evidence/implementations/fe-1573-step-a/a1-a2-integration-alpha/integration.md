# Mission 7 A1/A2 integration — alpha

## Integrated result

A1 remaining-carrier feasibility and A2 buffered production admission were integrated onto `ln/fe-1573-construct-and-explain` without conflict. The tested source head is recorded in `source.txt`.

| Contract | Integrated status | Limit |
| --- | --- | --- |
| Whole-proposal admission | **Pass for the owner-authorized buffered policy.** All 11 mounted mixed browser/server permutations reject before tool-input publication or sibling execution. The unchanged ordinary mixed-batch oracle passes. Independently admitted browser work waits for its correlated result before continuation. | Buffered valid output is delayed; invalid mixed submissions fail visibly without automatic repair. Invalid multi-browser and recovered in-flight cases remain unproved. |
| Cancellation and Voice | **Pass at the tested built production/runtime and Voice-consumer boundaries.** Active Stop aborts buffering; late output and rejected/tool payload content do not reach the tested speech path; approved prose and markers do. | No microphone, audible-provider or actual-browser witness. The accepted Mission 6b limitations remain unchanged. |
| Canonical carrier feasibility | **Partial across the required 27-operation envelope.** Seventeen operations match locally, six differ only by absent versus empty `required`, and four fail closed. Root `addArc` passes local structure, normalization and A3 root-place handle compatibility. | Production still selects the structural carrier only for `addType`. No new provider class proof or catalogue admission. Transitions require recursive schema/reference preservation; scenarios require an input/default contract decision. |
| Provider-facing schema fidelity | **Partial / blocker before further paid class proof.** Installed Anthropic conversion preserves nested constraints, root-arc alternatives/constants/bounds and nested strictness. | It drops root `additionalProperties: false`, root descriptions and root `$defs`; recursive references can therefore dangle. Canonical execution validation remains necessary but does not prove the provider received the contract. |
| Settled basis and browser transition | **Not joined.** Existing `WorkpieceRevision` settlement and A3's root-arc record candidate remain separately tested. | Explicit revision id/hash and supersession validation, normalization-before-carrier production selection, issued request/base/incarnation, production browser registration, record carriage and actual browser continuation remain pending. |

No paid provider calls or reservations were made. Shared usage remains 5 calls / US$0.09113535, and the shared ledgers were unchanged. No Step A acceptance or Step B authority follows from this integration.

## Commit integration

A1 source commits `518875fc2c`, `fc3d3c9ccf`, `06a4e20c54` were replayed as `8fd6151685`, `5c4059cdf7`, `4a0a2c8c39`. A2 feasibility/implementation sources `c45c1a67c8`, `5b9c4fbb7c`, `f3b7ad0809`, `bab2256cd4`, `14e4c661bf`, `ed5df1306e` were replayed as `e415219eff`, `f9f27b24a2`, `04567aac33`, `ccba5ec1f8`, `2663bd99f1`, `2e93711b0c`. The worker's duplicate cherry-pick of authority commit `e3a24ee` was deliberately omitted because alpha already contained the original authority-only commit.

The worker handoffs remain authoritative for their retained observations:

- [`../a1-carriers-20260908T121040Z/handoff.md`](../a1-carriers-20260908T121040Z/handoff.md)
- [`../a2-admission-feasibility/handoff.md`](../a2-admission-feasibility/handoff.md)
- [`../a2-buffered-production/handoff.md`](../a2-buffered-production/handoff.md)

Semantic review confirmed that the A1 carrier and A2 admission changes have disjoint production responsibilities. A1 did not change mounting. A2 did not change ChatAgent composition, plugin mounting, settled basis or browser transport/record registration. The affected packages are private; no publishable Petrinaut package source changed in these two chunks, so no changeset is required for this integration.

## Combined verification

From repository root:

```sh
yarn install --immutable
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter=@hashintel/brunch-agent --filter=@hashintel/brunch-agent-plugin-sdcpn --filter=@hashintel/brunch-agent-binding-flue --filter=@hashintel/brunch-agent-transport-aisdk --filter=@apps/brunch-agent --filter=@apps/petrinaut-website --filter=@hashintel/petrinaut --continue=always --force --concurrency=4
yarn workspace @local/petrinaut-arch-docs lint:arch-docs
yarn lint:format
```

Final forced result: **63/63 tasks passed, zero cache hits, 1,487 tests passed**: core 103, plugin 58, binding 20, transport 42, Brunch app 197, Petrinaut 692 and website 375. Builds, typechecks and lints passed; existing warnings remain in untouched code. Architecture passed at 70 layers / 356 edges. Root formatting passed for 5,852 files.

The first forced combined run had 62/63 tasks pass because the unchanged `petrinaut-chat` test exceeded its existing five-second timeout while the heavy portfolio ran concurrently. This exact timeout was already reported by A2. The test passed immediately alone, the complete Brunch app suite passed 197/197, and a second complete uncached 63-task run passed. Logs retain the initial failure and both discriminating retries rather than rewriting it as a clean first run.

## Replanned boundary

Admission is no longer the first unproven join. The next real boundary is a **root-arc joined browser tracer** over the existing ChatAgent and document route:

1. Resolve provider-root schema preservation (or obtain an explicit owner disposition) before paid `addArc` class proof; do not treat canonical post-validation as provider fidelity.
2. On the unpaid controlled path, expose the one current `WorkpieceRevision` authority, validate explicit settled id/hash and supersession intent, and compose root `addArc` as normalization → structural carrier → canonical validation without broad catalogue admission.
3. Supply immutable issued input/base and stable document incarnation, mount A3's recorder on the existing website route, carry the verified record alongside the already-correlated canonical client result, and prove actual browser execution/resume without reapplying.
4. Recheck actual revision/browser records through the earned retention/compaction route, then proceed to A5 only after the citation, authorization and browser-record contracts have been exercised together.

Provider-root fidelity investigation is independently parallelizable with the unpaid settled-basis/browser join. The browser witness may use the existing labelled fixture root arc to establish mechanics; it does not substitute for later genuine Vestera construction or authorize a paid run. Paid work remains blocked until provider request accounting through the buffered decorator and the complete guidance/tool/instrument baseline are pinned.
