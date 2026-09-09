# Final A5 provider instrument after owner inventory admission

**Mechanical refreeze complete; independent review and explicit paid activation remain pending.** No provider request, DNS/credential probe, reservation allocation or shared-ledger mutation occurred. The raw attester, transport, driver and tests were frozen throughout this refreeze as instructed.

## Exact identity

- Owner inventory commit: **`9cef6310816e9e630851c7df2c188039df2f6077`**. It adds only the reviewed `real-provider-a5-terminal.integration.ts` substrate inventory entry; the credential policy is unchanged.
- Corrected implementation remains **`7b167f5328796d9ed988bb3c926c3c5c6a1b7d86`** plus **`2610b4d3f321a60c0497c6d74bf28ee4b57d6ab2`**. Correction evidence: `7d86df283b2ac330cd5e187c357117610b517352` and [correction.md](../real-provider-a5-terminal-correction/correction.md).
- **Final manifest: `manifest-terminal-v4.json`**, SHA-256 **`1de43141dfbe68902af2bf1d62f52bbdaf72c2f10e6277abc6c0fa759b62b243`**. It pins **3,312 files** at the exact owner inventory commit, including unchanged model, guidance, native tools, app/browser builds, fixture, runtime/native SDK and corrected source/tests.
- `pin-delta.json` proves that the **only changed file pin from v3 is `apps/brunch-agent/test/architecture/boundaries.integration.ts`**. File membership and model bounds are equal. No implementation/test retuning was performed during review.
- `preflight-terminal-v4.json` records this final state and pending activation gates. Credential availability remains explicitly the prior observation, **not rechecked** during correction/refreeze. No validity request was made.

The original v1 packet, v2 candidate, v3 correction manifest/preflight, parent reproduction, HTTP200/201 red counterexamples and both cleanup red controls remain unchanged at their original paths. Their historical verdicts are not silently upgraded. V4 is the manifest proposed for the eventual explicit activation; neither the original unsafe-readiness manifest nor the narrower v2 candidate may authorize the corrected code.

## Final guarded verification

| Check | Result |
| --- | --- |
| Full application suite | **39 files / 313 tests pass**; owner inventory entry removes the last failure. This includes the 26 focused driver/attestation/cleanup tests and their actual built native/ledger child probe. |
| Built native terminal controls (inside the suite) | **13 controls / 15 synthetic HTTPS dispatches / zero paid calls**; missing/invalid evidence and retention faults keep unknown/US$7 held and block another dispatch; legitimate ordinary and multiline CRLF responses settle from explicit final usage. The independent explicit v3 report remains retained separately. |
| TypeScript | Pass, empty diagnostic log. |
| Lint | Zero errors, 18 pre-existing warnings. |
| Source/build/model/fixture pin comparison | All 3,312 final pins verify; exactly the owner inventory source pin differs from v3. |
| Protected state | Original evidence packets and shared cloned-ledger/journal bytes unchanged; no production/runtime/accounting or package/lock modification in this refreeze. |

All commands used the verified native-local-delivery deny-network profile. The code's raw-attestation scope remains the [correction packet's explicit limit](../real-provider-a5-terminal-correction/correction.md): it is **not a generic production accounting fix**. Ungated normalized Pi usage still cannot prove the presence of terminal native output usage. No fake provider result, guessed counter, invoice claim, silent retry or additional store is introduced.

Commands from repository root:

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent test:unit
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:tsc
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:eslint
```

The final manifest was generated under the same denial using `instrumentManifest()`, with an assertion that v3's file set and model bounds match and only the owner inventory path changed. Required JSON formatting precedes the retained final SHA-256. `manifest-verification.log.gz` retains the subsequent check of every final pin. No credential resolution is part of this refreeze.

## Still owner-held

Actual shared totals remain the owner's **5 calls / US$0.09113535**. There is still **no named active reservation, approved provider IP, egress decision or sole-writer paid lease**. No synthetic TEST ledger is a paid allocation. The proposed run remains `a5-real-provider-20260909-r1`, at most20 underlying calls/US$15, exact `anthropic/claude-sonnet-4-6`, per-call output4096 and US$7 hold covering the unchanged US$6.06144 catalogue bound.

After independent review, the parent supplies the one authoritative ledger, exclusive writer delegation, numeric provider IP and concrete egress decision. The candid OS TCP443-only plus exact pinned native TLS plus loopback-only Chrome layering remains unactivated. No OS hostname/IP-filtering claim, build/codegen under paid egress or unguarded fallback is made.

The activation must reference this **v4** path/hash, with the other required fields from the original driver handoff. Only after explicit parent activation, the proposed command is:

```sh
sandbox-exec -f apps/brunch-agent/src/evaluations/real-provider-a5/paid-provider.sb env BRUNCH_CHAT_MODEL=claude-sonnet-4-6 HASH_OTLP_ENDPOINT='' YARN_ENABLE_NETWORK=0 COREPACK_ENABLE_NETWORK=0 node --experimental-strip-types apps/brunch-agent/src/evaluations/real-provider-a5.ts real "$PWD/libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/a5-real-provider-20260909-r1" /OWNER/PROVIDED/activation.json
```

Real-provider acceptance/tool interpretation, useful explanation, genuine testimony, Step A and Step B acceptance are not awarded by this packet. Nothing was pushed.
