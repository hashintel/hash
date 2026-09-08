# FE-1575 outer browser witness — 2026-09-04

## Scope

This is the retained outer mechanical witness for Mission 6 at commit
`ace2968`. It used a clean browser principal in one Playwright context, the
stable `crew-reservation-v1` fixture route, the local Brunch Flue mount, and a
real configured provider credential. Credentials, authorization headers, the
browser principal, the Flue instance route component, and provider request
payloads are not retained.

The provider serialized the `addArc` weight as `"1"`. The witnessed build
normalized that finite numeric string at the Petrinaut tool boundary before
canonical validation and browser execution. The retained raw Flue snapshot
preserves the provider-supplied input; the resulting Petrinaut definition
preserves the canonical numeric weight `1`.

## Protocol and result

1. Started `yarn dev:brunch` after loading `.env.local` without printing it.
2. Cleared browser local storage, opened
   `http://127.0.0.1:4915/?brunch-fixture=crew-reservation-v1`, and waited for
   settled revision zero.
3. Retained the before Flue snapshot, canonical definition, runtime manifest,
   and Tab A screenshot.
4. Submitted one confirmation/construction turn:

   > Confirmed: final inspection uses the single dispatch crew and sign-off
   > releases it; timing, failure, and recovery remain unknown. Read the live
   > Petrinaut definition, add the missing standard weight-1 input arc from
   > Dispatch crew available to Start final inspection, verify it, and emit
   > the full revised runbook-ir workpiece.

5. Observed one `addArc` call and one correlated successful client-tool result:
   `toolu_01KLHzRE7gbPbFfPaXe3RTry`.
6. Verified that the only semantic definition delta was one standard,
   weight-1 input arc from `dispatch-crew-available` to
   `start-final-inspection`.
7. Observed runtime manifest revision 1 selecting the model-produced workpiece
   and changed document, with target arc `present`.
8. Opened Tab B in the same browser context. It selected the same manifest,
   workpiece hash, document hash, and canonical conversation, with exactly one
   prepared source and one `addArc` call.
9. Submitted a non-mutating follow-up in Tab B:

   > From the resumed workpiece, list the unresolved timing, failure, and
   > recovery questions. Do not change the Petrinaut net.

10. Observed completed submission
    `sub_ik_8841d36f1e2e4ba9f39852be54d2e174` and correlated response message
    `entry_01M1NQJG7GRPC479PRF826T6F3`. The document and settled manifest were
    unchanged.

## Retained identities and invariants

- Canonical conversation: `conv_01M1NQEXM3CAPPTXM33ZE1YSRG`
- Settled manifest revision: `1`
- Settled manifest ID:
  `a00f05964afc87b1ef34b50c96711232ac44c5b60eb6e8ce60a540af3b5dab49`
- Prepared source count after Tab B: `1`
- `addArc` call count after Tab B: `1`
- Tab B follow-up outcome: `completed`
- `definition-after.json` and `definition-tab-b.json` have the same SHA-256.
- `settled-manifest-after.json` and `settled-manifest-tab-b.json` have the same
  SHA-256.

## Artifacts

- Before state: [Flue](flue-snapshot-before.json),
  [definition](definition-before.json),
  [manifest](settled-manifest-before.json),
  [screenshot](screenshot-tab-a-before.png)
- Settled Tab A state: [Flue](flue-snapshot-after.json),
  [definition](definition-after.json),
  [manifest](settled-manifest-after.json),
  [call/result correlation](call-result-correlation.json),
  [screenshot](screenshot-tab-a-after.png)
- Tab B continuation: [Flue](flue-snapshot-tab-b.json),
  [definition](definition-tab-b.json),
  [manifest](settled-manifest-tab-b.json),
  [correlation](tab-b-correlation.json),
  [screenshot](screenshot-tab-b-after.png)
- Semantic inputs: [prepared workpiece](prepared-workpiece.md),
  [latest workpiece](latest-workpiece.md)
- Redacted route observation: [route evidence](route-evidence.json)
- Integrity: [SHA256SUMS](SHA256SUMS)

This witness proves the bounded browser protocol above. It does not establish
capture provenance, timing behavior, failure/recovery behavior, simulation
validity, or broad automatic projection quality.
