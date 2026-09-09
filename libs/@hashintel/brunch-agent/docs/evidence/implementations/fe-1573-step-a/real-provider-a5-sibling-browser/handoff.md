# Bounded A5 sibling-browser adapter — source and local evidence for review

## Status and authority

**Ready for parent focused review, not another final freeze or paid launch.** Source/test commit: **`070cb6fb42df2568de04d7c79499ad4d29a0b011`**. Execution authority is ALPHA **`47ebb1ef57`**, its MISSION “Sibling-browser adapter” paragraph and `sibling-browser-topology/decision.md`, read in ALPHA without cherry-picking authority into this worktree. The old `34a90935e4` / `8a47d333…7381` instrument remains historical and unlaunchable; its files and the original paid→loopback failure were not rewritten.

No paid profile was opened, no provider/DNS/auth-validity probe or credential-availability resolution was performed, and no real ledger was written. The old named allocation remains released. Parent-reported shared totals remain **5 calls / US$0.09113535**. All new provider traffic was explicitly synthetic TEST transport. No model, persona, evaluator, scenario, teaching, admission/accounting policy, runtime patch, package/lockfile or production service was changed. Root-creation work remains independent.

## Exact source write set

| Path under `apps/brunch-agent/` | Owning change |
| --- | --- |
| `src/evaluations/real-provider-a5/browser-session.ts` | Private filesystem-only run/execution/binding identity and one-controller claim. No SDK or network import. |
| `src/evaluations/real-provider-a5/browser-owner.ts` | One independently loopback-guarded credential-free public Playwright `launchServer` owner, bounded lifetime and public close/kill cleanup. |
| `src/evaluations/real-provider-a5/launch.ts` | Ordinary process/filesystem orchestration of the two guarded siblings. No application/provider/browser SDK or socket work outside profiles. |
| `src/evaluations/real-provider-a5.ts` | Require sibling binding and execution identity; replace nested launch with public connect for both dry and real; explicitly close context and disconnect. Preserve actual app/UI/results and native/accounting path. |
| `src/evaluations/real-provider-a5/manifest.ts` | Extend prospective coverage to installed Playwright core/client/server/test libraries and browser/launcher/profile identities. **Not invoked to generate a new final manifest.** |
| `src/evaluations/real-provider-a5/chrome-loopback.sh` | Remove obsolete nested-launch helper after repository search found no remaining live consumer. Historical manifests/commands/commits remain unchanged. |
| `test/real-provider-a5-browser.test.ts` | 22 filesystem/identity/old-activation controls, no browser/provider/credential/socket invocation. |
| `test/real-provider-a5-browser.integration.ts` | Process-only orchestration of actual guarded owner/controller/audit children for five failure/lifetime controls. |

No new direct Flue/Pi substrate importer or shared script/inventory insertion is needed: the new test entrypoint imports only Node and the filesystem-only session helper. The unchanged architecture/hermetic inventory passes in the whole app suite. No shared package command was added.

## One-run topology and activation delta

The new command entrypoint is `src/evaluations/real-provider-a5/launch.ts`, invoked from an ordinary shell, **not underneath a paid or deny-only parent sandbox**. It opens no sockets and imports no Playwright/provider/application code. It spawns:

1. Owner Node under the existing `loopback-only.sb`, with only PATH/HOME/TMPDIR and fresh private HOME/TMPDIR. The OS adds a known non-credential macOS runtime variable; the owner drops it without reading its value, then rejects any other unexpected inherited environment before importing Playwright. Chrome gets a newly constructed three-key environment, never inherited provider configuration.
2. The existing driver under loopback for dry, or the unchanged paid profile only for a future explicitly parent-activated real invocation. **Both modes use exactly the same sibling connection/lifecycle route.** There is no nested dry convenience branch.

The owner uses installed public `chromium.launchServer({ host: "127.0.0.1", port: 0, … })`, retaining the library’s random endpoint path. The driver uses `chromium.connect(endpoint, { timeout: 10000 })` with no `exposeNetwork`, proxy or custom headers. Arbitrary activation options never reach Playwright. Only the library owns the extra ephemeral browser-control endpoint; the existing application listener is unchanged. This is not a second production/model server or provider proxy.

Private session/readiness/binding files bind runId, fresh UUID-v4 executionId, launcher/owner/Chrome identities, creation/expiry, isolated profile and installed library/Node/Chrome/owner/launcher/session/profile hashes. The owner publishes readiness by file rename, avoiding a partial-read publication race. The launcher seals the readiness digest against its actual child PID. The driver verifies canonical owner-only file permissions, expected run/execution, live PIDs, current identities, bounded lifetime, private profile and exact loopback/random-path endpoint before application/native invocation. Owner and driver also verify the named launcher is their actual parent. An exclusive private controller claim refuses reuse of the same binding. This is scoped same-user local process coordination, not protection from a malicious OS peer with the same filesystem permissions.

**New parent activation fields:** `browserTopology: "sibling-playwright-v1"` and a fresh UUID-v4 `executionId`, in addition to all existing run/authoritative-ledger/manifest/IP/egress/single-writer fields. The launcher only supplies ephemeral browser wiring; it allocates or reconciles nothing. Old activation without the topology/execution contract refuses before a browser or paid-profile child is created. The endpoint stays in private ephemeral readiness, out of page/model data and live console output. Public launch/attach failures are generic; private failure evidence is retained.

