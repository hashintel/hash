# Public browser shutdown rejection — bounded correction for re-review

## Status and exact scope

**Correction ready for parent focused re-review; no final freeze or activation.** Source/test commit **`c9f8ced5eca31bc177539d185c2b4addd97f99eb`**, based on the unchanged prior `070cb6fb42` / `3d4a5ebab5` adapter packet. Execution authority: ALPHA **`6d94fd6354`**, MISSION’s sibling-browser correction paragraph and `sibling-browser-review-alpha/decision.md`, read without importing authority or capacity changes into this worktree.

Exactly three source paths changed:

- `apps/brunch-agent/src/evaluations/real-provider-a5/browser-owner.ts`: only shutdown outcomes, rejection/timeout escalation and cleanup reporting.
- `apps/brunch-agent/test/real-provider-a5-shutdown-hook.ts`: guarded TEST preload overriding returned public close/kill methods, with separate saved-public-method rescue.
- `apps/brunch-agent/test/real-provider-a5-shutdown.integration.ts`: process/filesystem orchestration and four actual owner/Chrome fault controls; independent socket audits run in separate loopback-guarded children.

Driver/context/UI, activation/readiness, launcher, raw attestation, accounting, all46 canonical repair limits, scenario/guidance/model, network profiles, package/installed runtime and existing tests are unchanged. There is no new shared script or direct Flue/Pi substrate importer; the unchanged architecture suite passes. **ALPHA capacity fix `28a529a7bf` was not mixed in.** No rebuild/alignment or complete instrument manifest was generated; the existing106 app/website build pins and563 installed browser-library pins still verify against the prior packet. Final merged rebuilding remains the parent’s later step.

No paid profile, provider/DNS/auth probe, credential availability/validity check or real-ledger access/write occurred. The old allocation remains released; shared usage remains the parent’s **5 calls / US$0.09113535**, unaffected by this lane. Dry’s disposable TEST ledger is not a paid authority.

## Original red preserved and reproduced

The independent review and parent actual-owner reproduction are retained losslessly under `parent-red/`. Their finding supersedes the earlier read-only no-blocker assessment: a rejected `server.close()` won `Promise.race` by throwing, `finally` cancelled the sole kill timer, and cleanup reporting was skipped. Normal dry/lifetime greens did not prove this rejection branch.

Our new actual discriminator went red against the unchanged owner: **owner26765 / Chrome26792**, close called, **kill not called**, both processes and the profile still alive, endpoint independently **connected**, readiness removed, owner failure recorded, no cleanup report. After7.5 seconds, the assertion **“Production must invoke public kill after close rejection or timeout”** failed. The test then used its saved unmodified public close to rescue only these resources. `fault-red/…/production-observation.json` is the failed production verdict; `test-cleanup.json` records rescue separately. The test command exits1, not a misleading diagnostic success. Exact pre-format red hook/probe snapshots are retained.

All intermediate runs remain: `fault-green-first`, `fault-green`, and final `fault-review`. One lint-only red complained about an unnecessary optional chain in the test; it was corrected without changing the refusal assertion. No rejected result was rewritten as a pass.

## Minimal shutdown correction

One owner-local helper observes a public method as `complete`, `rejected` with error name/message/stack, or `timeout`, each with its own five-second deadline. It converts a method rejection into a retained outcome instead of letting it escape the race. Consequently **both rejected close and timed-out close enter public `BrowserServer.kill()`**; clearing the completed close deadline cannot cancel that separate fallback. Synchronous throws also enter the same rejection path. No generic service, daemon, broad process kill, model retry or accounting repair is introduced.

Public kill is bounded too. After its outcome, the owner still checks the known Chrome PID, profile, readiness and actual endpoint. `cleanup.json` now retains `gracefulClose`, `killFallback` and `cleanupComplete`, alongside the original IDs/resource observations. Completion requires a successful public shutdown outcome **and** actual resource disappearance/refusal. A rejected/timed-out kill or unverifiable resources writes `cleanupComplete: false` and raises the existing visible owner failure; it is never declared done.

**Important negative limit:** when the test deliberately makes both shutdown avenues ineffective, the owner/library listener and Chrome remain alive at the production observation. The owner reports failure rather than promising it can recover from a broken public kill. The TEST-only rescue subsequently closes those resources. Its exit0 and post-rescue disappearance are not credited to production cleanup. No universal power-loss, exhaustive descendant or guaranteed termination under arbitrary library/OS failure is claimed.

