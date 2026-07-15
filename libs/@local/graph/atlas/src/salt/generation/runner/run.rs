use core::time::Duration;
use std::{
    fs::{self, File},
    io::Read as _,
};

use burn::tensor::backend::AutodiffBackend;
use camino::{Utf8Path, Utf8PathBuf};

use super::{
    CanonicalGenerationConfig, CanonicalGenerationError, CanonicalGenerationOutcome,
    CanonicalReleaseAuthority, FrozenGenerationInput, GenerationFreezeSource,
    artifact::copy_model,
    identity::{generation_id, input_hash, relation_policy_hash, runtime_config_hash},
    input::freeze_generation_input,
    manifest::{CanonicalGateMeasurements, populate_manifest},
};
use crate::salt::{
    analytic::publish_persistence_reference,
    evaluation::measure_persisted_relation_loss,
    generation::{
        CanonicalSignals, GenerationError, LegacyLayoutTag, compare_persistence,
        evaluate_persisted_quality, export_legacy_canvas, landmark_reference_tree,
        materialize_canonical, persistence_reference_source_hash, project_condition_ladder,
        publish_generation_candidate,
    },
    graph::{
        USearchIndex,
        audit::{audit_recall, stratified_audit_sample},
        build_semantic_graph, fuzzy_edge_weights, publish_semantic_graph,
    },
    identity::GenerationRowId,
    landmark::{
        assign_landmarks, fit_landmark_skeleton, publish_landmark_skeleton, select_landmarks,
    },
    manifest::{GenerationManifest, SeedManifest},
    projector::{
        AdaptiveProjectorBatchFactory, AdaptiveProjectorSource, CoordinateSupportRow,
        fit_conditioned_projector_adaptive, publish_projector_checkpoint,
    },
    relation::{build_relation_indexes, publish_relation_indexes},
    release::{
        GateEvidence, GateEvidencePayload, GateEvidenceSet, GateVerifier, ReleaseHead,
        reproducibility_output_hash,
    },
    representation::publish_representations,
    revision::{BaseRevision, DataRevision, DeltaRevision},
};

pub(super) const CLASSIFIER_FILE: &str = "classifier.salt";
pub(super) const REPRESENTATION_FILE: &str = "representations.salt";
pub(super) const SEMANTIC_FILE: &str = "semantic.salt";
pub(super) const RELATION_FILE: &str = "relations.salt";
pub(super) const LANDMARK_FILE: &str = "landmarks.salt";
pub(super) const REFERENCE_PERSISTENCE_FILE: &str = "landmark-reference.salt";
pub(super) const PROJECTOR_FILE: &str = "projector.mpk";
pub(super) const BASE_FILE: &str = "base.salt";
pub(super) const ANALYTIC_FILE: &str = "analytics.salt";

struct UnreleasedGeneration {
    manifest: GenerationManifest,
    payloads: Vec<GateEvidencePayload>,
    legacy: crate::salt::generation::LegacyCanvasExport,
    training_wall_time: Duration,
    directory: Utf8PathBuf,
}

