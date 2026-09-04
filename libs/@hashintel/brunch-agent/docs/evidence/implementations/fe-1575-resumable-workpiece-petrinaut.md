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

The successful 2026-09-04 witness is retained in
[fe-1575-outer-browser-witness-2026-09-04](fe-1575-outer-browser-witness-2026-09-04/witness.md).
It used the local `yarn dev:brunch` stack, one clean Playwright browser
context, the mounted `/agents/chat/:instanceId` route, a real configured
provider credential, and the stable fixture URL:

```text
http://127.0.0.1:4915/?brunch-fixture=crew-reservation-v1
```

The clean run created canonical conversation
`conv_01M1NQEXM3CAPPTXM33ZE1YSRG` and exactly one tagged prepared source. Tab A
advanced from settled revision zero with the target arc absent to revision 1
with a model-produced workpiece and the target arc present. It retained one
`addArc` call and one correlated successful result,
`toolu_01KLHzRE7gbPbFfPaXe3RTry`. Mechanical comparison found exactly one
semantic document change: a standard weight-1 input arc from
`dispatch-crew-available` to `start-final-inspection`.

Tab B reopened the same manifest, workpiece hash, document hash, and canonical
conversation. It submitted a non-mutating follow-up and received completed
correlated response `entry_01M1NQJG7GRPC479PRF826T6F3` without another prepared
source or `addArc` call. The post-Tab-A and Tab-B definitions and manifests
have identical hashes.

The provider serialized the arc weight as `"1"`. The witnessed implementation
normalizes that finite numeric string before canonical server and browser
validation; the raw Flue snapshot retains the supplied representation while
the canonical Petrinaut definition contains numeric weight `1`. The earlier
HTTP 401 remains historical authentication/environment evidence only, not a
carrier/schema conclusion.

## Remaining human checks

Cold-reader semantic adjudication and the product-manager demo remain separate
human gates. They have not been replaced with persona or agent testing.

### Cold-reader handoff

Give the reviewer only the prepared and model-revised workpieces plus their
tagged Flue records. Ask them to identify authorship, the exactly-one-crew
policy, the intended reservation and return, and every unresolved timing,
failure, and recovery point. Fail the check if the reader attributes revision
zero to the model or infers unsupported behavioral execution.

### Product-manager handoff

With a valid live provider credential, have the reviewer open the labelled
fixture in Tab A, confirm the visible non-claims, submit the crew-reservation
fact once, and wait for a settled bundle. They must inspect the exact added
weight-1 input arc, open the same fixture in Tab B, verify matching identities
and hashes, submit a follow-up, and receive its correlated Brunch response
without a duplicate prepared submission. A read-only Tab B does not pass.