## Actual public-method fault outcomes

Final oracle: `observations/runs/fault-review/`, four controls. All hooks/SDK/browser work execute within the credential-free loopback owner root. The hook changes only returned public methods; installed files are untouched. For positive fallback controls, the wrapper records invocation and calls the saved **real public kill** against actual Chrome. For negative kill controls, rejection/hang is explicitly test-injected.

| Control | Owner / Chrome | Close → public kill call | Retained production outcome | Test rescue |
| --- | --- | --- | --- | --- |
| Close rejects | 38786 /38839 | 0.228ms | `gracefulClose: rejected` with exact TEST error; kill complete; owner exits0; Chrome/profile/readiness gone; independent endpoint ECONNREFUSED; cleanupComplete true | **Not used** |
| Close never resolves | 40272 /40274 | 5002.040ms | Graceful timeout; kill complete; owner exits0; Chrome/profile/readiness gone; independent endpoint ECONNREFUSED; cleanupComplete true | **Not used** |
| Kill rejects | 40580 /40585 | 0.255ms | Both exact errors retained; cleanupComplete false; owner failure; owner/Chrome/profile still present and endpoint connected before rescue | Used only after immutable production observation |
| Kill never resolves | 40992 /40994 | 0.281ms | Close rejection retained; kill timeout; cleanupComplete false; owner failure; owner/Chrome/profile still present and endpoint connected before rescue | Used only after immutable production observation |

Invocation times use the same owner process’s monotonic clock at the public wrappers, not cross-process correlation guesses or a performance claim. The never-resolving close is a distinct control; it cannot pass from immediate rejection alone. The oracle asserts kill invocation within the five-second close deadline plus scheduling margin and no rescue use for either positive. For each negative, the production observation records no process exit, an incomplete report and surviving resources, before saved-method rescue. Independent post-rescue endpoint refusal and PID/profile checks prove the tests did not leave their known resources running; they do not change the recorded production failure.

`shutdown-summary.json` retains exact outcomes/times and separates production verdict from test cleanup. Aggregate `passed: true` means all four positive/negative assertions matched; it does **not** say kill-failure cases achieved production closure.

## Existing regressions preserved

- Native-delivery Java/Node deny/commit/loopback descendant guard passes before probes.
- **22/22** existing browser binding/old-activation unit controls pass.
- Entire application suite: **40 files /337 tests pass**, including existing architecture, admission/accounting/native-attestation controls. Types pass; lint has20 existing warnings /zero errors; source formatting/diff check pass.
- All **five** existing actual lifecycle controls pass unchanged: foreign execution, attach failure, lease expiry, owner interrupt and real-launcher early interrupt; zero native dispatches in those controls.
- Actual integrated **dry5** passes through the unchanged driver and built application, with real browser read/result continuation; no rejected operation, blocked origin or browser/listener error. Owner cleanup is graceful-complete /kill-not-needed /cleanupComplete true. Launcher **32010**, owner **32025**, driver **32036**, Chrome **32027**, execution **`0110797c-331d-49c2-bcf8-91dc4d63f904`**. The screenshot was inspected; TEST/prepared labels and no-construction/no-explanation claims remain honest. Dry TEST costUS$0.003 is not real spend.

The prior sandboxed `ps` refusal and Chrome background-denial observations remain unchanged historical limits. This run does not claim zero attempted browser background networking, provider acceptance, genuine A5 construction/explanation, utility or mission acceptance.

## Evidence and remaining gates

Original outputs: **`/tmp/m7-shutdown-correction.KHbjED`** and the exact owned session directories named in its observations. All originals, failures and rescue records are retained as lossless gzip/screenshot copies with `original-observation-pins.json`. `source-review-pins.json` pins only this correction; `protected-nonledger-pins.json` verifies the untouched seams without reading a real/cloned paid ledger or journal; `inherited-component-verification.json` verifies the prior build/library component maps. These are **review pins, not a final paid instrument freeze**.

Next gate is parent focused re-review of the exact source, raw public-method counters and pre-rescue physical observations. Only after acceptance will the parent align the merged instrument, including the independently delivered capacity fix, rebuild/pin/preflight it, and separately allocate/activate any paid-controller attachment and native TLS checks. No fresh activation JSON, reservation, model invocation, StepB or semantic-policy change is supplied here.
