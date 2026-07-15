#![expect(
    clippy::little_endian_bytes,
    reason = "generation identities use canonical little-endian scalar encodings"
)]

use serde::Serialize;
use type_system::knowledge::entity::id::EntityId;
use uuid::Uuid;

use crate::salt::{
    generation::runner::{CanonicalGenerationConfig, FrozenGenerationInput},
    hash::{ContentHash, ContentHasher},
    manifest::GenerationManifest,
    revision::GenerationId,
};

pub(super) fn generation_id(
    manifest: &GenerationManifest,
    geometry: ContentHash,
    relation_policy: ContentHash,
    classifier: ContentHash,
    input: &FrozenGenerationInput,
    config: &CanonicalGenerationConfig<'_>,
) -> GenerationId {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.generation.v5");
    hasher.update(manifest_contract_hash(manifest).as_bytes());
    hasher.update(geometry.as_bytes());
    hasher.update(relation_policy.as_bytes());
    hasher.update(input_hash(input).as_bytes());
    hasher.update(runtime_config_hash(config).as_bytes());
    hasher.update(classifier.as_bytes());
    hasher.update(&[0]);
    GenerationId::new(hasher.finish())
}

pub(super) fn manifest_contract_hash(manifest: &GenerationManifest) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.manifest-contract.v4");
    hasher.update(&manifest.format_version.to_le_bytes());
    hash_serialized(&mut hasher, &manifest.created_at);
    hash_serialized(&mut hasher, &manifest.input_snapshot);
    hasher.update(manifest.embedding.model.as_bytes());
    hasher.update(manifest.embedding.producer_contract_hash.as_bytes());
    hasher.update(
        &u64::try_from(manifest.embedding.canonical_dimensions)
            .expect("canonical dimensions should fit u64")
            .to_le_bytes(),
    );
    hasher.update(
        &u64::try_from(manifest.embedding.projector_dimensions)
            .expect("projector dimensions should fit u64")
            .to_le_bytes(),
    );
    hasher.update(manifest.embedding.transform_version.as_bytes());
    hasher.update(manifest.embedding.transform_hash.as_bytes());
    hasher.update(manifest.embedding.golden_vectors_hash.as_bytes());
    hash_serialized(&mut hasher, &manifest.embedding.representation_audit);
    hash_relation_contract(&mut hasher, manifest);
    hash_serialized(&mut hasher, &manifest.semantic_graph.metric);
    hasher.update(manifest.landmarks.selection_version.as_bytes());
    hasher.update(&manifest.projector.architecture_version.to_le_bytes());
    hasher.update(&manifest.variants.canonical_variant.get().to_le_bytes());
    hasher.update(
        &u64::try_from(manifest.variants.maximum_published_variants)
            .expect("published variant limit should fit u64")
            .to_le_bytes(),
    );
    hash_serialized(&mut hasher, &manifest.storage.row_id_encoding);
    hasher.update(manifest.reproducibility.code_revision.as_bytes());
    let mut seeds = manifest.reproducibility.seeds.iter().collect::<Vec<_>>();
    seeds.sort_unstable_by(|left, right| left.name.cmp(&right.name));
    for seed in seeds {
        hasher.update(seed.name.as_bytes());
        hasher.update(&seed.value.to_le_bytes());
    }
    let mut serving = manifest.serving.clone();
    serving.wire_versions.sort_unstable();
    hash_serialized(&mut hasher, &serving);
    hasher.finish()
}

