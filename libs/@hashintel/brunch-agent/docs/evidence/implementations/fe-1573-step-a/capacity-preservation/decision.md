# Canonical place-capacity preservation — confirmed owning repair

> Historical result; raw contract-establishment payloads were retired in the [bounded reduction](../landing-20260909/evidence-reduction.md). Original commands, manifests and payload links below describe the recorded run, not a maintained replay or a claim that those bytes remain local.

## Claim and discriminator

**Claim:** `normalizeSDCPN` and the canonical `createJsonDocHandle` initialization path lose valid root `Place.capacity` from complete documents. **Relied on by:** the root-creation checkpoint's unchanged raw reopen assertion and any claim that a recorded capacity correction survives canonical reopening. **Promised contract:** a complete SDCPN is valid authoring input and normalizes to an equivalent canonical value.

Competing explanations were escaped model projection, host persistence, different document identity, extension sanitization and stale build. The worker's actual Chrome/storage evidence, parent's direct published-API replay and independent re-derivation distinguish them: raw storage retains capacity **3/null**, matching the verified same-binding post definition; the raw reopened observation omits both. Independent hashing and source-map comparisons rule out projection/build substitution. Sanitizer-only controls retain capacity. Direct normalization already removes it, and ALPHA's canonical handle output matches the actual raw browser reopen.

**Verdict: confirmed canonical-core defect.** The omission is in `libs/@hashintel/petrinaut-core/src/types/sdcpn-input.ts`: authoring place type and reconstructed normalized place omit `capacity`. Existing canonical `Place`/schema already own optional nullable nonnegative capacity; zero/positive loss removes a behavioral constraint, while null loss breaks exact value/shape preservation even though both null and absence mean unbounded. The parent and independent probes both fail `undefined !== 3` using existing installed core APIs. This is not a Brunch provenance/storage workaround.

Before implementation, new direct-normalization and canonical-handle JSON-reopen tests produce **6 failures / 28 passes**: null, zero and positive values fail in both paths; omitted/undefined absence follows the existing optional-field convention. Assertions execute outside faux callbacks and compare complete strict shapes, not merely a type or a presence marker.

## Approved bounded implementation

Under the existing AFK delegation, the integration owner authorizes and owns the minimal published-core repair:

- Project the capacity type from canonical `Place`, and copy a supplied capacity into the normalized root place without truthiness, nullish replacement or an invented default. Keep absence absent; undefined follows the normalizer's existing omitted-optional convention.
- Preserve canonical validation, extension sanitization, other fields, input nonmutation, handle/history semantics and byte/content distinctions. No new storage mechanism or schema widening; no Brunch state/history backfill, importer or alternate handle bypass.
- Pin direct normalization/idempotence and real handle/JSON-reopen tests for absent/null/zero/positive semantics, using canonical types and strict values/shapes. Keep the root worker's actual raw browser preservation assertion unchanged.
- Update the existing user-guide capacity note and add one `@hashintel/petrinaut-core` patch changeset. No unrelated public API or broader normalization refactor is included.
- Verify the core and affected consumers with repository gates, then provide the small core commit to the root worktree. Rebuild/replay that actual Chrome path before crediting the previously unreachable stale/retired/foreign/conflicting-node controls or reopened why. No dropping capacity from the claim or swapping in an easier correction.

Already overwritten capacity data is not retroactively repaired. Original source/failure artifacts and the incomplete root-node implementation stay separate; the root checkpoint is not integration-ready merely because this cause is confirmed. No paid/genuine/provider-class/semantic/Step A/B acceptance follows. The sibling-browser adapter lane remains independent and no reservation is active.

## Retained evidence

`owner/` retains the parent's guarded canonical reproduction and real test red, plus importer coordination logs. `independent/` retains the independent probe, full diagnosis, source/build maps, raw artifact/hash checks and sanitizer controls. Original full root evidence remains at worker commits `f0ce69ceab`, `ce9978bac1`, `68ca62a4a9`, `62fd9d8eef`, `e1387e7b04`; its source-read departure reports are not substituted for this reached reopen boundary. New importer/script admission is parent-owned `e13a8e0e8f` on that worktree; it admits the test surface, not its currently red verdict.
