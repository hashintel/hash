# Mission 6b — Local reconciliation verification

## State and pins

Local implementation candidate, **not mission acceptance or a real microphone/browser witness**. Recorded on 2026-09-07. Implementation approval did not waive provenance, human acceptance, latency or newly observed cancellation/reopen limits. No paid calls, Linear writes, PR submission or changes to KA's original branch/PR were made.

- Candidate code: `c649eec3ba5d31b27294f6a870a0a5d676b79fd8`.
- Authority: `ecee802ce3`; source import: `66ac62693f`; import test joins/provenance: `221f3e53a0`.
- Mission 6 parent: `01649899eb65ab8d7a8fec9407dc3ea613128264`; Mission 5: `7538264feeb1487aa494e991831bed0338ae76df`.
- KA source contribution: `58f75840804766a84ce85b9daab5b5194f3875ec..be56a18ff0244c5750a8702e9c7f45c0b607dc06`, still unchanged at inspection. See [import provenance](import.md).
- Mission 7 remains at `86e37556e363c06bdd5700b67ba58991363ba5a3` when this record is first written; it has not yet moved above this candidate.

## Demonstrated repairs

The repaired parent already holds ordinary SDK automatic follow-up busy. The additional code addresses observed defects at deferred browser execution and canonical history, not a replacement scheduler.

| Discriminator | Before repair | Candidate evidence |
| --- | --- | --- |
| Reordered cumulative client-tool results | Same idempotency key, different serialized payload order | `transport-aisdk/test/chat-transport.test.ts`: identical payload bytes and key after reordering |
| Folded continuation origins | Voice call IDs on a continuation disappeared when it folded into the root message | `transport-aisdk/test/transcript.test.ts`: surviving origins are merged |
| Reopened aborted entry followed by a completed reply | No per-message stopped metadata | Canonical settlements identify only the aborted entry; transcript and contents tests retain its label without a global Stop banner |
| Stop before deferred browser execution | Follow-up withheld, but the deferred mutation still ran | Panel regression asserts the not-yet-started mutation does not run |
| Textless automatic-tool failure | Hosts saw `ready` and Voice could remain owned | Panel records matching `output-error`, retains visible detail, exposes terminal error; combined test releases Voice through the error path |
| Durable aborted history with pending tool input | Reopening executed the stopped tool | Panel skips runnable parts of canonically stopped messages |
| StrictMode setup/cleanup/setup | Cleanup cancelled the execution timer but retained its claim; recovered work stayed busy | Pending timer claims are released on cleanup; initially hydrated StrictMode test executes exactly one continuation |
| Stop in conversation A, then switch to B | A's terminated generation suppressed B's recovered work | Conversation changes invalidate the generation and reset local turn presentation; B executes once |
| Async command from A completes after switch to B | A's output scheduled an unsolicited continuation in populated B | Generation and conversation ownership are checked before insertion and continuation; deferred-layout test observes no send to B |
| Preamble commits after cancellation finishes | A later ready render spoke the previously withheld prose | Bridge retires stopped segments; combined preamble/Stop test observes no speech after a repeated update |

A read-only independent review identified the last four discriminators (three findings, with two conversation-identity cases). They were reproduced before repair and pass afterward. An initial conversation test fixture incorrectly returned an endless empty finish and used the wrong composer-control prop; it was corrected before adjudicating the identity cases. The resulting red tests, not that harness failure, support the findings.

## Combined production-component test

`apps/petrinaut-website/src/main/app/voice-interview/voice-browser-tools.integration.test.tsx` mounts the published `Petrinaut` component, its actual panel and `useChat`, production `createBrunchPanelTransport`, admission tracker, `submitVoiceInputWithAdmission`, canonical speech selection and `RealtimeBrunchBridge`.

Five cases cover browser continuation with and without preamble, textless invalid browser input, and local withholding with and without preamble. They assert busy ownership while the continuation is held, original tool-call identity in the delivered signal, exact canonical speech after continuation, visible terminal failure, and no speech or continuation after local Stop. The preamble Stop case repeats the final update to detect speech resurrection.

Flue send/wait events, media input/output and cancellation acknowledgement are controlled by the test. The browser tool reads documentation; it does not prove the real fixture mutation, microphone/VAD timing, audible cancellation, network route or fresh-tab persistence. The panel mutation test separately checks Stop-before-execution. These distinctions prevent a component integration pass from being presented as the required product witness.

## Verification run

At the candidate code state, all **39/39** tasks passed, with **0 cached** tasks:

