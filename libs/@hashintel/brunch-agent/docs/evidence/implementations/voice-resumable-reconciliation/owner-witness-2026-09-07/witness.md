# Mission 6b owner witness — 2026-09-07

## Verdict

Lu Nelson accepted Mission 6b on 2026-09-07 with the explicit claim and limitations below. The accepted local product path is: completed Voice transcript → canonical Brunch conversation → explicit half-duplex handoff → one browser mutation and verification → coherent revision 2 → Tab-B continuation → durable active-submission Stop → Tab-C stopped-entry recovery without autoplay or resumed work.

This witness does not establish comparative latency, direct spoken-user Voice attribution after hydration, or durable recovery of browser work withheld locally after its Flue tool-call step has already settled. Those claims were explicitly deferred rather than passed.

## Environment and pins

- Branch: `ln/fe-1580-reconcile-voice-resumable-workpiece`.
- Tested implementation head after the two witness repairs: `48e2b66666df05034777f9410024c2e1228c86be`.
- Causal client-result repair: `1e238f498e`.
- Explicit-evidence fixture repair: `48e2b66666`.
- Local entrypoint: `yarn dev:brunch`.
- Browser fixture: `http://127.0.0.1:4915/?brunch-fixture=crew-reservation-v1` in a fresh private browsing context after origin storage was cleared.
- Canonical conversation: `conv_01M1Y4SPKHEKPVFVAMQG9QNH4Y`.
- Model reported by the canonical stream: `claude-haiku-4-5`.
- Secrets, authorization headers, SDP, audio, provider payloads, and browser principal are not retained.

## Discovery run and repairs

The first attempted spoken confirmation was transcribed canonically as only `SDCPN`. The pre-repair agent nevertheless inferred the intended fixture correction from revision zero, issued two browser reads across separate model steps, applied `addArc`, and then received a cumulative client-result signal containing the new mutation result plus both stale reads. Tool results were sorted by call id rather than causal order, so the continuation misread the old definitions as post-mutation verification and reported an anomaly. The browser showed the arc while the coherent-bundle guard correctly refused settlement and retained revision zero.

Database inspection established that the duplicate-looking reads were not duplicate execution of one canonical tool call: they were distinct calls from successive assistant steps, accumulated into later AI SDK message state. `completedClientToolResults` scanned the entire folded assistant message on every automatic continuation. The first repair added a red public-seam test at `createFlueChatTransport().sendMessages()` and changed collection to the most recent assistant step containing client-tool output. A second real attempt exposed a mixed server/browser batch: `activate_skill` continued on the server while `getLatestNetDefinition` completed in the browser, leaving a later server-only step after the pending browser result. The regression was extended to that exact topology before the collector was corrected. The passing negative and positive runs each admitted one client result per signal, with no stale cumulative results.

Revision zero also contradicted the model-facing fixture instruction: it said to wait for confirmed true-user evidence while the prepared workpiece already stated crew reservation as fact and described the missing arc as an approved correction. A red fixture test preceded the repair. Revision zero now labels crew reservation as an unconfirmed hypothesis, and the plugin instruction says fragments, topic labels, inspect/explain requests, and unrelated messages cannot authorize mutation.

The failed databases remain outside the repository at `/tmp/brunch-agent-failed-witness-20260907T134055Z` and `/tmp/brunch-agent-negative-control-error-20260907T143604Z` for the life of this machine session. They are diagnostic inputs, not accepted evidence.

## Accepted run

1. The prepared fixture settled at revision zero with the target arc absent and its Markdown workpiece available.
2. Voice connected and the microphone check responded.
3. Lu supplied the negative control `SDCPN`. Canonical submission `sub_ik_9942648a081a4a1d257dc20b41e0d9ea` completed. Brunch inspected the net once, did not call `addArc`, kept revision zero settled, and asked for explicit confirmation. The response was much more verbose than necessary; this is interaction strain, not a correctness failure.
4. Lu used **Your turn**, waited for fresh listening, and said: `Starting final inspection reserves the single dispatch crew immediately. Sign-off releases it. The timing, failure, and recovery behavior are still unknown.` Canonical submission `sub_ik_b15d9c3a910649fef2d5a559db61a6ee` completed.
5. The assistant emitted one model-produced workpiece before construction, then issued `addArc` call `toolu_01XoXQED2JUy5Xk6MiH3axDs`. Result submission `sub_ik_f7f80b5cd8b6e3360d6a8d1bfca86f86` contained only that result and reported `applied: true`.
6. A later, separate `getLatestNetDefinition` call `toolu_01MaeDyPhW4iuULiJvWkpKeE` verified the changed document. Its result submission contained only that read. The assistant emitted the final full workpiece in another message, so revision 2 correctly represents distinct pre-mutation and post-verification model-produced workpieces rather than two user turns.
7. The browser showed exactly one standard weight-1 input arc from `Dispatch crew available` to `Start final inspection`, a settled revision-2 bundle, one visible canonical reply, and one audible rendering.
8. Tab B reopened revision 2 with the target arc, conversation, and workpiece intact. No audio autoplayed and no work or mutation duplicated. The typed follow-up `What remains unresolved in this workpiece? Do not mutate the net.` completed without another `addArc`.
9. Lu started another Voice turn asking for a detailed account of unresolved timing, failure, and recovery, exited Voice mode, and pressed durable Stop while the response was active. Submission `sub_ik_336c2a985788889d677697626db20ba1` has `abort_requested_at` and canonical outcome `aborted` with `submission_aborted` error.
10. Tab C retained the streamed partial prose as formatted headings/list items with a message-level **Response stopped** label. The final phrase remained honestly truncated. Revision 2 and the target arc stayed coherent; no audio autoplayed and no tool work resumed.
11. **Read full response**, **Repeat question**, stopped-response gating, and compact/expanded Voice controls behaved as specified. Two additional non-mutating test turns used for those controls remain visible in `canonical-summary.json`.