The owner has a fixed maximum **12-minute** session lease, observes orchestrator exit/stop/signals, and uses public `BrowserServer.close()`, with a five-second public `kill()` fallback. The launcher stops its known driver, awaits owner cleanup and checks owner/driver PIDs, profile/readiness removal and endpoint refusal. It removes binding readiness authority and retains private non-live session metadata/logs for audit. The driver owns context closure/disconnection; it never attempts to launch or own Chrome. Unknown paid accounting would remain a stop, not be repaired by this lifecycle.

Network profiles are byte-identical. The paid-profile file retains its old nested-browser comment, but that comment no longer describes an executable branch; the new launcher and explicit topology field own placement. There is no network-rule weakening or new policy acceptance here.

## Fresh proof and retained reds

| Oracle | Observed result |
| --- | --- |
| Java/Node process-tree guard | Native-delivery deny/commit/loopback descendant controls passed before development commands. |
| Full app/website builds | **40/40 forced serial uncached tasks**, including app server and client plus website and dependency codegen. Current local source built under deny-network, Yarn/Corepack network disabled, Cargo offline. |
| Whole app suite | **40 files / 337 tests pass**, including the 22 new binding/old-activation controls and unchanged native/accounting/admission/architecture tests. |
| Type/lint/format | Types pass; lint has20 existing warnings / zero errors; changed source formatted explicitly. Source diff check passes. |
| Explicit built native terminal oracle | **25 controls / 34 synthetic HTTPS dispatches**, unchanged raw terminal/cache/status/cleanup accounting controls pass. No paid calls. |
| Actual integrated sibling dry | **Five synthetic native requests**, real browser read/result continuation, no rejected operation, blocked origin or browser/listener error; TEST estimateUS$0.003, not real spend. |
| Actual failure/lifetime controls | Foreign execution before attach; syntactically valid but deliberately TEST-resealed unserved library path reaches actual attach refusal; no-controller lease expiry; owner interrupt; real launcher early interrupt. All five pass with **zero native dispatches** and known process/profile/endpoint cleanup. |
| Negative readiness breadth | Unit controls reject wrong run/execution/owner/Chrome/directory/library/profile identity, stale session, modified bytes, dead PID, symlink/public file, external profile, and malformed/nonlocal/credential-bearing endpoint. The claim is single-use. |

Final integrated dry identity, retained in `observations/runs/dry-review/`:

- RunId `TEST-a5-driver`; executionId **`c81c33d9-73b3-4c78-a77a-4c99347fbd5d`**.
- Launcher **80040**, sibling owner **80051**, driver **80069**, owner’s Chrome **80060**.
- Both child exits0; owner/driver/Chrome gone; profile removed; endpoint **ECONNREFUSED**; ready/binding removed; `closeMethod: close`.
- Actual source/native bodies still select `claude-sonnet-4-6` /4096. The screenshot was inspected: TEST/prepared labels, real checked-net card and explicit no-construction/no-explanation prose remain. Dry does not mutate the A5 arc or answer why.

The final five-control packet is `observations/runs/lifecycle-green/result.json.gz`. Its four direct owner controls independently repeat endpoint refusal in a fresh loopback-guarded audit; the real launcher-interrupt control checks the product orchestration cleanup report and zero native artifacts. The normal launcher’s owner performs its endpoint refusal check after public shutdown. PIDs and profile absence are checked separately from callback success.

Retained development failures:

- `types-first.log`: UUID default inference rejected a general string; explicit checked string parameter corrected the TypeScript signature.
- `dry-first`, `dry-diagnostic`, `dry-after-env`: initial owner environment check failed before browser/driver invocation. The diagnostic retains the exact assertion and private failure stack. A minimal-env control established one known macOS runtime addition without dumping any environment values. The bounded fix drops that addition before checking and importing the library. The first failure exposed insufficient private diagnostic retention; subsequent owner failures are preserved privately.
- `lint-first.log`: ten new style/test-assertion errors, corrected without weakening refusal semantics.
- `lifecycle-five.stderr`: all underlying cleanup completed, but the test read `/tmp/…` with a helper requiring its canonical `/private/tmp/…` path. The test now canonicalizes its evidence-read path; production canonical-path enforcement is unchanged. The original red and successful cleanup packet remain.

The original paid→loopback EPERM71, earlier `/bin/ps` EPERM and Chrome background-denial observations remain at their parent-pinned evidence; they are not erased or reclassified. This adapter does not claim zero attempted Chrome background networking, exhaustive descendant enumeration, forced-kill fallback execution, power-loss/orchestrator-SIGKILL durability or real paid-root attachment. Lease and interrupt controls exercised graceful public close; the kill deadline is present but not independently stress-proved.

## Evidence identity and remaining gates

Original runs remain under **`/tmp/m7-sibling-adapter.WgFRSb`** and the exact private session directories recorded in their observations. `original-observation-pins.json` binds lossless gzip/screenshot copies to original paths, bytes and hashes. `source-review-pins.json`, `built-review-pins.json` and `browser-library-review-pins.json` are **bounded review component pins, not a final paid instrument manifest**. `protected-unchanged-pins.json` verifies native attestation, transport, repair/accounting/admission, scenario, synthetic sequence, MISSION clone, package/lock wiring, profiles and cloned ledger/journal against departure. No original state is imported from evidence copies.

Next: parent focused source/test/evidence review; any explicitly approved correction; then a newly authorized complete instrument build/pin/preflight. Only after that may the parent allocate a named run, provide the authoritative ALPHA ledger and exclusive writer, approve the IP/egress decision and new execution identity, verify actual **paid-controller → separate loopback owner** attachment and native pinned TLS, and explicitly instruct invocation. No current allocation, final manifest, activation JSON or self-top-up is produced here. Mere dry completion proves neither provider/genuine Vestera/utility/mission success nor StepB acceptance.