/// Executes the complete immutable generation pipeline.
///
/// Relation links first pass visibility and the selected coordinate-influence
/// policy. The same admitted instances then feed protection, projector fitting,
/// evaluation, and the published relation artifact. Semantic search must pass
/// its exact recall audit before any projector optimization begins.
///
/// Publication writes every model and data artifact, verifies the completed
/// manifest, signs head-bound gate evidence, and publishes an inactive
/// candidate. Activation remains a separate compare-and-swap operation.
///
/// # Errors
///
/// This returns an error when frozen rows disagree, security-admitted links
/// lack policy inputs, a numerical stage fails, any immutable file conflicts,
/// manifest validation fails, or signed gate evidence is incomplete.
pub(crate) fn run_canonical_generation<B>(
    source: GenerationFreezeSource,
    config: &CanonicalGenerationConfig<'_>,
    release_authority: &CanonicalReleaseAuthority<'_>,
    device: &B::Device,
) -> Result<CanonicalGenerationOutcome, CanonicalGenerationError>
where
    B: AutodiffBackend,
{
    let input = freeze_generation_input(source)?;
    let root = config.root;
    fs::create_dir_all(root)?;
    let reproduction_directory = tempfile::Builder::new()
        .prefix(".salt-reproduction-")
        .tempdir_in(root)?;
    let reproduction_root = Utf8Path::from_path(reproduction_directory.path())
        .expect("an ASCII child of a UTF-8 root should remain UTF-8");
    let verifier = release_authority.signer().verifier();
    let reproduction = build_frozen_canonical_generation::<B>(
        &input,
        config,
        reproduction_root,
        &verifier,
        device,
    )?;
    let primary = build_frozen_canonical_generation::<B>(&input, config, root, &verifier, device)?;
    verify_reproduction(&primary, &reproduction)?;

    let manifest_hash = primary.manifest.content_hash()?;
    let head = ReleaseHead {
        generation: primary.manifest.generation_id,
        data: DataRevision::new(BaseRevision::ZERO, DeltaRevision::ZERO),
        manifest: manifest_hash,
    };
    let output_hash = reproducibility_output_hash(&primary.manifest);
    let mut payloads = release_authority.issue_external_grants(head, &primary.manifest)?;
    payloads.extend(primary.payloads);
    payloads.push(GateEvidencePayload::reproducibility(
        primary.manifest.reproducibility.config_hash,
        output_hash,
        reproducibility_output_hash(&reproduction.manifest),
        primary.manifest.artifacts.len(),
    ));
    let documents = payloads
        .into_iter()
        .map(|payload| GateEvidence::sign(head, payload, release_authority.signer()))
        .collect::<Result<Vec<_>, _>>()?;
    let evidence = GateEvidenceSet::new(
        head,
        &primary.manifest,
        &verifier,
        release_authority.external_verifiers(),
        documents,
    )?;
    let candidate = publish_generation_candidate(root, &primary.manifest, &evidence)?;
    File::open(&primary.directory)?.sync_all()?;
    Ok(CanonicalGenerationOutcome {
        candidate,
        manifest: primary.manifest,
        legacy: primary.legacy,
        training_wall_time: primary.training_wall_time,
        directory: primary.directory,
    })
}

