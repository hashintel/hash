use core::num::NonZeroUsize;

use burn::backend::{Autodiff, NdArray, ndarray::NdArrayDevice};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    graph::{KnnTable, ProjectorEmbeddings, SemanticEdgeWeights},
    hash::ContentHash,
    identity::{ArtifactOrdinal, GenerationRowId},
    relation::{AttractionEdge, RelationConfidence},
    representation::PROJECTOR_DIMENSIONS,
    strength::RelationStrength,
};

type TrainBackend = Autodiff<NdArray>;

#[test]
fn adaptive_fit_refreshes_and_samples_every_objective_channel() {
    let device = NdArrayDevice::Cpu;
    let architecture = ProjectorConfig {
        width: 8,
        residual_blocks: 1,
        role_dimensions: 2,
        ..ProjectorConfig::default()
    };
    let mut representations = (0..8 * PROJECTOR_DIMENSIONS)
        .map(|index| {
            let row = index / PROJECTOR_DIMENSIONS;
            let column = index % PROJECTOR_DIMENSIONS;
            f32::from(u16::try_from((row * 17 + column) % 101).expect("remainder should fit u16"))
                / 101.0
                - 0.5
        })
        .collect::<Vec<_>>();
    for row in representations.chunks_exact_mut(PROJECTOR_DIMENSIONS) {
        let inverse_norm = row
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt()
            .recip();
        for value in row {
            *value *= inverse_norm;
        }
    }
    let roles = [EntityRole::KnowledgeEntity; 8];
    let graph = KnnTable::new(8, 1, vec![1, 2, 3, 4, 5, 6, 7, 0], vec![0.1; 8])
        .expect("semantic graph should validate");
    let weights =
        SemanticEdgeWeights::new(&graph, vec![1.0; 8]).expect("semantic weights should validate");
    let relations = [AttractionEdge {
        link_entity: EntityId {
            web_id: WebId::new(Uuid::from_u128(80)),
            entity_uuid: EntityUuid::new(Uuid::from_u128(81)),
            draft_id: None,
        },
        relation: ArtifactOrdinal::try_from(0_u32).expect("ordinal should validate"),
        left: GenerationRowId::try_from(0_u32).expect("row should validate"),
        right: GenerationRowId::try_from(4_u32).expect("row should validate"),
        confidence: RelationConfidence::default().effective(),
        degree_normalization: 1.0,
        strength: RelationStrength::UNIT,
        coincident: 0.0,
        proximal: 1.0,
    }];
    let hard_negative = HardNegativeConfig {
        neighbors: NonZeroUsize::new(1).expect("neighbor count should be non-zero"),
        candidate_multiplier: NonZeroUsize::new(4).expect("multiplier should be non-zero"),
        connectivity: NonZeroUsize::new(4).expect("connectivity should be non-zero"),
        expansion_add: NonZeroUsize::new(16).expect("expansion should be non-zero"),
        expansion_search: NonZeroUsize::new(16).expect("expansion should be non-zero"),
        maximum_weight: 1.0,
        rank_exponent: 1.0,
    };
    let factory = AdaptiveProjectorBatchFactory::new(
        AdaptiveProjectorSource {
            representations: ProjectorEmbeddings::new(&representations)
                .expect("representations should validate"),
            roles: &roles,
            type_context: None,
            semantic: &graph,
            semantic_weights: &weights,
            relations: &relations,
            protection: &[],
            anchors: &[],
            landmarks: &[],
            evidence_hash: ContentHash::digest(b"adaptive-fixture"),
        },
        ProjectorBatchPlanConfig {
            conditions: vec![0.0, 0.1].into_boxed_slice(),
            semantic_positive_count: NonZeroUsize::new(4)
                .expect("positive count should be non-zero"),
            ordinary_negative_count: 2,
            ordinary_negative_weight: 1.0,
            relation_type_count: NonZeroUsize::new(1)
                .expect("relation-type count should be non-zero"),
            relation_per_type_cap: NonZeroUsize::new(1).expect("relation cap should be non-zero"),
            anchor_count: 0,
            landmark_count: 0,
            hard_query_count: 1,
            hard_negative,
            refresh_interval: NonZeroUsize::new(1).expect("refresh interval should be non-zero"),
            refresh_condition: 0.1,
            inference_batch_size: NonZeroUsize::new(4).expect("inference batch should be non-zero"),
            type_context_dropout_probability: 0.2,
            seed: 83,
        },
    )
    .expect("adaptive batch plan should validate");
    let loss = ProjectorLossConfig::new(
        SemanticAffinity::new(1.0, 1.0, 1.0e-8, 2.0, 2.0).expect("affinity should validate"),
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).expect("relation energy should validate"),
        GradientBudget::new(0.25, 0.5, 1.0e-6, 1.0e-12).expect("budget should validate"),
        SupportEnergy {
            huber_delta: 1.0,
            epsilon: 1.0e-8,
        },
        LossWeights {
            semantic_positive: 1.0,
            ordinary_negative: 1.0,
            hard_negative: 1.0,
            relation: 1.0,
            anchor: 0.0,
            landmark: 0.0,
        },
    )
    .expect("loss configuration should validate");

    let fitted = fit_conditioned_projector_adaptive::<TrainBackend, _>(
        architecture,
        factory,
        loss,
        ProjectorOptimizerConfig {
            initial_learning_rate: 1.0e-3,
            minimum_learning_rate: 1.0e-4,
            steps: NonZeroUsize::new(2).expect("step count should be non-zero"),
            seed: 83,
        },
        &device,
    )
    .expect("adaptive fit should complete");

    assert_eq!(fitted.metrics.steps, 2);
    assert!(fitted.metrics.node_updates >= 8);
    assert!(fitted.metrics.mean_unclipped_relation_ratio.is_finite());
}
