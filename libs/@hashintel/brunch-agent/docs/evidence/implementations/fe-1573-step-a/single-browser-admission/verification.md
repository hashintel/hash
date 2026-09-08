# Single-browser proposal closure

Authority: `2c432e0582`, following the independently reproduced gap in `decision.md`. Implementation: **`5e9786e95b`**. The existing buffered ChatAgent provider boundary now rejects more than one final browser call or more than one browser identity across complete streamed/final representations. Streamed browser inputs must match the final call's identity, name and arguments. A legitimate single call is not counted twice, and object-key-order-equivalent arguments are not falsely rejected. Original mixed browser/server rejection remains the first rule; server-only proposals, inactive provider scopes, cancellation and usage/result preservation remain unchanged. No Flue termination change, extra proposal ledger or automatic repair/retry was added.

The actual original mounted counterexample was rerun unchanged on the new build: **one provider call, no dynamic-tool publication, no client-result signals and no continuation**. It fails visibly with the multiple-browser proposal refusal. The new mounted regression checks the mixed-validity read/mutation pair in both orders and a positive single canonical headless read that continues exactly once only after its correlated result. This is a causal admission oracle, not a new physical browser-mutation claim.

TDD: the new tests first produced **8 failed / 12 passed**, including the real mounted counterexample. After the guard, **70 focused tests** passed across admission, mounted browser proposals, accounting, registration, the unchanged ordinary mixed-batch oracle and architecture. An independent targeted review reran **20/20** admission/mounted tests and found no concrete blocker. Only local variable naming was clarified after that review; final tests used the resulting source/build. One local lint error (`console.log` in the new probe) was corrected to `process.stdout.write`; unrelated existing warnings remain.

Final guarded verification on alpha:

- Complete application build, typecheck, lint and **287/287 app tests** passed.
- Forced seven-package portfolio: **63/63 tasks, zero cache hits, 1,627 tests**.
- Actual Chrome A5 replay: all three cohorts, **14 why results**, no cohort browser or blocked-origin errors. It still exercises the native root arc, source/locator/evidence path and reopened reconciliation/refusal controls.
- Built accounting: **13 outcomes** pass beneath the unchanged admission placement.
- Original failed probe and successful replay, red/green/portfolio logs, reviewer report and final source hashes are retained under `verification/`. `manifest.json` pins those artifacts. All commands used the previously verified native-delivery deny/loopback profiles; no paid application/provider call or new artifact acquisition occurred.

Commands used the existing package build/test/lint tasks under `sandbox-exec`, plus `test:reopened-why`, the explicit `provider-accounting.integration.ts`, and the new `browser-proposal.test.ts` wrapper. The new substrate importer is explicitly admitted in the owner inventory. No existing safety assertion, buffering bound or timeout was weakened. The one-browser policy intentionally changes future scoped proposal admission; it does not rewrite old history or remove generic transport support for materializing existing multi-result records.

This closes the reached mixed-validity multi-browser continuation gap by refusing such proposals rather than making them an atomic batch. It is not a universal malformed-provider protocol or concurrent-browser guarantee. Future paid and broader-construction instruments must pin this new baseline and count the additional sequential calls inside the existing budget. Shared paid ledgers remain unchanged.
