# Raw terminal-usage and retention correction

## Status

**Correction ready for re-review; no paid activation, provider request, reservation allocation or shared-ledger write.** Final source: `2610b4d3f321a60c0497c6d74bf28ee4b57d6ab2`, following correction milestone `7b167f5328796d9ed988bb3c926c3c5c6a1b7d86`. The original implementation/evidence commits `efeb4921ca`, `9afe0bcb81`, `f93d62a540` and the entire first `real-provider-a5-readiness/` packet are preserved unchanged. That first packet was **not paid-ready**: the owner's independently reproduced missing-terminal-usage counterexample invalidated its accounting-readiness claim. No reservation was activated against it.

Final separately named instrument: **`manifest-terminal-v3.json`**, SHA-256 **`6aeb50b2935a6cb7fdfb659ab1d0acad511c431ddcdefb3564bfaeafe245f068`**, **3,312 exact file pins**. `preflight-terminal-v3.json` records bounds and pending gates without a new credential-resolution/validity probe. The earlier `manifest-terminal-v2.json` / `preflight-terminal-v2.json` retain the first correction milestone; a further SDK-success-status counterexample was then exposed and fixed before re-review. **Only v3 is proposed for review/activation.** This versioning concerns mechanical accounting guards, not a permitted teaching/pane adjustment; the frozen synthetic user, fixture, model and guidance remain unchanged.

## Reproduced blockers

The parent reproduced the independent review under deny-network: correct native model, `message_start.usage = {input_tokens:100, output_tokens:1}`, native text, `message_delta.delta.stop_reason = end_turn` **without terminal usage**, followed by `message_stop`. Installed Pi returns `stop` with 101 normalized tokens; unchanged `RequestLedger` settles `complete` at US$0.000315 and releases the US$7 hold. `owner-reproduction/` retains the parent's exact script/result/stderr, not a claim that Anthropic normally emits this malformed response.

Our new `test/real-provider-a5-terminal.integration.ts` reproduced this through the **built ChatAgent registration + actual native provider/SDK + the evaluation's real-mode HTTPS transport + actual RequestLedger**. Only socket events and test auth are synthetic; there is no replacement native parser or guessed settlement. Before correction, `terminal-red.log.gz` and `mounted-red/` show `actual: complete`, `expected: unknown` on that exact malformed response.

The two cleanup controls also failed before correction: when retained-evidence writing threw during either incoming or outgoing socket error delivery, the exception escaped the EventEmitter callback and the transport promise stayed pending. `cleanup-red.log.gz`: **2 failed / 22 passed**, both escaping `TEST retention failed`.

During correction review, we exercised HTTP 201 carrying the same missing terminal usage. The SDK treats **all 2xx** responses as successful, so a guard restricted to HTTP 200 still settled that response incorrectly. `terminal-201-red.log.gz` and `mounted-201-red/` retain this additional actual mounted counterexample. The final guard covers every SDK-success 2xx status. This is not a claim that the pinned Anthropic endpoint normally returns 201.

## Minimal owning-boundary correction

All changes are evaluation driver/helpers/tests; production accounting, registration, admission, canonical tools, browser semantics, runtime patches and dependencies are unchanged.

- New `src/evaluations/real-provider-a5/native-response.ts` attests raw buffered SSE evidence **before successful bytes can reach Pi**. It requires one matching native message identity/model, explicit initial input/output counters, explicit cumulative `message_delta.usage.output_tokens`, a terminal stop reason with that usage, and `message_stop` in order. Counts must be non-negative safe integers; cumulative output cannot regress. Missing/null/string/fractional/negative output evidence fails. Optional/nullable delta input/cache fields retain the native contract's earlier input evidence; this validator never supplies missing counters or calculates a settlement.
- SSE framing follows the installed native parser's event dispatch: CR/LF/CRLF, multiline `data:`, comments and EOF flush; only recognized native message events attest usage. A ping/unknown event cannot masquerade as a billing delta through its JSON `type`. Known event/payload types must match. Malformed JSON/UTF-8, duplicated lifecycle events, missing stop or events after completion refuse. Billing evidence is not repaired with Pi's permissive JSON repair.
- `transport.ts` retains raw bytes first, then requires the attestation for **every 2xx response**, before creating the SDK-consumed `Response`. Original status/body bytes are not replaced. Redirect refusal, exact endpoint/model/output bounds, pinned numeric lookup, TLS/SNI and no-retry behavior remain. The driver uses the same attester for native identity/terminal-usage metadata rather than a second line-by-line model-ID interpretation. The explicit dry browser mode also exercises this attester on its labelled synthetic response bytes.
- Both socket error callbacks and end-of-response failures now use one guarded failure path. A retention exception becomes the promise rejection, the owned deadline is cleared and the outgoing request is destroyed. The original error handlers no longer call a fallible `save()` outside a catch. The existing driver's `finally` closes browser/application/listener; no hanging request or uncaught retention exception is used as a settlement.

