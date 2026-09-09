# Sibling-browser adapter — close-rejection blocker

## Observed result

The independent parent-commissioned review of code `070cb6fb42` / evidence `3d4a5ebab5` reran the **22** binding/old-activation tests, actual integrated **dry5** and all **five** existing lifecycle controls successfully. Its source review found no concrete removable mechanism that would preserve the current identity/lifetime obligations, and confirmed guarded siblings, private run/execution binding, no credential-bearing browser environment, no `exposeNetwork`/proxy/header forwarding and unchanged app/accounting/scenario paths.

It then exposed one concrete failure: **public `BrowserServer.close()` rejection cancels the only kill fallback**. `Promise.race` rejects immediately; the `finally` clears the fallback timer and skips subsequent cleanup reporting. The owner has already cleared its lease/poll, so setting `process.exitCode` leaves the library listener and Chrome alive. The launcher's later interrupt only resolves an already-resolved stop promise.

The reviewer and parent independently launched the real owner/Chrome under loopback-only, injecting only a rejection from the public close method and observing the real public kill method. After **6.5 seconds**, beyond the five-second fallback deadline, both saw close called, **kill not called**, owner/Chrome alive, profile present and no cleanup report. The parent run used owner18344 / Chrome18347. No app, provider or paid profile participated.

After retaining each failure, the fault hook invoked the saved unmodified public close through its test-only rescue signal. The parent verified owner/Chrome gone and profile removed, with rescue exit0. No test browser was deliberately left alive. Diagnostic exit0 means the failure was observed and test resources cleaned, not that production cleanup passed.

## Required bounded correction

Keep the adapter unintegrated and the old activation unlaunchable. Within the already-approved lifecycle obligation, authorize only the owner shutdown path and focused fault controls to ensure **both graceful-close rejection and timeout reach the bounded public kill fallback**. Do not cancel the sole fallback merely because close rejects. Preserve/record the graceful failure and the fallback outcome, and verify actual owned browser/profile/endpoint cleanup. If kill/cleanup cannot be verified, surface a non-success/incomplete-cleanup result rather than claiming closure; do not silently retry the model, repair accounting or broaden process killing.

Add distinct actual close-rejection and never-resolving-close controls. Instrument whether public kill ran and verify known real resources disappear; avoid fake-only success assertions. Keep test-owned rescue cleanup separate from the production verdict. A kill failure should at least be reported honestly rather than converted into successful cleanup; do not claim universal OS/power-loss recovery. Normal dry5, wrong/foreign readiness, early driver failure, lease and interrupt controls remain required regressions.

No raw attestation, ledger, provider/model, profile rule, guidance/scenario or root-construction changes are authorized by this correction. A newly reviewed code delta and final freeze still precede any allocation, paid-controller attachment or native TLS check. The old r1 allocation remains released; actual usage is **5 calls / US$0.09113535**, no hold.

## Evidence

`independent/review.md.gz` contains the full review and exact commands. Both reviewer and parent fault hooks/probes, actual first failure observations, private owner failures and subsequent test-rescue results are retained. The parent changed only temporary artifact paths when repeating the same probe; no repository or installed file was modified. All SDK/browser work ran inside loopback-only; orchestration was process/filesystem-only. The artifact manifest preserves source bytes. This is not a no-blocker adapter acceptance or paid execution.
