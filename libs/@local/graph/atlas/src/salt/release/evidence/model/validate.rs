//! Gate-specific checks against a completed generation manifest.
//!
//! Each measurement must reproduce a manifest-pinned value and satisfy its
//! numerical policy. External grants instead verify their original exact-head
//! signature. A valid release signature therefore cannot turn a mismatched
//! measurement or approval into a passing outcome.

use super::{
    ExternalGateVerifierSet, GateEvidenceError, GateEvidencePayload, GenerationManifest,
    MINIMUM_RECALL, RecallAudit, ReleaseHead, reproducibility_output_hash,
};

#[expect(
    clippy::too_many_lines,
    reason = "all gate-to-manifest bindings remain visible in one release audit boundary"
)]
pub(super) fn payload(
    payload: &GateEvidencePayload,
    head: ReleaseHead,
    manifest: &GenerationManifest,
    external_verifiers: &ExternalGateVerifierSet,
) -> Result<(), GateEvidenceError> {
    let gate = payload.gate();
    match payload {
        GateEvidencePayload::Representation(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            if grant.suite_version() != manifest.embedding.representation_audit.suite_version
                || grant.report() != manifest.embedding.representation_audit.content_hash()
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external representation audit differs from the frozen corpus report",
                });
            }
        }
        GateEvidencePayload::AnnRecall {
            backend,
            sample,
            sample_rows,
            neighbors_per_row,
            matched,
            expected,
            recall_at_50_bits,
        } => {
            let recall = f64::from_bits(*recall_at_50_bits);
            let audit = RecallAudit {
                backend: *backend,
                sample: *sample,
                sample_rows: *sample_rows,
                neighbors_per_row: *neighbors_per_row,
                matched: *matched,
                expected: *expected,
                recall,
            };
            if audit.content_hash() != manifest.semantic_graph.exact_audit_hash
                || *backend != manifest.semantic_graph.backend_hash
                || *sample != manifest.semantic_graph.exact_audit_sample_hash
                || *sample_rows != manifest.semantic_graph.exact_audit_sample_rows
                || *neighbors_per_row != manifest.semantic_graph.exact_audit_neighbors
                || *matched != manifest.semantic_graph.exact_audit_matched
                || *expected != manifest.semantic_graph.exact_audit_expected
                || recall.to_bits() != manifest.semantic_graph.recall_at_50.to_bits()
                || !recall.is_finite()
                || recall < MINIMUM_RECALL
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "exact ANN audit does not satisfy the pinned manifest",
                });
            }
        }
        GateEvidencePayload::RelationSatisfaction {
            selection_evidence,
            baseline_field,
            canonical_field,
            baseline_loss_bits,
            canonical_loss_bits,
            tolerance_bits,
        } => {
            let canonical = canonical_variant(manifest);
            let baseline = f64::from_bits(*baseline_loss_bits);
            let selected = f64::from_bits(*canonical_loss_bits);
            let tolerance = f64::from_bits(*tolerance_bits);
            if *selection_evidence != canonical.selection_evidence_hash
                || *baseline_field != canonical.relation_baseline_field_hash
                || *canonical_field != canonical.canonical_field_hash
                || baseline.to_bits() != canonical.baseline_relation_loss.to_bits()
                || selected.to_bits() != canonical.canonical_relation_loss.to_bits()
                || tolerance.to_bits() != canonical.relation_loss_tolerance.to_bits()
                || !baseline.is_finite()
                || !selected.is_finite()
                || !tolerance.is_finite()
                || baseline < 0.0
                || selected < 0.0
                || tolerance < 0.0
                || selected > baseline + tolerance
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "relation loss does not satisfy the pinned canonical measurement",
                });
            }
        }
        GateEvidencePayload::MergeTreePersistence {
            grant,
            report,
            candidate_tree,
            reference_tree,
        } => {
            let canonical = canonical_variant(manifest);
            let comparison = &canonical.persistence_comparison;
            grant.verify_pinned(head, gate, external_verifiers)?;
            if grant.suite_version() != comparison.suite_version
                || grant.report() != comparison.content_hash()
                || *report != comparison.content_hash()
                || *candidate_tree != comparison.candidate_tree_hash
                || *reference_tree != comparison.reference_tree_hash
                || comparison.validate().is_err()
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "merge-tree comparison does not satisfy the pinned two-sided report",
                });
            }
        }
        GateEvidencePayload::SnapshotConsistency {
            frozen_input,
            security_geometry,
            identity_directory,
            row_count,
        } => {
            if *frozen_input != manifest.input_snapshot.frozen_input_hash
                || *security_geometry != manifest.relations.security_geometry_hash
                || *identity_directory != manifest.storage.identity_directory_hash
                || *row_count != manifest.storage.row_count
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "snapshot evidence differs from the frozen generation inputs",
                });
            }
        }
        GateEvidencePayload::Reproducibility {
            recipe,
            first_output,
            second_output,
            artifact_count,
        } => {
            let expected_output = reproducibility_output_hash(manifest);
            if *recipe != manifest.reproducibility.config_hash
                || *first_output != expected_output
                || *second_output != expected_output
                || first_output != second_output
                || *artifact_count != manifest.artifacts.len()
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "independent output comparison differs from the pinned recipe",
                });
            }
        }
        GateEvidencePayload::SemanticFidelity(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            let canonical = canonical_variant(manifest);
            if grant.suite_version() != canonical.quality_suite_version
                || grant.report() != canonical.semantic_fidelity_report_hash
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external semantic-fidelity report differs from the measured field",
                });
            }
        }
        GateEvidencePayload::SubgroupBehavior(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            let canonical = canonical_variant(manifest);
            if grant.suite_version() != canonical.quality_suite_version
                || grant.report() != canonical.subgroup_report_hash
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external subgroup report differs from the measured field",
                });
            }
        }
        GateEvidencePayload::CompanionPin(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            if grant.suite_version() != manifest.serving.canvas_companion_version
                || grant.report() != manifest.serving.canvas_companion_sha256
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external companion descriptor differs from the manifest pins",
                });
            }
        }
        GateEvidencePayload::RelationPolicy(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            if grant.suite_version() != manifest.relations.policy_precedence_version
                || grant.report() != manifest.relations.policy_evaluation_report_hash
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external relation-policy report differs from the evaluated report",
                });
            }
        }
        GateEvidencePayload::AuthorizationNoninterference(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            if grant.suite_version() != manifest.serving.authorization_adapter_version
                || grant.report() != manifest.relations.authorization_noninterference_report_hash
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external noninterference report differs from the evaluated report",
                });
            }
        }
        GateEvidencePayload::SecurityApproval(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
            if grant.suite_version() != manifest.serving.authorization_adapter_version
                || grant.report() != manifest.relations.security_allow_list_hash
            {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external security approval differs from the frozen allow-list",
                });
            }
        }
        GateEvidencePayload::TemporalDrift(grant) => {
            grant.verify_pinned(head, gate, external_verifiers)?;
        }
    }
    Ok(())
}

fn canonical_variant(
    manifest: &GenerationManifest,
) -> &crate::salt::manifest::VariantEntryManifest {
    manifest
        .variants
        .entries
        .iter()
        .find(|variant| variant.id == manifest.variants.canonical_variant)
        .expect("validated manifest should contain its canonical variant")
}