**Scope limit:** this is a raw-attestation guard for this explicit evaluation instrument, **not a generic production accounting fix**. Unchanged `RequestLedger` sees Pi's normalized `AssistantMessage`, which still cannot establish whether native final output usage existed or native model identity matched. The parent's ungated counterexample remains relevant outside this instrument. The raw gate is therefore load-bearing and must remain in the frozen real-provider path. No invoices, unknown-cost reconciliation, fallback counter synthesis or new store are introduced.

## Native/built proof

Final explicit probe: **13 controls / 15 synthetic HTTPS dispatches / zero paid calls**. Each case uses a disposable TEST ledger and fresh mounted conversation; actual production registration persists the prelaunch row and terminal outcome. Native catalogue, stream entrypoints, SDK preparation/parsing, buffered admission and RequestLedger are real. Test auth alone is supplied by the existing `installFauxProvider` factory hook's constant TEST auth resolver, never a live environment credential or canned provider parser. The original red used an explicit TEST environment sentinel; the ordinary hermetic credential scanner rejected that source pattern, so the final test uses the existing accepted auth-only test seam rather than weakening that scanner.

| Control | Final observation |
| --- | --- |
| Exact missing terminal usage, HTTP 200 | One native dispatch; unknown, no `actualUsd`, US$7 held; next mounted submission refuses before another dispatch. |
| Same malformed response, HTTP 201 | Same unknown/US$7/next-dispatch refusal. All SDK-success statuses require raw attestation. |
| Usage object missing `output_tokens`; null, string, negative, fractional or regressed output | Each remains unknown with US$7 held and blocks the next dispatch. No initial positive output count is reused to settle. |
| Missing `message_stop` | Unknown/held; raw evidence retained, no invented completion. |
| Incoming socket error plus retention failure | Promise rejects without an uncaught callback exception; actual RequestLedger remains unknown/held and blocks the next dispatch. |
| Outgoing socket error plus retention failure | Same result and owned cleanup. |
| Legitimate complete response | Explicit final output 20 replaces initial output 1 through the **native parser**; actual normalized usage is input100/output20, catalogue estimate US$0.0006, complete with no hold. A second legitimate request is allowed and counted. |
| Legitimate multiline CRLF SSE and nullable delta input/cache fields | Same correct native parsing/settlement and second counted dispatch. No byte rewrite or invented final input counters. |

`mounted-v3-final/` retains exact native SSE bodies, all first outcomes/histories and final control report. `mounted-final/` retains the earlier 12-control milestone, not falsely relabelled as the final 13-control run. `mounted-201-red/` preserves the narrow 200-only correction's failure. The apparent zero normalized usage on gated errors is Pi's actual error result before raw bytes were released; the raw positive initial usage remains in the retained SSE. It is not evidence that the underlying request was free: the ledger stays unknown with US$7 held.

Focused tests: **26/26**, including the mounted child probe, raw SSE/identity controls, both uncaught-retention falsifiers, existing endpoint/TLS/raw-byte/redirect controls, reservation caps, writer exclusion and three-rejection budgeting. With unchanged accounting/admission/registration tests: **65/65 pass**. Typecheck passes; lint has zero errors and 18 existing warnings. The existing built accounting oracle still passes **13 outcomes**; its normalized-only limitation is not rebranded as fixed.

Corrected actual-Chrome dry process: **five synthetic native requests**, one real browser read/result continuation, zero rejected operations/browser/listener/non-origin errors. It runs the raw attester but still does **not** construct or answer why; no new faux A5 success claim. Captured pane/history/storage/results are under `browser-v3-final/`.

