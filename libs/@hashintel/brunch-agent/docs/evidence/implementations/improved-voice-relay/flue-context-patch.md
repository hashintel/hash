# FE-1630 local Flue delivery-context extension

Kostandin explicitly approved this exception on 2026-09-08 after reviewing the per-turn context approach: “do now - but note it”. **This is a maintained local patch to Flue 2.0.3, not an upstream-supported API.** It exists only to test the Improved Relay without encoding mode in user text or introducing a second admission/store. The experiment scope is preserved in its [historical branch contract](mission.md).

## Contract

Both user and signal `DeliveredMessage` variants accept optional `context`, containing only finite, acyclic JSON values. The Brunch application uses `{ responseMode: "voice" }`; this is a presentation preference, not verified provenance, identity, authorization, or domain evidence. The runtime returns it through the existing `useDelivery()` hook; it does not interpret it or insert it into provider messages.

- HTTP/direct dispatch validation retains context; malformed non-JSON values fail before admission. Omitted context remains backward compatible.
- Existing submission JSON carries context and the existing full-message idempotency comparison includes it. An identical retry converges; changing/omitting an originally present context under the same key conflicts.
- Existing private canonical user/signal records retain context. The reducer keeps it outside model-facing `message` as `deliveryContext`; joined-input cursor recovery restores it. Public history and model projections are unchanged. Old records omit it normally.
- No new table, migration, sidecar, hook, conversation mode, tool, or lifecycle-append API is added. Do not put secrets in delivery context: it is stored internally, even though it is not projected into public history.

## Patch ownership and maintenance

Root `package.json` resolutions pin **all consumers of exactly 2.0.3** to `.yarn/patches/@flue-runtime-npm-2.0.3-192c31f50c.patch` and `.yarn/patches/@flue-sdk-npm-2.0.3-delivery-context.patch`. The runtime patch covers public declarations, input validation, canonical record construction/reduction, and delivery-cursor restoration. The SDK patch changes declarations only; its existing send implementation already forwards the message object.

These are patches against published bundles. Runtime symbols/chunk names are intentionally version-specific; do not mechanically carry them to a newer Flue release. Source correspondence was inspected at [Flue source ac610378741d879a9d12d3f927ff9634e0b4f7ae](https://github.com/withastro/flue/tree/ac610378741d879a9d12d3f927ff9634e0b4f7ae): `runtime/schemas.ts`, `types.ts`, `conversation-records.ts`, `conversation-reducer.ts`, `session.ts`, and SDK `public/send.ts`.

Remove the resolutions and patch files when an upstream equivalent is adopted, adapt the transport to its supported API, and rerun the same tests. No upstream publication or pull request is implied or authorized by this local change.

## Verification

`yarn workspace @apps/brunch-agent exec vitest run test/flue-delivery-context.test.ts` tests actual HTTP admission, effective delivery, public/model-text exclusion, retry/conflict behavior across SQLite runtime restart, malformed direct dispatch, and the real canonical record builder/reducer/joined-input cursor restoration. Four initial tests failed on unpatched 2.0.3 because context was discarded or accepted without validation; the patch addresses those failures. The recovery unit cases exercise the real pinned recovery functions, not a killed-process/lease-takeover witness; do not describe them as a full crash campaign.

Brunch transport/prompt tests separately establish that only the fixed response preference is used, typed requests omit it, and existing causally linked browser-tool results preserve it. The real after run also witnessed Voice context on the user and automatic browser-tool result admissions, with no context on the later typed admission. See [the experiment evidence](verification.md); this patch alone is not a naturalness result.
