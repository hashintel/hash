# Side quest — Make Brunch tests pay for regressions

## Status

Active inside live [Mission 7c](MISSION.md). Authorized by Lu on 2026-09-13 after a read-only audit of the Brunch package family found a small but persistent layer of tests whose failures report wording, dormant implementation, repository inventory, or TypeScript diagnostics rather than changed product behavior. Reconciled on 2026-09-13 with the four subsequent commits `8cdedb8b25`, `da8e6507fb`, `17b87ff83b`, and `f0e390a5bc`: they added and refined the app/website document-lifecycle seam and synchronized mission, context and topology authority, but changed no file under the audited `libs/@hashintel/brunch-agent/packages/` tree, so the package inventory and imperative remain valid. Their newly authoritative app-owned tests and catalogue are explicit exclusions below. This quest authorizes local, unpaid remediation only; it grants no provider invocation, evaluation campaign, product feature work, or concurrent side quest. Commit this authority file alone before implementation, and remove it at close.

## Relationship to the live mission

Mission 7c is actively extending the canonical Petrinaut construction path, where useful tests protect persisted evidence, replay identity, transport lifecycle, canonical mutation effects, compiler feedback, and corruption refusal. The audited suite contains 305 tests in 39 files and approximately 10,270 lines of tests beside 11,186 lines of production TypeScript. Recorded package runs complete quickly, so runtime is not the observed strain. The strain is maintenance and oracle quality: exact-prose checks fail on harmless rewrites while admitting semantic failures; compile-time claims are wrapped in tautological Vitest assertions; repository-presence checks prove no consumer path; some canonical-schema facts are asserted at more than one internal layer; and suspended orchestration remains tested without a current product consumer being named.

This quest subtracts that low-value layer without weakening the mission's load-bearing regression protection. It changes no mounted behavior, persistence format, transport contract, mutation semantics, skill teaching, evaluation instrument, fixture content, or product claim. The only production-surface change it may make is removal of a private-package export proven unused across the repository and belonging solely to unmounted orchestration; any such removal must precede its test deletion in the same reviewable slice.

The synchronized mission now names source- and identity-explicit worked-model
net-projection lifecycle tests in `apps/brunch-agent` and
`apps/petrinaut-website` as proof of the partial implementation, while
complete connected-bundle acceptance remains unmet. It also names the checked
ordinary Brunch tool catalogue plus native provider carriage as the mounted
tool-topology oracle. Those tests and app-owned catalogue files are outside
this package-test remediation. They must not be deleted, weakened, or
reinterpreted as duplicate inventory checks; if a proposed package change
reaches them, the affected app gates become mandatory and the stop lines below
apply.

## Imperative

Make every retained Brunch unit test fail for a credible runtime, package-boundary, or deterministic structural regression that an existing build, typecheck, lint, or evaluation oracle would not report more directly. Move compile-only claims to the TypeScript gate, keep prompt tests only for deterministic packaging or bounded structural policy, give each canonical runtime schema fact one test owner, and stop maintaining unmounted orchestration as though it were mounted product behavior.

A smaller count is an expected result, not the optimization target. Persistence, replay, evidence, transport, projection, mutation-effect, validation, and compiler-clean fixture tests remain unless inspection demonstrates a stronger existing oracle for the same failure.

## Throughline

```text
SIDE_QUEST.md committed alone
→ record the exact pre-change test inventory and affected package gates
→ move compile-only assertions out of Vitest and into a typecheck-owned fixture
→ reduce skill tests to packaging, reference integrity and bounded structural policy
→ remove tautological stub, repository-presence and over-locked fixture assertions
→ assign each canonical construction-schema fact to one runtime contract test
→ replace the source-barrel proxy with a type/build-owned package-surface contract
→ trace suspended protocol exports to every repository consumer
→ de-export and delete only consumerless orchestration tests, retaining live projection contracts
→ run focused tests, all affected package gates and controlled negative probes
→ put the disposition and proof in the PR close report; remove SIDE_QUEST.md
```

## Operation

### 1. Freeze the baseline and classify by oracle