## Owner dispositions

- **Direct spoken-user Voice attribution after hydration — deferred truthfully.** Live Voice chips were visible, but both disappeared after Tab-B snapshot hydration. Flue/AI SDK 2.0.3 does not retain caller Voice metadata. The accepted claim is that spoken text is canonical and durable and client-tool Voice origins survive; direct spoken-user origin is not shown after reopen until the upstream SDK exposes durable caller metadata. No local sidecar, text encoding, or Flue patch is authorized.
- **Post-settlement local withholding — deferred with a narrowed Stop claim.** Durable Stop is accepted for active Flue submissions, as witnessed. If Flue has already settled a tool-call step, browser work withheld locally in the current process has no canonical withholding record and may reappear as pending after reopen. Already-applied mutations are not rolled back. Re-enter when the platform provides a durable canonical withholding/cancellation operation or a product consumer requires this race to close.
- **Comparative audible latency — deferred with no latency claim.** The required 10 donor + 10 candidate campaign did not run. Re-enter if latency becomes a release criterion, measured complaint, or performance regression investigation.
- **Interaction strain — accepted, not erased.** The negative-control response recited excessive net detail before asking the necessary question. Durable Stop was poorly discoverable while Voice was active: Lu had to exit Voice mode before using the streaming Stop action. These are future UX inputs, not evidence that the accepted control path failed.
- **Evidence bundle limitation — accepted explicitly.** The run retains canonical submissions, settlements, tool ids, workpiece-message ids, owner observations, and two screenshots. It does not retain the pre-registered full `voice-events.jsonl`, browser network-route export, raw canonical snapshot, or audible latency samples. No missing artifact is inferred or manufactured.

## Artifacts

- [`canonical-summary.json`](canonical-summary.json) — sanitized SQLite-derived submissions, tool calls, workpiece sources, and owner-observed browser assertions.
- [`failed-cumulative-results.png`](failed-cumulative-results.png) — first-run UI showing the out-of-order reasoning/tool chain and eventual incoherent state before repair.
- [`passing-negative-control.png`](passing-negative-control.png) — repaired negative control showing one net read, no mutation, and an explicit confirmation question.

## Automated verification

The red/green transport command was `yarn workspace @hashintel/brunch-agent-transport-aisdk test:unit chat-transport.test.ts`. Before repair it dispatched `mutation-latest,read-before-1,read-before-2`; the mixed-batch refinement then reproduced `The client-tool follow-up has no completed result.` After repair it passes 19 tests.

Final focused checks observed during the witness:

- `yarn workspace @hashintel/brunch-agent-transport-aisdk test:unit` — 42 passed.
- `yarn workspace @hashintel/brunch-agent-transport-aisdk lint:tsc` — passed.
- `yarn workspace @hashintel/brunch-agent-transport-aisdk lint:eslint` — no errors; two pre-existing sequential retry-test warnings.
- `yarn workspace @hashintel/brunch-agent-plugin-sdcpn test:unit` — 11 passed.
- `yarn workspace @hashintel/brunch-agent-plugin-sdcpn lint:tsc` and `lint:eslint` — passed without warnings.
- Focused prepared fixture and settlement tests — 14 passed.
- `@hashintel/petrinaut` `ai-assistant-panel.test.tsx` — 56 passed; existing React Compiler warnings only.
- Focused website transport, Voice preview, browser-tool integration, and local-storage app tests — 32 passed.

These focused checks and the owner witness establish the accepted local claim. They do not replace the repository-wide final check or create a remote deployment claim.
