# Deferred SALT quality evidence

`evidence_deferred_local` is an operational fitting mode for development and
controlled internal use. It runs the complete extraction, generation,
artifact verification, candidate publication, activation, and restart-load
path, but it does not provide release-grade independent evidence.

The mode persists `evidence_deferred_local` in the generation manifest. Its fit
receipt marks every gate as `deferred`. External issuer commands are not
started; provisional grants are signed by local, domain-separated authorities
derived from the release seed. The five manifest provenance identities,
relation-policy and security source reports, companion bytes, and companion
report are deterministic placeholders marked `mock_non_attesting`. They
satisfy the current manifest shape only and are not used for classifier
inference, geometry, model selection, reproduction, or numerical acceptance.
A server rejects such a generation unless its configuration explicitly sets:

```json
{
  "allow_evidence_deferred": true
}
```

This opt-in prevents a deployment expecting independent authorities from
silently serving a deferred generation.

## Evidence that remains incomplete

- Representation stratification is deterministic but has not been calibrated
  against production language, source, type-family, community, density, and
  temporal distributions.
- Semantic acceptance uses bounded exact sampled neighborhood probes. The
  thresholds and corpus sizes have not been calibrated as release criteria
  across representative production graphs.
- Planted-shape and merge-tree persistence checks are local suites rather than
  independently reproduced evidence.
- Subgroup coverage can be sparse or absent for small and homogeneous scopes.
  Reported degradation is not a comprehensive fairness or cohort guarantee.
- Authorization noninterference and snapshot consistency use an
  application-level PostgreSQL snapshot identity and a pinned extraction
  marker. They do not detect intervening authorization mutations, establish an
  authorization-owned activation lease, or provide cross-process snapshot
  linearization.
- Embedding/classifier provenance, security approval, and companion
  compatibility are mock values with no evidentiary meaning. Deferred bundles
  must omit external report and companion references so they cannot be
  mistaken for reviewed inputs.

These limitations are assertions about assurance, not file integrity. Deferred
generations still use content-addressed artifacts, complete manifest
verification, signed gate documents, compare-and-swap activation, and verified
reload.

## Strict operational mode

Select `m0_local_attestation` to retain the eight out-of-process gate issuers.
Each issuer signs the exact release head and persisted report using a distinct
key unavailable to the fitting worker. That mode improves authority separation,
but the PostgreSQL authorization/snapshot limitations documented in
[`authorization-consistency.md`](authorization-consistency.md) still apply.
