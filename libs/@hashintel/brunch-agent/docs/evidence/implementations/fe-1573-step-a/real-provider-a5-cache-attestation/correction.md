# Bounded raw cache-cost attestation correction

## Status and bounded delta

**Ready for the requested focused re-review, not paid execution or another full freeze.** Implementation: **`008b576b6107175ee02d80ed91bd55ba6d79c0f0`**. Only two files changed:

- `apps/brunch-agent/src/evaluations/real-provider-a5/native-response.ts`: compare raw cache partitions with what the pinned native parser can retain; refuse unsupported tier changes, contradictions and unexplained aggregate input loss.
- `apps/brunch-agent/test/real-provider-a5-terminal.integration.ts`: exact mounted negative controls and supported cache/partition positives, with actual ledger usage/cost assertions.

Driver, transport/cleanup, production accounting/registration/admission, runtime, model, guidance, fixture, package/lockfiles, owner inventory and all prior evidence are unchanged. `v4-pin-delta.json` proves only those two source pins differ from v4. `bounded-source-pins.json` pins them and the inspected native parser/cost/SDK contract sources. **It is not a replacement full paid instrument manifest.** Full refreeze is withheld pending this specific review, as instructed.

No paid reservation, provider IP, egress decision or sole-writer lease exists. No credential/DNS/provider probe, actual-ledger write, byte repair, counter injection, replacement settlement or new store occurred. Shared totals remain the owner's **5 calls / US$0.09113535**. V4 and all previous frozen packets, original output-usage failures, HTTP200/201 and cleanup red controls remain unchanged; none is silently upgraded to paid readiness.

## Confirmed cache blocker and exact red

The review and parent independently supplied initial input100/output1, then terminal output20 plus cache-write100 and explicit cache partition **one-hour100/five-minute0**. The attester accepted the numbers, but the native parser updates only total cache writes from a delta; its one-hour count remains the initial zero. The actual ledger therefore settled **US$0.000975**, released US$7 and allowed another request, while the explicit one-hour evidence would correspond to **US$0.0012** at the frozen catalogue. These are synthetic malformed/SDK-unsupported response discriminators, not a claim that Anthropic normally emits them.

`review.md.gz`, `reviewer-bypass.integration.ts.gz` and `parent-replay/` preserve the independent report, exact executed derivative and parent replay. The diagnostic `passed:true` there denotes completed diagnostic execution, not a safety pass.

Our new exact mounted control went red before the correction: `red.log.gz` and `mounted-red/late-one-hour-first.json.gz` show `complete` instead of `unknown`, the understated native estimate and released hold through **built ChatAgent registration → native Anthropic provider/SDK → real-mode pinned transport → actual RequestLedger**. No native parser/settlement was replaced. After correction, the same case is unknown with no `actualUsd`, US$7 held, and no second dispatch.

## Native contract and representability rule

The inspected, pinned implementation supplies the local obligation:

- `@anthropic-ai/sdk/resources/messages/messages.d.ts`, `Usage` and `CacheCreation`: cache creation is a TTL breakdown; its reported one-hour and five-minute counts describe the total created cache input. `MessageDeltaUsage` describes input/read/write/output values as **cumulative**. Nullable/omitted delta input/cache fields are supported by the actual parser as no update.
- Pi `api/anthropic-messages.js` sets `cacheWrite1h` from **message_start only**. Deltas replace explicit non-null input/cache totals but do not consume a later `cache_creation` partition.
- Pi `models.js:calculateCost` prices one-hour writes at twice base input, and five-minute writes as `cacheWrite - cacheWrite1h`. It uses the aggregate `input + cacheRead + cacheWrite` for input totals/tier selection. Consequently an ignored raw five-minute field is harmless only when the resulting total and retained one-hour share imply that exact field; a changed one-hour share is not representable by this unchanged parser.

The attester now retains only ephemeral **comparison registers**, never normalized replacement usage or a durable store. They mirror the pinned parser's initial cache defaults and omitted/null carry so raw declarations can be checked before releasing bytes:

1. A reported cache partition must contain valid non-negative integer one-hour/five-minute counts and sum exactly to the effective raw cache-write total.
2. On the initial message, the reported one-hour share is retained exactly as the native parser will retain it. Without a partition, the existing parser's zero one-hour default remains unchanged.
3. A later reported one-hour share must equal that initial share. Either increase or decrease refuses, rather than allowing Pi to ignore it. A later five-minute update is allowed when the supported total-cache update and unchanged one-hour share represent it exactly.
4. The effective cache-write total must still cover the retained one-hour share. Contradictory totals refuse before SDK parsing/publication.

All successful 2xx responses still require the earlier explicit final output/lifecycle/identity attestation. Raw response bytes are retained unchanged before the gate. Neither this helper nor the tests write corrected counters or costs into the production ledger. The generic normalized-only accounting limitation remains: without this explicit raw gate, the pinned parser/ledger cannot detect a lost late cache tier.