Before editing, capture in the PR close report the current Vitest file/test counts for every package and the current `lint:tsc`, `lint:eslint`, `test:unit`, and `build` results. Use four dispositions for every test changed by this quest:

| Disposition | Meaning |
| --- | --- |
| Retain | A plausible production change can violate the asserted contract, and this is the narrowest credible oracle. |
| Move | The claim is useful, but typecheck, build, or an evaluation is its real oracle. |
| Consolidate | The runtime claim is useful but asserted at multiple internal layers; one named boundary becomes its owner. |
| Delete | The assertion proves authored text, a repository fact, a stub, or unconsumed behavior with no current regression claim. |

Do not produce a new evidence document or permanent test ledger. The changed-test disposition belongs in the PR description or close report.

### 2. Give compile-only claims to `lint:tsc`

Create one compile-only fixture under `packages/core/test/types/` that is included by the existing `packages/core/tsconfig.json` but does not match Vitest's `test/**/*.test.ts` include. Move these contracts into it:

- `packages/core/test/naming.test.ts`: an undeclared operation such as `toolName("aks")` remains rejected with `@ts-expect-error`.
- `packages/core/test/anchoring.test.ts`: caller evidence cannot supply a harness-owned pointer, and a stored `EvidenceSpan` is not assignable to caller quote input.
- The allowed counterparts compile in the same fixture, so a malformed fixture cannot pass merely because every example is rejected.

Delete the tautological runtime assertions that only prove an uncalled closure or cast value exists. The fixture is owned solely by `turbo run lint:tsc --filter @hashintel/brunch-agent`; Vitest must not discover or execute it.

### 3. Reduce prose tests to structural contracts

Apply the following boundary to `packages/core/test/elicitation-skill.test.ts`, `packages/core/test/question-marker.test.ts`, `packages/plugin-gherkin/test/gherkin-specification-skill.test.ts`, and `packages/plugin-sdcpn/test/sdcpn-modelling-skill.test.ts`:

Retain deterministic checks that a skill parses, has the expected identity, embeds the authored resource bytes, names only packaged resources, keeps a deliberately forbidden duplicated resource or scenario vocabulary absent, and stays within an explicit machine-relevant size ceiling. Retain the `skillFromMarkdown` parser case. Retain exact question marker identifiers and the marker tool's runtime write/projection behavior because they are a cross-package protocol contract.

Delete positive inventories of headings, sentences, teaching phrases, evidence-kind prose, cadence wording, normative distinctions, and other copy fragments. Delete the question-marker prompt's four phrase checks. These checks establish text presence, not model compliance; no replacement unit assertion is required. If an exact phrase is externally parsed rather than read by the model, first identify that parser and replace the phrase assertion with a parser-bound contract test.

Keep the existing scenario-noun exclusion in `packages/plugin-sdcpn/test/portfolio-portability.test.ts`: it is a bounded structural plugin-scope guard, not a claim that the prose causes compliant behavior.

Use the same small packaging pattern in each plugin test, but do not create a cross-workspace test-helper package or production abstraction merely to remove a few repeated test lines. `packages/plugin-claims/test/claims-formalization-skill.test.ts` and the packaging portions of the Gherkin and SDCPN skill tests retain only identity, authored-to-packaged resource equality, and reference integrity. The phrase `Aligned to core as of` is repository guidance, not a Vitest contract.

### 4. Remove assertions with no consumer behavior

Delete `packages/plugin-dafny/test/dafny-verification-skill.test.ts`. The deliberately unmounted stub earns a functional test when it gains a product consumer.

In `packages/plugin-sdcpn/test/portfolio-portability.test.ts`, delete the test that only opens the six situation-pack and opening-message files and asserts that they are nonempty. In the Inventory reference test, remove the byte hash and exact entity counts unless inspection finds a current consumer that requires immutable bytes or those exact cardinalities. Retain parsing, `hadMissingPositions === false`, and `checkDefinition` validity; these establish the useful compiler-clean fixture contract.

