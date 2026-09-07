# FE-1575 — resumable workpiece and Petrinaut document

## Deterministic implementation evidence

The prepared crew-reservation fixture uses distinct fixture, logical
conversation, canonical Flue conversation, workpiece-source, and Petrinaut
document identities. Revision zero is delivered through the public mounted
Flue route as one `prepared-fixture` system/dispatch signal with a deterministic
idempotency key. The browser transport derives stable keys for typed messages
and correlated client-tool-result signals.

Focused tests cover:

- exact prepared-signal retry and append-only workpiece selection;
- fixture-only `getLatestNetDefinition` and `addArc` advertisement;
- the built agent's read, mutation, original call-id result, and continuation;
- rejected and duplicate/no-op canonical browser mutations;
- exact prepared and revised document structure;
- history, workpiece, mutation-result, and document mismatch refusal; and
- content-addressed selection of the prior coherent document revision while a
  partial mirrored value remains inspectable.

The affected Brunch, transport, plugin, Petrinaut, and website builds, type
checks, and lint checks passed on 2026-09-04. The app-wide lint checks retain
pre-existing warning-only findings; no persona suite was run.

## Live two-tab browser witness

The corrected 2026-09-04 witness is retained in [fe-1575-outer-browser-witness-2026-09-04-r2](fe-1575-outer-browser-witness-2026-09-04-r2/witness.md). It used the production dev processes underlying `yarn dev:brunch`, one fresh Playwright browser context, the mounted `/agents/chat/:instanceId` route, a real configured provider credential, and the stable fixture URL:

```text
http://127.0.0.1:4915/?brunch-fixture=crew-reservation-v1
```

The clean run created canonical conversation `conv_01M1NV5WZETMYEGGMFXNYDSTRS` and exactly one tagged prepared source. Tab A advanced from settled revision zero with the target arc absent to revision 1 with a model-produced workpiece and the target arc present. It retained one `addArc` call and one unique correlated successful result, `toolu_01BQukCZTAhJ64VNE7oC1CWG`, materialized in two cumulative signal deliveries without applying a second arc. Mechanical comparison found exactly one semantic document change: a standard weight-1 input arc from `dispatch-crew-available` to `start-final-inspection`.

Tab B reopened the same manifest, workpiece hash, document hash, and canonical conversation. It submitted a non-mutating follow-up and received completed correlated response `entry_01M1NV73Z110CY393GEB8T02SH` without another prepared source or `addArc` call. The post-Tab-A and Tab-B definitions and manifests have identical hashes.

The provider serialized the arc weight as `"1"`. The corrected correlation artifact retains that raw input and the post-normalization parsed input with numeric weight `1`; no broader nested input normalization remains. The selected assistant workpiece explicitly labels revision 1 as model-produced from test-authored revision zero and preserves the fixture's non-claims. The earlier HTTP 401 remains historical authentication/environment evidence only, not a carrier/schema conclusion.

The first [2026-09-04 witness](fe-1575-outer-browser-witness-2026-09-04/witness.md) remains immutable historical evidence but is superseded for acceptance: its model-produced workpiece incorrectly called itself test-authored and its correlation artifact omitted the parsed canonical input.

## Human checks

The cold reader accepted the fixture and revised workpiece on 2026-09-04; the complete adjudication is retained in [cold-reader-gate.md](fe-1575-outer-browser-witness-2026-09-04-r2/cold-reader-gate.md).

The product manager accepted the visible two-tab conversation, workpiece, and document path on 2026-09-04 after a fresh run advanced from settled revision 0 to revision 1, displayed the exact crew-reservation arc, reopened coherently in Tab B, and answered a non-mutating follow-up. The durable correlation and the run's explicit limitation are retained in [product-manager-gate.md](fe-1575-outer-browser-witness-2026-09-04-r2/product-manager-gate.md): the fresh human run contained no Voice-origin or aborted assistant records, so those presentation clauses were not independently re-exercised by the product manager. The owner explicitly waived those checks, closed Mission 6, and carried them into `MISSION.next.md` for later scenario testing; the waiver is recorded as a closure exception rather than evidence of a pass.