pub(super) fn input_hash(input: &FrozenGenerationInput) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.canonical-input.v6");
    hasher.update(input.relation_snapshot_hash.as_bytes());
    hasher.update(input.relation_policy_input_hash.as_bytes());
    hasher.update(input.canonical_embedding_hash.as_bytes());
    hasher.update(input.projector_representation_hash.as_bytes());
    for (_, entity) in input.identities.iter() {
        hash_entity(&mut hasher, entity);
    }
    for role in &input.roles {
        hasher.update(&role.index().to_le_bytes());
    }
    if let Some(context) = input.type_context() {
        hasher.update(&[1]);
        hasher.update(
            &u64::try_from(context.rows())
                .expect("type-context rows should fit u64")
                .to_le_bytes(),
        );
        hasher.update(
            &u64::try_from(context.dimensions())
                .expect("type-context dimensions should fit u64")
                .to_le_bytes(),
        );
        for value in context.values() {
            hasher.update(&value.to_bits().to_le_bytes());
        }
    } else {
        hasher.update(&[0]);
    }
    let mut confidence = input.relation_confidence.iter().collect::<Vec<_>>();
    confidence.sort_unstable_by_key(|(entity, _)| entity_key(entity));
    for (entity, values) in confidence {
        hash_entity(&mut hasher, entity);
        for value in [values.link, values.left, values.right] {
            hasher.update(&[u8::from(value.is_some())]);
            if let Some(value) = value {
                hasher.update(&value.get().to_bits().to_le_bytes());
            }
        }
    }
    let mut candidates = input.landmark_candidates.iter().collect::<Vec<_>>();
    candidates.sort_unstable_by_key(|candidate| candidate.row);
    for candidate in candidates {
        hasher.update(&candidate.row.as_u32().to_le_bytes());
        hasher.update(&candidate.sampling_weight.to_bits().to_le_bytes());
        for value in [
            candidate.density,
            candidate.language,
            candidate.source,
            candidate.entity_role,
            candidate.type_family,
            candidate.community,
            candidate.temporal_cohort,
        ] {
            hasher.update(&value.to_le_bytes());
        }
        hasher.update(&[u8::from(candidate.prior_landmark)]);
    }
    let mut minimums = input.subgroup_minimums.iter().collect::<Vec<_>>();
    minimums.sort_unstable_by_key(|minimum| minimum.stratum);
    for minimum in minimums {
        hasher.update(&[minimum.stratum.dimension as u8]);
        hasher.update(&minimum.stratum.value.to_le_bytes());
        hasher.update(
            &u64::try_from(minimum.count.get())
                .expect("subgroup minimum should fit u64")
                .to_le_bytes(),
        );
    }
    for anchor in &input.anchors {
        hasher.update(&anchor.row.as_u32().to_le_bytes());
        hash_f64(&mut hasher, &anchor.target);
        hash_f64(&mut hasher, &[anchor.radius, anchor.weight]);
    }
    hash_f64(&mut hasher, &input.signals.importance);
    hash_f64(&mut hasher, &input.signals.semantic_priority);
    hash_f64(&mut hasher, &input.signals.density_mass);
    for label in &input.signals.labels {
        hasher.update(&[u8::from(label.is_some())]);
        if let Some(label) = label {
            hasher.update(label.as_bytes());
        }
    }
    hasher.finish()
}

pub(super) fn runtime_config_hash(config: &CanonicalGenerationConfig<'_>) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.runtime-config.v5");
    hash_usizes(
        &mut hasher,
        &[
            config.semantic_index.connectivity.get(),
            config.semantic_index.expansion_add.get(),
            config.semantic_index.expansion_search.get(),
            config.semantic_graph.neighbors.get(),
            config.landmarks.maximum_count.get(),
            config.landmark_assignment.connectivity.get(),
            config.landmark_assignment.expansion_add.get(),
            config.landmark_assignment.expansion_search.get(),
            config.landmark_fit.maximum_neighbors.get(),
            config.landmark_fit.epochs.get(),
            config.landmark_fit.negative_sample_rate.get(),
            config.inference_batch_size.get(),
            config.materialization.raster.grid_size,
            config.materialization.regions.maximum_regions,
        ],
    );
    hash_f64(
        &mut hasher,
        &[
            config.attraction.coefficients.coincident,
            config.attraction.coefficients.proximal,
            config.attraction.force_pruning_threshold,
            config.protection.hard_floor.get(),
            config.protection.ordinary_floor.get(),
            config.protection.hard_threshold.get(),
            config.protection.ordinary_threshold.get(),
            config.landmarks.retained_fraction,
            config.landmark_fit.initial_learning_rate,
            config.landmark_fit.repulsion_strength,
            config.landmark_fit.spread,
            config.landmark_fit.minimum_distance,
            config.landmark_radius,
            config.landmark_weight,
            config.condition_measurement.distinguishability_floor,
            config.condition_measurement.monotonicity_tolerance,
            config.variant_quantization_step,
            config.materialization.raster.bandwidth_pixels,
            config.materialization.merge_tree.floor_fraction,
            config.materialization.merge_tree.persistence_fraction,
            config.materialization.regions.density_floor_fraction,
            config.materialization.regions.minimum_peak_fraction,
        ],
    );
    hasher.update(&[u8::from(config.protection.protect_ordinary_negatives)]);
    hasher.update(&config.landmarks.seed.to_le_bytes());
    hasher.update(&config.landmark_fit.seed.to_le_bytes());
    hasher.update(config.projector.content_hash().as_bytes());
    hasher.update(config.projector_batches.content_hash().as_bytes());
    hasher.update(config.projector_loss.content_hash().as_bytes());
    hasher.update(config.projector_optimizer.content_hash().as_bytes());
    hasher.update(config.condition_domain.version().as_bytes());
    hasher.update(
        &u64::try_from(config.audit_sample_size.get())
            .expect("audit sample size should fit u64")
            .to_le_bytes(),
    );
    hasher.update(&config.audit_seed.to_le_bytes());
    hasher.update(&config.canonical_condition.to_bits().to_le_bytes());
    for condition in config.conditions {
        hasher.update(&condition.to_bits().to_le_bytes());
    }
    hasher.update(
        config
            .condition_quality_evaluator
            .contract_hash()
            .as_bytes(),
    );
    hasher.update(
        config
            .condition_quality_evaluator
            .suite_version()
            .as_bytes(),
    );
    hasher.update(config.condition_quality_policy.content_hash().as_bytes());
    hasher.update(config.persistence_policy.content_hash().as_bytes());
    hasher.update(config.persistence_evaluator.contract_hash().as_bytes());
    hasher.update(config.persistence_evaluator.suite_version().as_bytes());
    hasher.update(config.materialization.importance.grid_depths);
    hasher.update(&config.materialization.importance.hash_seed.to_le_bytes());
    hash_f64(
        &mut hasher,
        &config.materialization.importance.bounds.minimum(),
    );
    hash_f64(
        &mut hasher,
        &config.materialization.importance.bounds.maximum(),
    );
    hasher.update(config.materialization.analytic_configuration.as_bytes());
    hasher.update(&config.legacy_tag.to_le_bytes());
    hasher.finish()
}