#[expect(
    clippy::too_many_lines,
    reason = "the runner intentionally presents one auditable stage-order transaction"
)]
fn build_frozen_canonical_generation<B>(
    input: &FrozenGenerationInput,
    config: &CanonicalGenerationConfig<'_>,
    root: &Utf8Path,
    verifier: &GateVerifier,
    device: &B::Device,
) -> Result<UnreleasedGeneration, CanonicalGenerationError>
where
    B: AutodiffBackend,
{
    let geometry = &input.geometry;
    let representations = input.representations();
    let type_context = input.type_context();
    let mut manifest = input.begin_manifest();
    verifier
        .authority()
        .clone_into(&mut manifest.serving.gate_evidence_authority);
    manifest.serving.gate_evidence_public_key = verifier.public_key();
    manifest.reproducibility.seeds = vec![
        SeedManifest {
            name: "importance".to_owned(),
            value: config.materialization.importance.hash_seed,
        },
        SeedManifest {
            name: "ann-audit".to_owned(),
            value: config.audit_seed,
        },
        SeedManifest {
            name: "landmark-fit".to_owned(),
            value: config.landmark_fit.seed,
        },
        SeedManifest {
            name: "landmark-selection".to_owned(),
            value: config.landmarks.seed,
        },
        SeedManifest {
            name: "projector-batches".to_owned(),
            value: config.projector_batches.seed,
        },
        SeedManifest {
            name: "projector-optimizer".to_owned(),
            value: config.projector_optimizer.seed,
        },
    ];
    manifest.reproducibility.config_hash = runtime_config_hash(config);
    manifest.input_snapshot.authorization_revision = geometry.authorization_revision();
    manifest.input_snapshot.frozen_input_hash = input_hash(input);
    let relation_policy_hash = relation_policy_hash(input);
    manifest.relations.policy_input_hash = input.relation_policy_input_hash;
    manifest.relations.classifier_temperature = input.classifier.temperature;
    manifest.relations.strength_head.enabled = false;
    manifest.relations.strength_head.model_hash =
        crate::salt::hash::ContentHash::digest(b"hash.graph.atlas.salt.unit-strength.v1");
    manifest.relations.strength_head.materialized_table_hash = None;
    let generation_id = generation_id(
        &manifest,
        input.relation_snapshot_hash,
        relation_policy_hash,
        input.classifier.content_hash,
        input,
        config,
    );
    manifest.generation_id = generation_id;
    let generations = root.join("generations");
    fs::create_dir_all(&generations)?;
    File::open(root)?.sync_all()?;
    let directory = generations.join(generation_id.to_string());
    fs::create_dir_all(&directory)?;
    File::open(&generations)?.sync_all()?;

    let classifier = copy_model(
        &input.classifier,
        &directory.join(CLASSIFIER_FILE),
        crate::salt::format::CLASSIFIER_FORMAT,
    )?;
    let representation_artifact = publish_representations(
        &directory.join(REPRESENTATION_FILE),
        &input.identities,
        &input.canonical_embedding_values,
        &input.representation_values,
        &input.roles,
    )?;
    let audit_rows = stratified_audit_sample(
        &input.landmark_candidates,
        input.identities.len(),
        config.audit_sample_size,
        config.audit_seed,
    )?;
    let index = USearchIndex::build(representations, config.semantic_index)?;
    let audit = audit_recall(representations, &index, &audit_rows)?.require_minimum()?;
    let semantic = build_semantic_graph(representations, &index, config.semantic_graph)?;
    let semantic_weights = fuzzy_edge_weights(&semantic.table);
    let semantic_artifact =
        publish_semantic_graph(&directory.join(SEMANTIC_FILE), &semantic, &semantic_weights)?;

    let relations = build_relation_indexes(
        input.identities.len(),
        &input.relation_policies,
        &input.relation_instances,
        config.attraction,
        config.protection,
    )?;
    let edge_snapshot_hash = relations.edge_snapshot_hash();
    let relation_artifact = publish_relation_indexes(
        &directory.join(RELATION_FILE),
        relation_policy_hash,
        edge_snapshot_hash,
        &input.relation_ordinals,
        &input.relation_policies,
        &relations,
    )?;

    let selection = select_landmarks(
        &input.landmark_candidates,
        config.landmarks,
        &input.subgroup_minimums,
    )?;
    let assignment = assign_landmarks(
        representations,
        selection.rows(),
        config.landmark_assignment,
    )?;
    let skeleton = fit_landmark_skeleton(
        &selection,
        assignment,
        &semantic.table,
        &semantic_weights,
        config.landmark_fit,
    )?;
    let landmark_artifact = publish_landmark_skeleton(&directory.join(LANDMARK_FILE), &skeleton)?;
    let persistence_reference_source = persistence_reference_source_hash(
        landmark_artifact.content_hash,
        &input.signals.density_mass,
    );
    let reference_tree = landmark_reference_tree(
        &skeleton,
        &input.signals.density_mass,
        config.materialization.raster,
        config.materialization.merge_tree,
    )?;
    let reference_artifact = publish_persistence_reference(
        &directory.join(REFERENCE_PERSISTENCE_FILE),
        config.materialization.analytic_configuration,
        persistence_reference_source,
        &reference_tree,
    )?;
    let landmark_support = landmark_support(
        skeleton.rows(),
        skeleton.coordinates(),
        config.landmark_radius,
        config.landmark_weight,
    );

    let source = AdaptiveProjectorSource {
        representations,
        roles: &input.roles,
        type_context,
        semantic: &semantic.table,
        semantic_weights: &semantic_weights,
        relations: &relations.attraction,
        protection: &relations.protection,
        anchors: &input.anchors,
        landmarks: &landmark_support,
        evidence_hash: projector_evidence_hash(
            semantic_artifact.content_hash,
            relation_artifact.content_hash,
            landmark_artifact.content_hash,
        ),
    };
    let factory = AdaptiveProjectorBatchFactory::new(source, config.projector_batches.clone())?;
    let fitted = fit_conditioned_projector_adaptive::<B, _>(
        config.projector,
        factory,
        config.projector_loss,
        config.projector_optimizer,
        device,
    )?;
    let checkpoint = publish_projector_checkpoint(&directory.join(PROJECTOR_FILE), &fitted.model)?;
    let projected = project_condition_ladder(
        &fitted.model,
        representations,
        &input.roles,
        type_context,
        config.conditions,
        config.inference_batch_size,
        device,
    )?;
    let condition_quality = config
        .condition_quality_evaluator
        .evaluate(projected.fields())
        .map_err(GenerationError::from)?;
    let evaluated = projected.evaluate(
        config.condition_domain,
        condition_quality,
        config.condition_quality_policy,
        &relations.attraction,
        &semantic.table,
        config.projector_loss.relation,
        config.condition_measurement,
    )?;
    let canonical_condition = f64::from(config.canonical_condition);
    let coordinate_bounds = config.materialization.importance.bounds;
    let (baseline, _baseline_quantization) = evaluated
        .select_canonical(0.0)?
        .quantize(
            config.variant_quantization_step,
            coordinate_bounds.minimum(),
            coordinate_bounds.maximum(),
        )
        .map_err(GenerationError::from)?;
    let (canonical, quantization) = evaluated
        .select_canonical(canonical_condition)?
        .quantize(
            config.variant_quantization_step,
            coordinate_bounds.minimum(),
            coordinate_bounds.maximum(),
        )
        .map_err(GenerationError::from)?;
    let baseline_relation_loss = measure_persisted_relation_loss(
        baseline.coordinates(),
        &relations.attraction,
        &semantic.table,
        config.projector_loss.relation,
    )
    .map_err(GenerationError::from)?;
    let canonical_relation_loss = measure_persisted_relation_loss(
        canonical.coordinates(),
        &relations.attraction,
        &semantic.table,
        config.projector_loss.relation,
    )
    .map_err(GenerationError::from)?;
    let canonical_quality = evaluate_persisted_quality(
        config.condition_quality_evaluator,
        config.canonical_condition,
        &canonical,
        config.condition_quality_policy,
    )?;
    let labels = input
        .signals
        .labels
        .iter()
        .map(|label| label.as_deref())
        .collect::<Vec<_>>();
    let canonical_artifacts = materialize_canonical(
        &directory.join(BASE_FILE),
        &directory.join(ANALYTIC_FILE),
        &input.identities,
        &canonical,
        CanonicalSignals {
            importance: &input.signals.importance,
            semantic_priority: &input.signals.semantic_priority,
            density_mass: &input.signals.density_mass,
            labels: &labels,
        },
        config.materialization,
    )?;
    let persistence_comparison = compare_persistence(
        checkpoint.content_hash,
        &canonical,
        &canonical_artifacts.merge_tree,
        &reference_tree,
        persistence_reference_source,
        config.persistence_policy,
        config.persistence_evaluator,
    )?;
    let legacy = export_legacy_canvas(
        &directory,
        LegacyLayoutTag::new(config.legacy_tag)?,
        &input.identities,
        &canonical,
    )?;

    populate_manifest(
        &mut manifest,
        geometry.content_hash(),
        edge_snapshot_hash,
        geometry.allow_list_hash(),
        relation_policy_hash,
        audit,
        &selection,
        persistence_reference_source,
        &canonical,
        config.condition_quality_evaluator.suite_version(),
        canonical_quality,
        config.condition_quality_policy,
        quantization,
        &canonical_artifacts.base.ranked,
        config.materialization.analytic_configuration,
        canonical_artifacts.merge_tree_hash,
        persistence_comparison,
        CanonicalGateMeasurements {
            relation_baseline_field_hash: baseline.content_hash(),
            baseline_relation_loss,
            canonical_relation_loss,
            relation_loss_tolerance: config.condition_measurement.monotonicity_tolerance,
            normalized_persistence: canonical_artifacts.normalized_persistence,
        },
        input.identities.len(),
        input.identities.content_hash(),
        config.projector,
        config.projector_loss,
        config.projector_loss.content_hash(),
        fitted.training_config_hash,
        representation_artifact,
        classifier,
        semantic_artifact,
        semantic.backend,
        semantic.configuration,
        semantic_weights.content_hash(),
        relation_artifact,
        landmark_artifact,
        reference_artifact,
        checkpoint.content_hash,
        checkpoint.byte_length,
        canonical_artifacts.base.artifact,
        canonical_artifacts.analytic,
        &legacy,
        config.semantic_graph,
        config.landmarks,
        config.attraction,
        config.protection,
    )?;
    let canonical_manifest = manifest
        .variants
        .entries
        .iter()
        .find(|variant| variant.id == manifest.variants.canonical_variant)
        .ok_or(CanonicalGenerationError::ManifestContractCanonical)?;
    let payloads = Vec::from([
        GateEvidencePayload::ann_recall(audit),
        GateEvidencePayload::relation_satisfaction(
            canonical_manifest.selection_evidence_hash,
            baseline.content_hash(),
            canonical.content_hash(),
            baseline_relation_loss,
            canonical_relation_loss,
            config.condition_measurement.monotonicity_tolerance,
        ),
        GateEvidencePayload::snapshot_consistency(
            manifest.input_snapshot.frozen_input_hash,
            geometry.content_hash(),
            input.identities.content_hash(),
            manifest.storage.row_count,
        ),
    ]);
    Ok(UnreleasedGeneration {
        manifest,
        payloads,
        legacy,
        training_wall_time: fitted.metrics.wall_time,
        directory,
    })
}