Entire app suite on final source: **312 passed / 1 failed**. The only failure is the deliberately parent-owned hermetic substrate inventory's missing entry for the new integration probe. The earlier intermediate two-failure suite (including the rejected TEST env-credential source pattern) is retained; the credential-policy failure is corrected in the final test source. No production test oracle or credential policy was relaxed. No all-green full-suite claim is made until parent reviews/adds the entry below.

## Parent-owned insertion, not applied

Add to `SUBSTRATE_INTEGRATION_ENTRY_POINTS` in `apps/brunch-agent/test/architecture/boundaries.integration.ts` after review:

```ts
"apps/brunch-agent/test/real-provider-a5-terminal.integration.ts":
  "Boots the built ChatAgent with its actual native Anthropic stream methods, SDK parsing, accounting and admission. The existing test factory hook supplies only constant synthetic auth; HTTPS socket events are mocked at the real-mode pinned transport. Disposable TEST ledgers prove missing/invalid terminal usage and retention errors remain unknown with US$7 held and block another dispatch; valid complete and multiline CRLF responses settle correctly. No live credential, listening service, DNS or external provider request.",
```

The existing `test/real-provider-a5.test.ts` now invokes that probe in an isolated child, so no package script is necessary. The worker has not edited the shared inventory. Parent should coordinate its insertion and the resulting final manifest refresh before activation, because the manifest deliberately pins test/inventory source as part of the instrument.

## Commands and instrument freeze

All commands ran under the previously verified native-local-delivery deny-network or loopback-only profiles. No standalone paid-profile launch, DNS resolution, credential validity probe, live ledger write or upstream acquisition occurred.

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
sandbox-exec -f "$E/deny-network.sb" node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-terminal.integration.ts
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent exec vitest run --config vitest.config.ts test/real-provider-a5.test.ts test/provider-accounting.test.ts test/provider-admission.test.ts test/provider-registration.test.ts
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:tsc
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:eslint
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent test:unit
sandbox-exec -f "$E/deny-network.sb" env HASH_OTLP_ENDPOINT='' node --experimental-strip-types apps/brunch-agent/test/provider-accounting.integration.ts
sandbox-exec -f "$E/loopback-only.sb" env YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5.ts dry /tmp/TEST-a5-terminal-v3-browser
```

The new manifest was generated under deny-network by calling the existing `instrumentManifest()` and writing a **new** `manifest-terminal-v3.json`, then applying required repository JSON formatting and hashing it. No credential resolution was performed during the correction freeze; `preflight-terminal-v3.json` explicitly carries the prior availability observation as prior, not freshly verified. The real-mode launch still requires its configured-provider credential check and explicit activation. All source/build/model hashes must verify before launch. The original manifest has not been overwritten or claimed to match corrected source.

Model/bounds unchanged: **anthropic/claude-sonnet-4-6**, 4,096 output tokens, US$6.06144 whole-context catalogue bound covered by a US$7 hold, proposed at most20 calls/US$15 inside total200 calls/US$100. Actual shared totals remain **5 calls / US$0.09113535**, no active reservation. The TCP443-plus-exact-pinned-native-TLS-plus-loopback-browser policy remains only a parent-reviewed candidate, not an activated egress decision.

Proposed runId remains `a5-real-provider-20260909-r1`; no calls have been made under it. After re-review, inventory coordination and **explicit parent allocation/egress/single-writer instructions**, the command remains:

```sh
sandbox-exec -f apps/brunch-agent/src/evaluations/real-provider-a5/paid-provider.sb env BRUNCH_CHAT_MODEL=claude-sonnet-4-6 HASH_OTLP_ENDPOINT='' YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5.ts real "$PWD/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a5-real-provider-20260909-r1" /OWNER/PROVIDED/activation.json
```

The activation must point to the reviewed current manifest path/hash, not v1 or the v2 candidate, and the one parent-provided authoritative ledger and approved numeric provider IP. No worker-created reservation, speculative settlement, second real ledger, downgrade, teaching retune or unguarded fallback is authorized. Semantic utility, real-provider acceptance and mission acceptance remain unearned.