```bash
yarn exec turbo run build test:unit lint:tsc lint:eslint --filter @hashintel/brunch-agent --filter @hashintel/brunch-agent-binding-flue --filter @hashintel/brunch-agent-plugin-sdcpn --filter @hashintel/brunch-agent-transport-aisdk --filter @apps/brunch-agent --filter @hashintel/petrinaut --filter @apps/petrinaut-website --force --continue=always --output-logs errors-only
```

The scoped unit suites passed **1,317 tests in 166 files**:

| Package | Files | Tests |
| --- | ---: | ---: |
| Brunch core | 11 | 93 |
| Flue binding | 5 | 18 |
| SDCPN plugin | 2 | 11 |
| AI SDK transport | 4 | 41 |
| Brunch application | 19 | 109 |
| Petrinaut | 84 | 687 |
| Petrinaut website | 41 | 358 |

Additional checks: `yarn workspace @local/petrinaut-arch-docs lint:arch-docs` passed (70 layers, 356 edges, 736 files, 71 generated pages, 38 authored pages); changed TypeScript formatting, the three changed publishable/user Markdown files and `git diff --check` passed. Commit hooks passed formatting and Markdown lint. Existing non-blocking React Compiler and Node configuration warnings are not repaired here. Brunch Markdown is explicitly excluded from the repository formatter and Markdown lint, so those tools are not claimed as checks of this record. Full Local CI/GitHub CI and live screenshot/audio evidence were not run; no push occurred.

## Acceptance disposition — accepted with explicit limitations on 2026-09-07

Lu Nelson accepted the narrowed Mission 6b claim after the real owner witness in [`owner-witness-2026-09-07/witness.md`](owner-witness-2026-09-07/witness.md). That witness exposed and repaired cumulative cross-step client results and the fixture's non-causal prepared answer, then passed the negative control, explicit spoken mutation, Your turn, coherent revision-2 settlement, Tab-B continuation, active-submission durable Stop, Tab-C stopped-entry recovery, and playback controls. The full pre-registered telemetry bundle was not retained; the owner accepted that evidence limitation explicitly.

| Obligation | Disposition |
| --- | --- |
| Source preservation, scoped catalogue, canonical normalization, deterministic admission and inherited automated contracts | Imported with provenance; scoped suites pass |
| Deferred execution, termination and history joins above | Discriminated and repaired locally; the owner witness additionally proved one result per causal step after the cross-step accumulation repair |
| Exact Stop timing during held output insertion and insertion rejection through the full combined host | Not separately demonstrated by the owner witness; source/component cases remain bounded automated evidence rather than a claim that every race was witnessed |
| Real fixture spoken mutation, Your turn, Stop, coherent bundle, Tab-B continuation and compact/expanded inspection | Passed by the owner witness, including one causal mutation, no duplicate/autoplay, canonical active-submission abort and stopped-entry recovery |
| Direct spoken-user Voice chip after snapshot-only reopen | Observed missing and explicitly deferred by Lu; canonical text survives, but no direct-user Voice-origin claim is made after hydration |
| Reload-safe cancellation of a locally withheld tool continuation | Explicitly deferred with the narrowed Stop claim below; no invented durable marker |
| Comparative audible latency | Explicitly deferred; Mission 6b makes no comparative latency or no-regression claim |
| Human acceptance and original PR retirement | Narrowed mission claim accepted by Lu; KA's PR remains untouched and requires separate retirement authorization |

### Local withholding is not a durable stopped record

When a Flue tool-call step has already completed, the parent Stop adapter can return `already-settled`. The panel can withhold pending browser execution and its follow-up, and Voice can release that logical turn without speaking its late prose. The bridge labels this outcome `withheld`, not a fabricated Flue abortion. Canonical history still records the original step as completed with pending tool input.

A fresh process cannot infer the local withholding from that snapshot. Pending completed-step tools remain recoverable work, whereas genuinely aborted submissions now project `metadata.stopped` and are not executed. The successful aborted-entry tests do **not** solve this local-withholding/reopen case. User docs explicitly warn that reopening can recover the locally withheld tool as pending work.

Resolving that distinction durably requires a supported recording/termination boundary. Do not add a browser sidecar, forge aborted settlements, admit an extra hidden turn, or silently disable ordinary pending-tool recovery. Lu accepted the narrower behavior on 2026-09-07: Stop is durable while the Flue submission is active; after a tool-call step settles, locally withheld browser work may reappear as pending after reopen, and already-applied mutations are not rolled back. Re-enter when the platform supplies a durable canonical withholding/cancellation operation or a product consumer makes this race load-bearing.