fn verify_reproduction(
    primary: &UnreleasedGeneration,
    reproduction: &UnreleasedGeneration,
) -> Result<(), CanonicalGenerationError> {
    if primary.manifest != reproduction.manifest {
        return Err(CanonicalGenerationError::ReproductionManifest);
    }
    if primary.payloads != reproduction.payloads {
        return Err(CanonicalGenerationError::ReproductionEvidence);
    }
    for artifact in &primary.manifest.artifacts {
        let primary_file = File::open(primary.directory.join(&artifact.relative_path))?;
        let reproduction_file = File::open(reproduction.directory.join(&artifact.relative_path))?;
        if !files_equal(primary_file, reproduction_file)? {
            return Err(CanonicalGenerationError::ReproductionArtifact {
                role: artifact.role,
            });
        }
    }
    Ok(())
}

fn files_equal(mut left: File, mut right: File) -> Result<bool, std::io::Error> {
    if left.metadata()?.len() != right.metadata()?.len() {
        return Ok(false);
    }
    left.lock_shared()?;
    right.lock_shared()?;
    let mut left_buffer = [0_u8; 16 * 1024];
    let mut right_buffer = [0_u8; 16 * 1024];
    loop {
        let left_read = left.read(&mut left_buffer)?;
        let right_read = right.read(&mut right_buffer)?;
        if left_read != right_read {
            return Ok(false);
        }
        if left_buffer[..left_read] != right_buffer[..left_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
}

fn landmark_support(
    rows: &[GenerationRowId],
    coordinates: &[[f64; 2]],
    radius: f64,
    weight: f64,
) -> Vec<CoordinateSupportRow> {
    rows.iter()
        .copied()
        .zip(coordinates.iter().copied())
        .map(|(row, target)| CoordinateSupportRow {
            row,
            target,
            radius,
            weight,
        })
        .collect()
}

fn projector_evidence_hash(
    semantic: crate::salt::hash::ContentHash,
    relations: crate::salt::hash::ContentHash,
    landmarks: crate::salt::hash::ContentHash,
) -> crate::salt::hash::ContentHash {
    let mut hasher =
        crate::salt::hash::ContentHasher::new(b"hash.graph.atlas.salt.projector-evidence.v1");
    hasher.update(semantic.as_bytes());
    hasher.update(relations.as_bytes());
    hasher.update(landmarks.as_bytes());
    hasher.finish()
}