In `packages/plugin-sdcpn/test/construction-tools.test.ts`, distinguish the legacy/internal individual-operation list from the synchronized mission's mounted catalogue. The mounted ordinary surface contains the single `mutate_petrinaut_net` carrier and is owned by `apps/brunch-agent/src/agents/chat-agent/tool-catalogue.ts` plus its native provider carriage tests; preserve those oracles. Delete an individual-operation inventory assertion only when the list is neither an input to the mounted carrier/capability matrix nor an independent cross-boundary contract and merely compares an exported list with the same constants used to construct it. If it is the narrow oracle that the plugin carrier admits the capability-matrix operation set, retain or relocate it to that carrier boundary instead of deleting it. Delete validator-equivalence assertions whose expected value is computed by immediately asking the delegated Petrinaut validator the same question. Retain concrete accepted, rejected, normalized, nested-path, mode-gating, carrier-name, and capability-admission cases.

### 5. Give canonical runtime schemas one owner per family

TypeScript does not prove generated Zod/JSON Schema identity, metadata, defaults, strictness, or provider-facing descriptions. Preserve one parameterized runtime conformance test for each distinct construction family:

- Root node operations in `packages/plugin-sdcpn/test/root-node.test.ts`.
- Root state operations in `packages/plugin-sdcpn/test/root-state.test.ts`.
- Root arc operations in `packages/plugin-sdcpn/test/native-input.test.ts`.
- Declared-basis application in `packages/plugin-sdcpn/test/declared-basis.test.ts`.

Each owner may prove that Brunch adds only its declared envelope/restriction to the canonical Petrinaut schema. Remove a second generated-schema comparison when the same operation, envelope, and generated artifact are already covered by its family owner. Retain concrete runtime cases for raw field presence, provider numeric-string normalization, canonical refusal, nested paths, root-only restrictions, default insertion, and reference semantics; these are behavior, not static typing.

Do not replace these tests with snapshots. A failing equality should show the semantic schema difference directly.

### 6. Put the public surface at the package boundary

Replace `packages/binding-flue/test/public-surface.test.ts`, which inspects `../src/index`, with a compile-only package-consumer contract. It must import the allowed binding exports through `@hashintel/brunch-agent-binding-flue` and use `@ts-expect-error` for the deliberately absent `useElicitation` export. The package build remains the runtime artifact oracle. If package self-reference cannot exercise the declared `exports` map, retain a minimal built-package smoke test rather than falling back to a larger source-object inventory.

Exact protocol strings remain runtime-tested only where another package or persisted record consumes those strings. Source barrel shape alone is owned by typecheck plus build.

### 7. Reconcile suspended tests with real consumers

Trace every export from `packages/core/src/_suspended/conversation/` across the entire HASH repository, including imports through `@hashintel/brunch-agent`, `./client-tools`, and binding code. Classify the code, not merely its directory:

- Retain and, where necessary, relocate tests for contracts currently used by `packages/binding-flue/src/history-reader.ts` or another mounted consumer, including reply/sweep tags, `sweepAffordanceFrom`, and the neutral history fact shapes.
- Retain tests for any symbol that must remain on the private package surface for a named current consumer.
- For ask admission, settlement cadence, repair continuation, prompt rendering, high-water orchestration, or another behavior with no repository consumer, remove its main-package export first and then delete its dedicated test case. Remove the implementation too only when the resulting dependency graph shows it has no live type or runtime use.
- Keep projection behavior in `packages/binding-flue/test/history-reader.test.ts`; do not duplicate it in a suspended protocol test.

The completion state is not “no tests under `_suspended`.” It is that every retained suspended test names a current consumer or package contract, while every consumerless orchestration behavior has ceased to impose an active regression obligation.

### 8. Keep focused wiring tests proportional

Retain the default and configured behavior in `packages/core/test/compaction-config.test.ts`, but remove assertions on internal hook count or inert mocked hook composition unless multiple model declarations cause an observed failure. Assert only the adapter output delivered to `useModel` for absent and present compaction configuration.