fn hash_usizes(hasher: &mut ContentHasher, values: &[usize]) {
    for value in values {
        hasher.update(
            &u64::try_from(*value)
                .expect("generation count should fit u64")
                .to_le_bytes(),
        );
    }
}

fn hash_f64(hasher: &mut ContentHasher, values: &[f64]) {
    for value in values {
        hasher.update(&value.to_bits().to_le_bytes());
    }
}

fn hash_serialized<T: Serialize>(hasher: &mut ContentHasher, value: &T) {
    hasher.update(
        &serde_json::to_vec(value)
            .expect("generation identity inputs should serialize to canonical JSON"),
    );
}

fn hash_relation_contract(hasher: &mut ContentHasher, manifest: &GenerationManifest) {
    let derived_hash = ContentHash::digest(b"salt-derived-relation-manifest-field");
    let mut relations = manifest.relations.clone();
    relations.security_allow_list_hash = derived_hash;
    relations.security_geometry_hash = derived_hash;
    relations.edge_snapshot_hash = derived_hash;
    relations.policy_input_hash = derived_hash;
    relations.policy_hash = derived_hash;
    relations.classifier_model_hash = derived_hash;
    relations.classifier_temperature = 1.0;
    relations.strength_head.enabled = false;
    relations.strength_head.model_hash = derived_hash;
    relations.strength_head.materialized_table_hash = None;
    relations.attraction_geometry_coefficients.coincident = 0.0;
    relations.attraction_geometry_coefficients.proximal = 0.0;
    relations.attraction_geometry_coefficients.overlay = 0.0;
    relations.attraction_force_pruning_threshold = 0.0;
    relations
        .negative_admission
        .protection_applicability
        .hard_negative_floor = 0.0;
    relations
        .negative_admission
        .protection_applicability
        .ordinary_negative_floor = 0.0;
    relations
        .negative_admission
        .hard_negative_protection_threshold = 0.0;
    relations
        .negative_admission
        .ordinary_negative_protection_threshold = 0.0;
    hash_serialized(hasher, &relations);
}

fn hash_entity(hasher: &mut ContentHasher, entity: &EntityId) {
    hasher.update(&entity_key(entity));
}

fn entity_key(entity: &EntityId) -> [u8; 49] {
    let mut key = [0_u8; 49];
    let web_id: Uuid = entity.web_id.into();
    let entity_uuid: Uuid = entity.entity_uuid.into();
    key[..16].copy_from_slice(web_id.as_bytes());
    key[16..32].copy_from_slice(entity_uuid.as_bytes());
    if let Some(draft_id) = entity.draft_id {
        let draft_id: Uuid = draft_id.into();
        key[32] = 1;
        key[33..].copy_from_slice(draft_id.as_bytes());
    }
    key
}

pub(super) fn relation_policy_hash(input: &FrozenGenerationInput) -> ContentHash {
    crate::salt::relation::relation_policy_hash(&input.relation_ordinals, &input.relation_policies)
}
