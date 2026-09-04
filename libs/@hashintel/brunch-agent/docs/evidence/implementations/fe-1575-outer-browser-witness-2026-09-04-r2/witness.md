# FE-1575 corrected outer browser witness — 2026-09-04

## Scope

This is the retained outer mechanical witness for Mission 6 at implementation commit `8ef9cd967d`. It supersedes the first witness for acceptance because that run's model-produced revision incorrectly described itself as test-authored. This run used a fresh Playwright browser context, the stable `crew-reservation-v1` fixture route, the local Brunch Flue mount, and a real configured provider credential. Credentials, authorization headers, the browser principal, the Flue instance route component, and provider request payloads are not retained.

The provider serialized the `addArc` weight as `"1"`. The witnessed build normalized only that observed finite numeric string at the Petrinaut tool boundary before canonical validation and browser execution. [`call-result-correlation.json`](call-result-correlation.json) retains both the raw provider input and parsed canonical input; the resulting definition retains numeric weight `1`.

## Protocol and result

1. Started the production dev processes underlying `yarn dev:brunch` after loading `.env.local` without printing it. The root wrapper's prerequisite build could not run in this sandbox because `tsx` was denied its `/tmp` IPC socket; all affected package builds had already passed, so the Brunch server and Petrinaut panel processes were started directly with their normal Vite entrypoints.
2. Opened `http://127.0.0.1:4915/?brunch-fixture=crew-reservation-v1` in a fresh browser context and waited for settled revision zero.
3. Retained the before Flue snapshot, canonical definition, runtime manifest, and Tab A screenshot.
4. Submitted one confirmation/construction turn instructing Brunch to preserve timing/failure/recovery unknowns, add the missing standard weight-1 input arc, and identify the new assistant workpiece as model-produced from test-authored revision zero.
5. Observed one `addArc` call and one unique correlated successful client-tool result, `toolu_01BQukCZTAhJ64VNE7oC1CWG`. Flue history materialized that result in two cumulative client-tool-result signal deliveries as later read verification completed; the repeated call ID remained one logical result and the browser retained exactly one arc.
6. Verified that the only semantic definition delta was one standard weight-1 input arc from `dispatch-crew-available` to `start-final-inspection`.
7. Observed runtime manifest revision 1 selecting the model-produced workpiece and changed document, with target arc `present`.
8. Opened Tab B in the same browser context. It selected the same manifest, workpiece hash, document hash, and canonical conversation, with exactly one prepared source and one `addArc` call.
9. Submitted a non-mutating follow-up in Tab B asking for the unresolved timing, failure, and recovery questions without changing the net.
10. Observed completed submission `sub_ik_b2f96fd62b80a6dcf980329ad61f70e9` and correlated response `entry_01M1NV73Z110CY393GEB8T02SH`. The document and settled manifest remained unchanged.

## Retained identities and invariants

- Canonical conversation: `conv_01M1NV5WZETMYEGGMFXNYDSTRS`
- Before/after/Tab-B offsets: `0000000000000000_0000000000000032`, `0000000000000000_0000000000000092`, `0000000000000000_0000000000000110`
- Settled manifest revision: `1`
- Settled manifest ID: `d16b26c12d81a2f961d428d8062fce2a7755c3a6342715f8c85b054546d330b7`
- Document SHA-256: `3c47961d02296c00131644d1aea0dac16a017f470a66aea919fcf324a2bc9e37`
- Workpiece SHA-256: `1d250465b7c9ee930c21581c2b6715ad01915e50e5a66b4348ea7970eac9f78c`
- Prepared source count after Tab B: `1`
- `addArc` call count after Tab B: `1`
- Unique successful `addArc` result count: `1` across `2` cumulative signal deliveries
- Tab B follow-up outcome: `completed`
- The selected model-produced workpiece explicitly distinguishes itself from test-authored revision zero.
- `definition-after.json` and `definition-tab-b.json` have the same SHA-256.
- `settled-manifest-after.json` and `settled-manifest-tab-b.json` have the same SHA-256.

## Artifacts

- Before state: [Flue](flue-snapshot-before.json), [definition](definition-before.json), [manifest](settled-manifest-before.json), [screenshot](screenshot-tab-a-before.png)
- Settled Tab A state: [Flue](flue-snapshot-after.json), [definition](definition-after.json), [manifest](settled-manifest-after.json), [call/result correlation with parsed input](call-result-correlation.json), [screenshot](screenshot-tab-a-after.png)
- Tab B continuation: [Flue](flue-snapshot-tab-b.json), [definition](definition-tab-b.json), [manifest](settled-manifest-tab-b.json), [correlation](tab-b-correlation.json), [screenshot](screenshot-tab-b-after.png)
- Semantic inputs: [prepared workpiece](prepared-workpiece.md), [latest model-produced workpiece](latest-workpiece.md), [cold-reader records](cold-reader-records.json)
- Redacted route observation: [route evidence](route-evidence.json)
- Run metadata: [run-metadata.json](run-metadata.json)
- Integrity: [SHA256SUMS](SHA256SUMS)

This witness proves the bounded browser protocol above. It does not establish capture provenance, timing behavior, failure/recovery behavior, simulation validity, or broad automatic projection quality. Cold-reader adjudication and the product-manager demo remain human-owned gates.