Do not refactor production solely to make this test deeper. If the existing two short tests remain the least mechanism for the forwarding contract, leave them unchanged and record `Retain`.

## Proof

| Required result | Oracle |
| --- | --- |
| Compile-only contracts no longer masquerade as runtime tests | `rg -n "@ts-expect-error" packages/core/test --glob "*.test.ts"` returns no hits; the new non-Vitest type fixture contains the negative and allowed counterparts; `turbo run lint:tsc --filter @hashintel/brunch-agent` passes. |
| Literal prose is no longer treated as agent behavior | Review the four named skill/prompt test files: every retained text assertion is classified as identity, package/reference integrity, forbidden cross-domain content, exact machine-consumed protocol, or explicit size bound. No positive inventory of teaching sentences or headings remains. |
| Skill resources still package exactly | Focused plugin unit tests read every declared resource from its authored path, compare its bytes with the exported descriptor, and prove every resource path referenced by instructions is present. |
| Static and stub assertions are gone | The Dafny stub test, portfolio nonempty-file test, Inventory hash, and unowned exact-count assertions are absent. The retained Inventory fixture parses without missing positions and passes `checkDefinition`. |
| Canonical schema ownership remains protected | One named parameterized test per root-node, root-state, root-arc, and declared-basis family fails on an undeclared schema copy or dropped canonical field, while concrete normalization/refusal/default cases remain green. |
| Binding exports are checked through their declared package boundary | The compile-only consumer imports allowed exports and rejects `useElicitation`; `turbo run lint:tsc build --filter @hashintel/brunch-agent-binding-flue` passes. |
| Suspended coverage follows consumers | A repository-wide import graph is summarized in the PR close report. Every retained `_suspended` test points to a mounted consumer or retained private-package contract; every deleted behavior has no remaining export or repository import. All Brunch package builds and typechecks pass. |
| Load-bearing behavioral coverage remains | Existing focused suites for capture store, local persistence, anchoring, session log, workpiece evidence/update, Flue history, transport, transcript/UI projection, mutation records, mutation application, native validation, reconciliation, and compiler-clean Inventory slice remain green. The app-owned partial net-projection lifecycle and checked mounted-tool-catalogue tests remain untouched; those lifecycle tests do not satisfy the still-unmet complete connected-bundle acceptance. Run them if import impact or a production-surface edit reaches their graph. |
| The retained oracles can detect representative regressions | Before finalizing, make and revert three controlled local mutations: widen `toolName` to admit an undeclared operation and observe `lint:tsc` fail; remove one packaged skill resource/reference and observe its structural test fail; drop one canonical field or Brunch envelope member in a representative construction schema and observe its family contract test fail. Record commands and failure summaries in the PR close report, then restore the tree and rerun green gates. |
| The operation did not become a count-driven purge | The close report gives before/after files, tests and lines as observations, then lists every changed test by Retain/Move/Consolidate/Delete rationale. No acceptance leaf requires an arbitrary percentage reduction or faster runtime. |

### Final gates

Run the focused test after each slice, then run all package-family gates from the HASH root:

```text
turbo run lint:tsc lint:eslint test:unit build \
  --filter @hashintel/brunch-agent \
  --filter @hashintel/brunch-agent-binding-flue \
  --filter @hashintel/brunch-agent-transport-aisdk \
  --filter @hashintel/brunch-agent-plugin-claims \
  --filter @hashintel/brunch-agent-plugin-dafny \
  --filter @hashintel/brunch-agent-plugin-gherkin \
  --filter @hashintel/brunch-agent-plugin-sdcpn
```

Also run `git diff --check` and inspect the exact diff. Existing unrelated worktree changes are outside this quest and must remain untouched.

## Constraints

- Preserve tests that protect persisted capture data, atomic refusal, migration, ownership isolation, replay/version identity, evidence anchoring, stale/concurrent workpiece updates, transport admission/idempotency/cancellation, transcript/UI projection, diagnostic privacy, canonical mutation effects, cascading changes, and compiler-clean definitions.
- Preserve the synchronized mission's app-owned proof for fail-closed
  document-source selection, principal-scoped worked-model net projections,
  identity-explicit revision persistence, fixed Brunch mode, read-only remote
  titles, fresh net-projection conversation identity and the checked mounted
  tool catalogue. This proof is scoped to the partial net projection and does
  not discharge complete connected-bundle acceptance. These are outside the
  audited package-test tranche, not candidates for subtraction.