## Input-loss interpretation, separate from cache-tier loss

The initial-input100 → terminal-input0 case with no compensating fields is treated as **unsupported/ambiguous loss of accounted input**, not proof of a universal per-field monotonicity rule. Under the pinned cumulative-used-token contract and the parser's disjoint input/read/write accounting, the aggregate cannot simply lose previously reported used input without an explained partition update. The guard refuses an aggregate decrease and keeps the hold; it does not clamp the new number or invent where tokens went.

Individual fields are expressly **not** monotonic gates. Positive controls allow input100 → input0/read100 at the same aggregate, and input100/read20/write100 → input80/read50/write150 with a consistent cache partition. Both pass through native parsing and settle at their actual normalized estimates. If a future provider contract supports retracting/provisionally estimating the aggregate itself, that is a separate semantic uncertainty requiring owner review; this instrument does not assume such an unreported correction or treat vanished usage as free. The independently decisive cache-tier refusal does not depend on this interpretation.

## Discriminating mounted outcomes

Final explicit probe: **25 controls / 34 synthetic HTTPS dispatches / zero paid calls**. Each control resets the same disposable TEST ledger while the runtime is idle and uses a fresh bound conversation; all per-control observations are retained. The same built registration, native stream/SDK, guarded transport and RequestLedger are used. No actual shared ledger is reset. Existing test auth is a constant synthetic resolver only; no live credential is loaded by the probe. HTTPS events alone are synthetic. Every positive verifies the native input/output/read/write/one-hour counters, catalogue estimate, zero remaining hold, and a second completed counted request with twice the expected total cost.

New negative controls, each with **one** dispatch, **unknown**, **no actualUsd**, **US$7 held**, and the next mounted dispatch blocked:

| Control | Discriminator |
| --- | --- |
| Late one-hour increase | Exact parent input100/output1 → output20/write100/one-hour100/five-minute0 counterexample. |
| Late one-hour decrease | Initial one-hour100 → later one-hour0/five-minute100; the unchanged parser would otherwise retain the old tier. |
| Initial partition contradiction | Total write100, but declared one-hour40 plus five-minute100. |
| Late partition contradiction | Retained one-hour40 and total write100, but later declared five-minute100. |
| Uncompensated input loss | Initial input100 → input0 with no corresponding cache/read increase. |

New supported positives (all output20):

| Control | Actual normalized input / read / write / one-hour | First catalogue estimate |
| --- | --- | --- |
| Initial all-one-hour cache | 100 / 0 / 100 / 100 | US$0.0012 |
| Initial all-five-minute cache | 100 / 0 / 100 / 0 | US$0.000975 |
| Initial mixed cache | 100 / 20 / 100 / 40 | US$0.001071 |
| Supported late five-minute cache | 100 / 0 / 100 / 0 | US$0.000975 |
| Supported input/read/write update with unchanged one-hour share | 80 / 50 / 150 / 40 | US$0.0012075 |
| Compensating input-to-read reclassification | 0 / 100 / 0 / 0 | US$0.00033 |
| Mixed initial cache with nullable delta input/cache/partition fields | 100 / 20 / 100 / 40 | US$0.001071 |

The 13 earlier terminal-output, HTTP201, retention-failure, ordinary-complete and multiline-CRLF controls remain and pass unchanged in obligation. `mounted-green/result.json.gz` and per-control first histories/ledger snapshots retain all observations. No catalogue estimate is presented as an invoice; no TEST amount is a shared paid-ledger settlement.

## Verification and review handoff

- Exact cache counterexample: red at the actual mounted/native/ledger boundary before changing the attester; green afterward.
- Final explicit built probe: **25/25 controls**, 34 synthetic dispatches, zero paid calls.
- Full app suite: **39 files / 313 tests pass**, including the focused wrapper executing the expanded mounted probe. No inventory or ordinary credential-policy change.
- Typecheck passes; lint has zero errors and 18 existing warnings; formatting/diff checks pass.
- All execution used the verified native-local-delivery deny-network profile. No new browser/build/effect semantics or genuine/real-provider claim is added.

Commands from repository root:

```sh
E=libs/@hashintel/brunch-agent/docs/evidence/implementations/fe-1573-step-a/native-local-delivery
sandbox-exec -f "$E/deny-network.sb" node --experimental-strip-types apps/brunch-agent/test/real-provider-a5-terminal.integration.ts
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent test:unit
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:tsc
sandbox-exec -f "$E/deny-network.sb" yarn workspace @apps/brunch-agent lint:eslint
```

Please re-review this bounded cache/input-evidence delta and its exact red/green before any full refreeze or activation. The proposed model/run/20-call/US$15 ceiling, 4096-output/US$7 hold and egress candidate are unchanged and unallocated. No paid execution, utility, genuine testimony or Step A/Step B acceptance is awarded. Nothing was pushed.
