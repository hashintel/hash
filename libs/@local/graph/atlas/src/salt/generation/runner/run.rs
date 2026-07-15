use std::fs::{self, File};

use burn::tensor::backend::AutodiffBackend;

use super::{
    CanonicalGenerationConfig, CanonicalGenerationError, CanonicalGenerationOutcome,
    FrozenGenerationInput,
    artifact::copy_model,
    identity::{generation_id, input_hash, relation_policy_hash, runtime_config_hash},
    manifest::populate_manifest,
};
use crate::salt::{
    generation::{
        CanonicalSignals, LegacyLayoutTag, export_legacy_canvas, materialize_canonical,
        project_condition_ladder, publish_generation_candidate,
    },
    graph::{
        USearchIndex, audit::audit_recall, build_semantic_graph, fuzzy_edge_weights,
        publish_semantic_graph,
    },
    identity::GenerationRowId,
    landmark::{
        assign_landmarks, fit_landmark_skeleton, publish_landmark_skeleton, select_landmarks,
    },
    manifest::SeedManifest,
    projector::{
        AdaptiveProjectorBatchFactory, AdaptiveProjectorSource, CoordinateSupportRow,
        fit_conditioned_projector_adaptive, publish_projector_checkpoint,
    },
    relation::{build_relation_indexes, publish_relation_indexes},
    release::{GateEvidence, GateEvidenceSet, ReleaseHead},
    revision::{BaseRevision, DataRevision, DeltaRevision},
};

pub(super) const CLASSIFIER_FILE: &str = "classifier.salt";
pub(super) const STRENGTH_FILE: &str = "strength.salt";
pub(super) const SEMANTIC_FILE: &str = "semantic.salt";
pub(super) const RELATION_FILE: &str = "relations.salt";
pub(super) const LANDMARK_FILE: &str = "landmarks.salt";
pub(super) const PROJECTOR_FILE: &str = "projector.mpk";
pub(super) const BASE_FILE: &str = "base.salt";
pub(super) const ANALYTIC_FILE: &str = "analytics.salt";

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
#[expect(
    clippy::too_many_lines,
    reason = "the runner intentionally presents one auditable stage-order transaction"
)]
pub(crate) fn run_canonical_generation<B>(
    input: &FrozenGenerationInput,
    mut config: CanonicalGenerationConfig<'_>,
    device: &B::Device,
) -> Result<CanonicalGenerationOutcome, CanonicalGenerationError>
where
    B: AutodiffBackend,
{
    let geometry = &input.geometry;
    let representations = input.representations();
    let type_context = input.type_context();
    let verifier = config.gate_signer.verifier();
    verifier
        .authority()
        .clone_into(&mut config.manifest.serving.gate_evidence_authority);
    config.manifest.serving.gate_evidence_public_key = verifier.public_key();
    config.manifest.reproducibility.seeds = vec![
        SeedManifest {
            name: "importance".to_owned(),
            value: config.materialization.importance.hash_seed,
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
    config.manifest.reproducibility.config_hash = runtime_config_hash(&config);
    config.manifest.input_snapshot.frozen_input_hash = input_hash(input);
    if config.manifest.relations.security_mode != geometry.mode() {
        return Err(CanonicalGenerationError::SecurityPolicy);
    }
    let relation_policy_hash = relation_policy_hash(input);
    config.manifest.relations.classifier_temperature = input.classifier.temperature;
    config.manifest.relations.strength_head.enabled = input.strength_head.is_some();
    let generation_id = generation_id(
        &config.manifest,
        input.relation_snapshot_hash,
        relation_policy_hash,
        input.classifier.content_hash,
        input
            .strength_head
            .as_ref()
            .map(|artifact| artifact.content_hash),
        input,
        &config,
    );
    config.manifest.generation_id = generation_id;
    let directory = config
        .root
        .join("generations")
        .join(generation_id.to_string());
    fs::create_dir_all(&directory)?;

    let classifier = copy_model(
        &input.classifier,
        &directory.join(CLASSIFIER_FILE),
        crate::salt::format::CLASSIFIER_FORMAT,
    )?;
    let strength = input
        .strength_head
        .as_ref()
        .map(|source| {
            copy_model(
                source,
                &directory.join(STRENGTH_FILE),
                crate::salt::format::STRENGTH_CLASSIFIER_FORMAT,
            )
        })
        .transpose()?;

    let index = USearchIndex::build(representations, config.semantic_index)?;
    let audit = audit_recall(representations, &index, config.audit_rows)?.require_minimum()?;
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
    let evaluated = projected.evaluate(
        config.condition_domain,
        core::mem::take(&mut config.condition_quality),
        &relations.attraction,
        &semantic.table,
        config.projector_loss.relation,
        config.condition_measurement,
    )?;
    let canonical = evaluated.select_canonical(config.canonical_condition)?;
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
    let legacy = export_legacy_canvas(
        &directory,
        LegacyLayoutTag::new(config.legacy_tag)?,
        &input.identities,
        &canonical,
    )?;

    populate_manifest(
        &mut config.manifest,
        geometry.content_hash(),
        edge_snapshot_hash,
        geometry.allow_list_hash(),
        relation_policy_hash,
        audit.content_hash(),
        audit.recall,
        &selection,
        &canonical,
        &canonical_artifacts.base.ranked,
        config.materialization.analytic_configuration,
        canonical_artifacts.merge_tree_hash,
        input.identities.len(),
        input.identities.content_hash(),
        config.projector,
        config.projector_loss,
        config.projector_loss.content_hash(),
        fitted.training_config_hash,
        classifier,
        strength,
        semantic_artifact,
        semantic.backend,
        semantic.configuration,
        semantic_weights.content_hash(),
        relation_artifact,
        landmark_artifact,
        checkpoint.content_hash,
        checkpoint.byte_length,
        canonical_artifacts.base.artifact,
        canonical_artifacts.analytic,
        &legacy,
        config.semantic_graph,
        config.landmarks,
        config.attraction,
        config.protection,
    );
    let manifest_hash = config.manifest.content_hash()?;
    let head = ReleaseHead {
        generation: generation_id,
        data: DataRevision::new(BaseRevision::ZERO, DeltaRevision::ZERO),
        manifest: manifest_hash,
    };
    let mut payloads = core::mem::take(&mut config.gate_payloads);
    payloads.push(crate::salt::release::GateEvidencePayload::ann_recall(
        audit.content_hash(),
        audit.recall,
    ));
    let documents = payloads
        .into_iter()
        .map(|payload| GateEvidence::sign(head, payload, config.gate_signer))
        .collect::<Result<Vec<_>, _>>()?;
    let evidence = GateEvidenceSet::new(head, &config.manifest, &verifier, documents)?;
    let candidate = publish_generation_candidate(config.root, &config.manifest, &evidence)?;
    File::open(&directory)?.sync_all()?;
    Ok(CanonicalGenerationOutcome {
        candidate,
        manifest: config.manifest,
        legacy,
        training_wall_time: fitted.metrics.wall_time,
        directory,
    })
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
