# Side quest — Retire the disconnected capture lane and enforce topology

## Relationship to Mission 7d

This is owner-authorized remediation inside live Mission 7d. It does not change Mission 7d's
contract, proof, throughline, or next product observation, and it does not touch the persona,
tool-naming, provider-accounting, or mission-authority files that Mission 7d is actively changing.
The remediation arose from an independent topology audit, not from Mission 7d evidence, and is not
a prerequisite for the worked example.

## Imperative

Remove the disconnected capture/archive implementation that the 2026-09-04 provenance decision
rejected, preserve the still-consumed structured-question contract, and make the repository's
claimed inward package direction mechanically true.

## Throughlines and budgets

1. **Retire the rejected lane:** remove the capture store and session-log archive in core, the
   suspended sweep/affordance/reply-bound protocols, the `binding-flue` package, and the app's
   `capture/apply-sweep.ts` adapter. Budget: deletion and direct consumer cleanup only; do not
   replace the lane.
2. **Preserve the live client contract:** move `ask-tool-contract.ts` from `_suspended` to
   `src/conversation/`. The website still mounts the ask widget and consumes `ASK_TOOL_NAME`,
   `SWEEP_TOOL_NAME`, `parseBrunchAskInput`, and `parseBrunchAskOutput`; the app and SDCPN plugin
   consume `AWAITING_CLIENT`. Retiring the website widget is adjacent work and is not done here.
3. **Remove or park cold roots:** delete consumerless runbook and fixture files, and park the
   owner-retained Linear project graph as a runnable, unsupported documentation script. Budget:
   no re-homing of Mission 7d's persona files or `tool-catalogue.ts`.
4. **Close the topology gap:** add one app-owned import-direction oracle and derive library build
   externals from package manifests. Budget: direction and `src`-to-`test` rules only; no
   reachability framework or bundle-inspection test.

## Preserved provenance path

Mission 7's explanation and provenance obligations continue through `core/src/workpiece.ts`,
`core/src/update-workpiece.ts` (`settleWorkpieceEvidence`, `WorkpieceEvidenceSource`, and
`evidenceRelationSchema`), `plugin-sdcpn/src/mutation-record.ts`, and the app's
`conversation/{why,net-ledger,root-arc,reported-document-revision}.ts`. None imports the retired
lane.

## Proof

- The affected package `lint:tsc`, `lint:eslint`, `test:unit`, and `build` gates pass.
- `apps/brunch-agent/test/architecture/import-direction.test.ts` passes, and a temporary
  `src`-to-`test` import makes it fail.
- The touched Petrinaut chat and history-retention integration tests pass without capture-lane
  diagnostics.
- Every Brunch library build leaves dependencies external and emits no `node_modules/` path.
- The parked Linear graph script prints usage with `node --experimental-strip-types`.

## Constraints

- Do not modify `MISSION.md`, `persona/*`, `launch.ts`, `install-faux-provider.ts`,
  `schema-carrier-probe.ts`, `tool-catalogue.ts`, or `provider-accounting*`.
- Preserve the original Mission 7 stores and the lineage/workpiece provenance path.
- Preserve the three unmounted plugin probes and document their status without pinning it in a
  test.
- Process launches by filename and mission-named oracles are real edges outside the import graph.

## Stop or reorient

Stop if a retired symbol has a production consumer, is named as a required oracle by `MISSION.md`
or a mission archive, or if a library intentionally bundles a dependency currently listed as
external. Stop if the cleanup would touch a file Mission 7d changed after the audit base
`5b7c1156ce`.

At close, record the outcome and deferred re-homing cluster in `MISSION.next.md`, update the
Mission 9 draft's deleted-path reference, and remove this active file.
