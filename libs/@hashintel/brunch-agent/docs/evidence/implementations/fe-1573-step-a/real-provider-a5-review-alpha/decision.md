# Current-A5 paid readiness — activation withheld

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Reviewed instrument and decision

Worker branch `ln/fe-1573-real-provider-a5` proposed implementation `efeb4921ca39d7da8878016b022ed8628b8b5416`, evidence through `f93d62a5404dcd3379971dc5940b59e610f18586`, based on `c41aeb54ca83d3aeb6f6678c9e2d318d120b5e33`. Its original manifest SHA-256 is `030ad3c7bc6886687d9b8537e28788d829c920f544d7c67bde2bf42dcef11c17` for 3,310 source/build/guidance/tool/fixture/runtime files. This review does not integrate or activate that candidate.

**No reservation or provider egress is granted.** The integration owner accepts the independently reproduced terminal-usage finding below and has delegated the bounded offline correction to the driver worker. Preserve the original readiness/manifest and this failure; produce a separately pinned corrected instrument for re-review. Shared actual totals remain **5 calls / US$0.09113535**. The proposed 20-call/US$15 allocation, 4,096-token cap and US$7 hold remain ceilings, not an active allocation.

## Reproduced accounting blocker

The installed native Anthropic parser accepts an otherwise successful SSE sequence with initial usage but missing terminal output usage. A correct model identity and `message_stop` do not prove final usage: the parser retains the initial counter and the normalized accounting layer can treat it as complete.

Both the independent reviewer and integration owner supplied this synthetic sequence to the installed `anthropicProvider().streamSimple` and passed the returned result into the actual `RequestLedger`:

- `message_start`: correct `claude-sonnet-4-6`, 100 input / 1 output token.
- Text content, then `message_delta` with `stop_reason: "end_turn"` and **no usage**.
- `message_stop`.

Both observed one synthetic dispatch, normalized `stopReason: "stop"`, 101 total tokens, ledger `status: "complete"` and US$0.000315 settlement. The US$7 hold was released despite absent final usage. The proposed driver's raw model-ID guard would admit these bytes. This is a concrete missing/uncertain-accounting counterexample, **not evidence that the real provider normally omits usage**.

The owner replay ran under the retained deny-network profile from the fixed worker worktree: `sandbox-exec -f libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery/deny-network.sb node --experimental-transform-types /tmp/m7-paid-terminal-owner.E2t8Ne/probe.mjs`. The source differs from the reviewer's only in its fresh exclusive-create TEST output directory. No real auth or HTTPS request occurred. This crosses the installed native provider and production ledger, not the whole browser/application composition; the correction must test that composed boundary too.

## Authorized correction and limits

At the evaluation driver's existing buffered native-response gate, require valid native terminal usage before releasing successful bytes to Pi. Missing/invalid final usage must leave the request unknown with its hold outstanding and refuse further dispatch. Use the actual installed native contract, legitimate complete-response controls and the exact missing-usage counterexample. Do not fill in absent counters, rewrite provider bytes or relax catalogue checks. The normalized-only generic accounting path's limitation must remain explicit; this is a required raw attestation for the bounded instrument, not a claim of universally repaired production accounting.

Also make retention-callback failures in `transport.ts` reject through the transport promise rather than escape incoming/outgoing error callbacks as uncaught exceptions. Source inspection identifies that cleanup weakness; it has not yet been independently fault-injected. The prior unknown ledger and stale lock fail closed, but orderly cleanup/evidence should survive. No upstream patch, new store, provider/model change or broad accounting redesign is authorized by this correction.

## Other boundaries and deferred activation

The independent reviewer verified the listed frozen files and reran **22/22** focused tests plus unpaid preflight. Real mode uses the native HTTPS transport and existing built ChatAgent/browser path; only explicit dry mode imports scripted responses. Request artifacts omit credential-bearing headers/options/environment. The scenario is pre-authored synthetic testimony over a labelled prepared fixture, not Vestera, and the result remains unadjudicated rather than treating completed submissions as useful A5 success.

The proposed egress policy is honestly **OS outbound TCP 443 plus a trusted native endpoint/IP/TLS restriction**, not OS destination filtering or protection against arbitrary parent-process HTTPS code. It pins the endpoint/method, owner-approved numeric lookup, TLS verification/SNI and no DNS/proxy/redirect/retry; Chrome runs with a narrower loopback-only profile and no provider environment. macOS rejected numeric/hostname remote filters. Applying the broader profile inside the denied parent also failed; no standalone paid profile or real TLS handshake has yet been proved. The integration owner has not accepted or activated that policy here; after correction/re-review, a concrete decision, address, standalone boundary checks, frozen manifest and exclusive shared reservation are still required.

`artifact-manifest.json` retains source/artifact hashes for the original independent report and commands, its initial unsupported strip-only failure, successful falsifier, and the owner's distinct replay/TEST ledger. Files are gzip-compressed without rewriting the source bytes. Original evidence and live shared ledgers are untouched. No provider acceptance, billing invoice, broader class admission, genuine testimony, semantic utility or Step A/B verdict follows from this review.
