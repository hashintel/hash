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
- retention of the prior runtime manifest while partial state remains visible.

The affected Brunch, transport, plugin, Petrinaut, and website builds, type
checks, and lint checks passed on 2026-09-03. The app-wide lint checks retain
pre-existing warning-only findings; no persona suite was run.

## Live browser attempt and blocker

The local `yarn dev:brunch` stack served the mounted agent at
`/agents/chat/:instanceId` and the Petrinaut fixture at:

```text
http://127.0.0.1:4915/?brunch-fixture=crew-reservation-v1
```

The browser opened the non-empty prepared document and created canonical Flue
conversation `conv_01M1KZ1Z32SJ0800V94ZE59ENR`. Snapshot offset
`0000000000000000_0000000000000006` contained exactly one tagged
`prepared-fixture` dispatch record under submission
`sub_ik_b224f8e328e14cfa803c63d06376e5e9`, preserving the test-authored Markdown
body and claim-boundary attributes.

That submission settled as `failed` because the configured Anthropic
credential returned HTTP 401 `authentication_error: invalid x-api-key`.
Consequently:

- no model-behavior claim was made;
- no typed confirmation, client-tool mutation, or Tab B continuation was
  attempted;
- the runtime settled manifest remained `null`; and
- the visible fixture status refused settlement as `history-unavailable`
  instead of blessing the prepared document alone.

This is the Mission 6 carrier blocker required by the stop rule, not a passing
two-tab witness. No success screenshot was retained.

## Remaining external checks

After a valid provider credential is supplied, rerun the demo script to retain
the successful before/after Flue snapshots, canonical definitions, runtime
manifest, call/result IDs, and Tab A/Tab B screenshots. Cold-reader semantic
adjudication and the product-manager demo remain separate human-harness checks;
they were not replaced with persona testing here.

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