- A typecheck can own assignability and rejected-call claims; it cannot replace runtime parsing, generated schema, strictness, metadata, defaulting, normalization, or package build checks.
- A prompt substring is not an agent-behavior oracle. Keep exact text only when a parser, transport, persisted record, or other machine consumer requires that exact text. Evaluations may establish behavior, but this quest neither rewrites frozen instruments nor authorizes a provider run.
- Preserve one deterministic structural guard against concrete scenario nouns or IDs entering reusable plugin guidance.
- No snapshot conversion, coverage target, mutation-testing dependency, shared test-support package, package.json change, lockfile change, or new dependency.
- No production refactor for test aesthetics. Production edits are limited to de-exporting and deleting consumerless suspended orchestration or the smallest adjustment required to test the declared package boundary.
- The package family is private, but repository consumers still define compatibility. A symbol is not unused until a root-wide search and all affected builds/typechecks agree.
- Do not edit evaluations, mission proof, product prompts, skill prose, fixtures, or canonical Petrinaut behavior to make the reduced suite pass.
- Changes from other sessions, including existing Petrinaut and website worktree modifications, remain untouched and unstaged.

## Fog-line

- **Suspended public contracts.** Some code under `_suspended` is consumed by the mounted Flue history reader, while other symbols are re-exported only for older contracts. Directory placement does not settle deletion. The root-wide consumer graph and affected builds decide each symbol; an unexplained consumer retains the export and its narrow behavior test.
- **Exact prompt text.** The audit found no machine consumer for the positive teaching fragments named above. If implementation inspection finds one, preserve only that exact machine-consumed token or grammar and name the consumer in the test; do not restore the surrounding prose inventory.
- **Canonical schema overlap.** Similar schema checks may observe different artifacts: native Zod input, generated provider JSON Schema, tool description, or post-normalization value. Consolidate only identical claims. If removing one leaves an artifact unobserved at a mounted boundary, retain the narrow test and record why.
- **Built-package self-reference.** TypeScript self-reference may validate package types without proving the emitted runtime export. Build is required in either case; add a built-artifact smoke test only if the package boundary cannot otherwise distinguish a missing runtime export.

## Stop or reorient

- Stop if a proposed deletion removes the only oracle for a persisted format, cross-package protocol, generated runtime schema, mutation effect, refusal path, replay identity, or mounted product behavior.
- Stop if de-exporting suspended code breaks a repository consumer or requires a compatibility migration. Retain that contract and narrow its tests instead of widening this quest.
- Stop if replacing a prose assertion requires changing skill or prompt semantics. Report the uncovered behavioral-oracle gap; this quest subtracts false confidence and does not redesign teaching.
- Stop if a package-boundary test requires changing the Turbo task graph, adding a package, or adding a dependency. Use the existing typecheck and build surfaces or retain the smallest current test.
- Stop if the implementation diff reaches application code, evaluation instruments, Petrinaut canonical schemas, persisted fixture content, or live Mission 7c behavior.
- Stop if another side quest becomes necessary. Close, fold, or remove this one before authorizing another.

## Budget

No paid activity. Use repository inspection, TypeScript, Oxlint, Vite, Vitest, controlled reverted mutations, and diff review only. Existing evaluation artifacts may be read but not rerun against a provider.

## Outcome recording

At close, update the PR description with the changed-test disposition, before/after inventory, controlled negative-probe results, final green gates, and any retained oracle gaps. Record no campaign chronology or separate evidence document. If the operation discovers a future evaluation need, place only that durable re-entry condition in the appropriate existing future-planning home after owner review. Remove `SIDE_QUEST.md` before the side quest's closing implementation commit or PR-ready state, as required by the context-root lifecycle.
