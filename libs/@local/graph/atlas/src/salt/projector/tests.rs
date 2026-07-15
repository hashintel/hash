use core::num::NonZeroUsize;

use burn::{
    backend::{Autodiff, Candle, candle::CandleDevice},
    tensor::{Int, Tensor, TensorData},
};
use camino::Utf8PathBuf;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use tempfile::tempdir;
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
    policy::Probability,
    relation::{AttractionEdge, PairProtection, RelationConfidence, RelationPair},
    representation::PROJECTOR_DIMENSIONS,
    strength::RelationStrength,
};

type TestBackend = Candle;
type TrainBackend = Autodiff<Candle>;

#[test]
fn architecture_validation_rejects_unbounded_resource_shapes() {
    let error = ProjectorConfig {
        width: 1_025,
        ..ProjectorConfig::default()
    }
    .validate()
    .expect_err("width above the M0 envelope must fail before allocation");

    assert!(matches!(
        error,
        ProjectorError::DimensionLimit {
            field: "hidden width",
            value: 1_025,
            maximum: 1_024,
        }
    ));
}

#[test]
fn film_is_identity_for_every_condition_at_initialization() {
    let device = CandleDevice::Cpu;
    let projector = ConditionedProjector::<TestBackend>::new_seeded(
        ProjectorConfig {
            width: 16,
            residual_blocks: 2,
            role_dimensions: 4,
            ..ProjectorConfig::default()
        },
        42,
        &device,
    )
    .expect("test architecture should initialize");

    let zero = projector
        .forward(input(&device, [0.0, 0.0]))
        .expect("zero-condition forward should succeed")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates should download");
    let one = projector
        .forward(input(&device, [1.0, 1.0]))
        .expect("unit-condition forward should succeed")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates should download");

    for (zero, one) in zero.into_iter().zip(one) {
        assert!((zero - one).abs() <= 1.0e-6);
    }
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "deterministic initialization requires bit-identical concurrent outputs"
)]
fn seeded_initialization_is_deterministic_under_concurrency() {
    let handles = (0..8)
        .map(|_| {
            std::thread::spawn(|| {
                let device = CandleDevice::Cpu;
                ConditionedProjector::<TestBackend>::new_seeded(
                    ProjectorConfig {
                        width: 16,
                        residual_blocks: 2,
                        role_dimensions: 4,
                        ..ProjectorConfig::default()
                    },
                    42,
                    &device,
                )
                .expect("seeded architecture should initialize")
                .forward(input(&device, [0.25, 0.25]))
                .expect("seeded projector should run")
                .into_data()
                .to_vec::<f32>()
                .expect("coordinates should download")
            })
        })
        .collect::<Vec<_>>();
    let outputs = handles
        .into_iter()
        .map(|handle| handle.join().expect("projector thread should complete"))
        .collect::<Vec<_>>();

    assert!(outputs.windows(2).all(|pair| pair[0] == pair[1]));
}

#[test]
fn forward_rejects_mismatched_context_contracts_before_backend_operations() {
    let device = CandleDevice::Cpu;
    let projector = ConditionedProjector::<TestBackend>::new(
        ProjectorConfig {
            width: 8,
            residual_blocks: 1,
            type_context_dimensions: 3,
            role_dimensions: 2,
            ..ProjectorConfig::default()
        },
        &device,
    )
    .expect("test architecture should initialize");
    let representation = Tensor::from_data(
        TensorData::new(
            vec![0.0_f32; PROJECTOR_DIMENSIONS],
            [1, PROJECTOR_DIMENSIONS],
        ),
        &device,
    );
    let roles =
        Tensor::<TestBackend, 2, Int>::from_data(TensorData::new(vec![0_i64], [1, 1]), &device);
    let condition = Tensor::from_data(TensorData::new(vec![0.5_f32], [1, 1]), &device);

    let error = projector
        .forward(ProjectorInput {
            representation,
            type_context: None,
            roles,
            condition,
        })
        .expect_err("configured type context must be supplied");

    assert_eq!(error, ProjectorError::MissingTypeContext { dimensions: 3 });
}

#[test]
fn semantic_cross_entropy_has_opposite_distance_monotonicity() {
    let affinity =
        SemanticAffinity::new(1.0, 1.0, 1.0e-8, 2.0, 3.0).expect("affinity should be valid");

    assert!(
        affinity
            .positive_loss(0.25, 1.0)
            .expect("distance should be valid")
            < affinity
                .positive_loss(4.0, 1.0)
                .expect("distance should be valid")
    );
    assert!(
        affinity
            .negative_loss(0.25, 1.0)
            .expect("distance should be valid")
            > affinity
                .negative_loss(4.0, 1.0)
                .expect("distance should be valid")
    );
    assert_eq!(
        affinity
            .positive_loss(1.0, 20.0)
            .expect("weight should be capped"),
        affinity
            .positive_loss(1.0, 2.0)
            .expect("weight should be accepted")
    );
}

#[test]
fn relation_energy_applies_each_edge_factor_once() {
    let energy = RelationEnergy::new(1.0, 2.0, 1.0, 1.0, 1.0e-8).expect("energy should be valid");
    let edge = AttractionEdge {
        link_entity: EntityId {
            web_id: WebId::new(Uuid::from_u128(1)),
            entity_uuid: EntityUuid::new(Uuid::from_u128(2)),
            draft_id: None,
        },
        relation: ArtifactOrdinal::try_from(0_u32).expect("ordinal should be valid"),
        left: GenerationRowId::try_from(0_u32).expect("row should be valid"),
        right: GenerationRowId::try_from(1_u32).expect("row should be valid"),
        confidence: RelationConfidence {
            link: Some(Probability::new(0.5).expect("probability should be valid")),
            left: None,
            right: None,
        }
        .effective(),
        degree_normalization: 0.25,
        strength: RelationStrength::new(0.8).expect("strength should be valid"),
        coincident: 2.0,
        proximal: 0.0,
    };

    let loss = energy
        .attraction_loss(3.0, edge)
        .expect("normalized distance should be valid");
    assert!((loss - 0.3).abs() < 1.0e-12);
    let extreme = energy
        .normalized_distance(1.0, 1.0e200, 1.0e200)
        .expect("finite local scales should not overflow their geometric mean");
    assert!(extreme.is_finite() && extreme > 0.0);
}

#[test]
fn coordinate_gradient_budget_preserves_direction_and_bounds_norm() {
    let budget = GradientBudget::new(0.1, 0.1, 1.0e-3, 1.0e-9).expect("budget should be valid");
    let clipped = budget
        .clip([3.0, 4.0], [30.0, 40.0])
        .expect("gradients should be valid");

    assert!(clipped.positive_clipped);
    assert!(clipped.total_clipped);
    assert!(clipped.value[0].hypot(clipped.value[1]) <= 0.5);
    assert!((clipped.value[0] / clipped.value[1] - 0.75).abs() < 1.0e-12);
}

#[test]
fn local_scale_is_the_median_persisted_neighbor_radius() {
    let semantic = KnnTable::new(
        3,
        2,
        vec![1, 2, 0, 2, 1, 0],
        vec![0.1, 0.2, 0.1, 0.2, 0.1, 0.2],
    )
    .expect("semantic table should be valid");
    let scales = local_scales(&[[0.0, 0.0], [2.0, 0.0], [8.0, 0.0]], &semantic)
        .expect("coordinates should be valid");

    assert_eq!(scales.as_slice(), &[5.0, 4.0, 7.0]);
}

#[test]
fn objective_rejects_non_finite_values() {
    assert!(matches!(
        SemanticAffinity::new(1.0, f64::NAN, 1.0e-8, 1.0, 1.0),
        Err(ObjectiveError::InvalidAffinity { .. })
    ));
    let budget = GradientBudget::new(0.1, 0.2, 1.0e-3, 1.0e-9).expect("budget should be valid");
    assert_eq!(
        budget.clip([0.0, 0.0], [f64::INFINITY, 0.0]),
        Err(ObjectiveError::NonFiniteGradient)
    );
}

#[test]
fn surrogate_step_clips_relation_coordinates_before_updating_model() {
    let device = CandleDevice::Cpu;
    let model = ConditionedProjector::<TrainBackend>::new_seeded(
        ProjectorConfig {
            width: 8,
            residual_blocks: 1,
            role_dimensions: 2,
            ..ProjectorConfig::default()
        },
        19,
        &device,
    )
    .expect("test architecture should initialize");
    let before = model
        .forward(training_input(&device))
        .expect("initial forward should succeed")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates should download");
    let positive = WeightedEdges {
        left: Tensor::from_data(TensorData::new(vec![0_i64, 1], [2]), &device),
        right: Tensor::from_data(TensorData::new(vec![1_i64, 2], [2]), &device),
        weight: Tensor::from_data(TensorData::new(vec![1.0_f32; 2], [2, 1]), &device),
    };
    let relation = RelationEdges {
        left: Tensor::from_data(TensorData::new(vec![0_i64], [1]), &device),
        right: Tensor::from_data(TensorData::new(vec![2_i64], [1]), &device),
        weight: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
        coincident: Tensor::from_data(TensorData::new(vec![0.0_f32], [1, 1]), &device),
        proximal: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
        left_scale: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
        right_scale: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
    };
    let config = ProjectorLossConfig::new(
        SemanticAffinity::new(1.0, 1.0, 1.0e-8, 2.0, 2.0).expect("affinity should validate"),
        RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8).expect("relation energy should validate"),
        GradientBudget::new(1.0e-6, 1.0e-6, 1.0e-6, 1.0e-12).expect("budget should validate"),
        SupportEnergy {
            huber_delta: 1.0,
            epsilon: 1.0e-8,
        },
        LossWeights {
            semantic_positive: 1.0,
            ordinary_negative: 0.0,
            hard_negative: 0.0,
            relation: 1.0,
            anchor: 0.0,
            landmark: 0.0,
        },
    )
    .expect("loss configuration should validate");
    let step = training_step(
        &model,
        ProjectorTrainingBatch {
            input: training_input(&device),
            semantic_positive: Some(positive),
            ordinary_negative: None,
            hard_negative: None,
            relation: Some(relation),
            anchors: None,
            landmarks: None,
            relation_condition: 1.0,
        },
        config,
    )
    .expect("training step should succeed");
    let factors = step
        .diagnostics
        .positive_factor
        .into_data()
        .to_vec::<f32>()
        .expect("clip factors should download");
    let fitted = fit_conditioned_projector(
        model,
        [ProjectorTrainingBatch {
            input: training_input(&device),
            semantic_positive: Some(WeightedEdges {
                left: Tensor::from_data(TensorData::new(vec![0_i64, 1], [2]), &device),
                right: Tensor::from_data(TensorData::new(vec![1_i64, 2], [2]), &device),
                weight: Tensor::from_data(TensorData::new(vec![1.0_f32; 2], [2, 1]), &device),
            }),
            ordinary_negative: None,
            hard_negative: None,
            relation: Some(RelationEdges {
                left: Tensor::from_data(TensorData::new(vec![0_i64], [1]), &device),
                right: Tensor::from_data(TensorData::new(vec![2_i64], [1]), &device),
                weight: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
                coincident: Tensor::from_data(TensorData::new(vec![0.0_f32], [1, 1]), &device),
                proximal: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
                left_scale: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
                right_scale: Tensor::from_data(TensorData::new(vec![1.0_f32], [1, 1]), &device),
            }),
            anchors: None,
            landmarks: None,
            relation_condition: 1.0,
        }],
        config,
        ProjectorOptimizerConfig {
            initial_learning_rate: 1.0e-3,
            minimum_learning_rate: 1.0e-4,
            steps: NonZeroUsize::new(1).expect("step count should be non-zero"),
            seed: 19,
        },
        &device,
    )
    .expect("one-step optimizer should succeed");
    let after = fitted
        .model
        .forward(validation_input(&device))
        .expect("updated forward should succeed")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates should download");
    let directory = tempdir().expect("temporary directory should exist");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("projector.mpk"))
        .expect("temporary path should be UTF-8");
    let published =
        publish_projector_checkpoint(&path, &fitted.model).expect("checkpoint should publish");
    let repeated = publish_projector_checkpoint(&path, &fitted.model)
        .expect("checkpoint publication should be idempotent");
    let loaded = load_projector_checkpoint::<TestBackend>(
        &path,
        ProjectorConfig {
            width: 8,
            residual_blocks: 1,
            role_dimensions: 2,
            ..ProjectorConfig::default()
        },
        &device,
    )
    .expect("checkpoint should load");
    let restored = loaded
        .forward(validation_input(&device))
        .expect("restored forward should succeed")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates should download");
    let representation_values = training_representation();
    let projected = project_generation(
        &loaded,
        ProjectorEmbeddings::new(&representation_values)
            .expect("projector representations should validate"),
        &[
            EntityRole::KnowledgeEntity,
            EntityRole::OntologyType,
            EntityRole::Other,
        ],
        None,
        1.0,
        NonZeroUsize::new(2).expect("batch size should be non-zero"),
        &device,
    )
    .expect("bounded full-generation projection should succeed");

    assert!(factors.iter().all(|factor| *factor <= 1.0));
    assert!(factors.iter().any(|factor| *factor < 1.0));
    assert!(fitted.metrics.positive_clip_fraction > 0.0);
    assert!(!published.reused_existing);
    assert!(repeated.reused_existing);
    assert_eq!(published.content_hash, repeated.content_hash);
    assert_eq!(
        published.byte_length,
        std::fs::metadata(&path)
            .expect("published checkpoint should have metadata")
            .len()
    );
    assert_eq!(published.byte_length, repeated.byte_length);
    assert_eq!(after, restored);
    assert!(
        projected
            .into_iter()
            .flatten()
            .zip(restored.into_iter().map(f64::from))
            .all(|(batched, full)| (batched - full).abs() <= 1.0e-6)
    );
    assert!(
        before
            .iter()
            .zip(&after)
            .any(|(before, after)| (before - after).abs() > 1.0e-8)
    );
}

#[test]
fn checkpoint_rejects_architecture_mismatch_before_record_loading() {
    let device = CandleDevice::Cpu;
    let recorded = ProjectorConfig {
        width: 8,
        residual_blocks: 1,
        role_dimensions: 2,
        ..ProjectorConfig::default()
    };
    let model = ConditionedProjector::<TestBackend>::new(recorded, &device)
        .expect("recorded architecture should validate");
    let directory = tempdir().expect("temporary directory should exist");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("projector.mpk"))
        .expect("temporary path should be UTF-8");
    publish_projector_checkpoint(&path, &model).expect("checkpoint should publish");
    let expected = ProjectorConfig {
        width: 16,
        ..recorded
    };

    let error = load_projector_checkpoint::<TestBackend>(&path, expected, &device)
        .expect_err("mismatched architecture must fail closed");

    assert!(matches!(
        error,
        ProjectorCheckpointError::ArchitectureMismatch {
            expected: observed_expected,
            actual,
        } if observed_expected == expected && actual == recorded
    ));
}

#[test]
fn samplers_preserve_semantic_edges_and_exclude_protected_negatives() {
    let graph = KnnTable::new(
        6,
        1,
        vec![1, 2, 3, 4, 5, 0],
        vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    )
    .expect("semantic graph should validate");
    let protected_pair = RelationPair::new(
        GenerationRowId::from_u32(0).expect("row should validate"),
        GenerationRowId::from_u32(3).expect("row should validate"),
    );
    let protection = [PairProtection {
        pair: protected_pair,
        hard_mass: 1.0,
        ordinary_mass: 1.0,
        hard: true,
        ordinary: true,
    }];
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(71);

    let weights = SemanticEdgeWeights::new(&graph, vec![1.0; 6]).expect("weights should validate");
    let positives = sample_semantic_edges(&graph, &weights, 6, &mut rng)
        .expect("all semantic edges should sample");
    let negatives = OrdinaryNegativeSampler::new(&graph, &protection)
        .expect("protection should validate")
        .sample(4, 1.0, &mut rng)
        .expect("ordinary pool should contain enough pairs");

    assert_eq!(
        positives
            .iter()
            .map(|edge| (edge.left.as_u32(), edge.right.as_u32()))
            .collect::<std::collections::BTreeSet<_>>(),
        [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0)].into()
    );
    assert!(negatives.iter().all(|edge| {
        let pair = RelationPair::new(edge.left, edge.right);
        pair != protected_pair
            && !graph
                .indices(edge.left.as_usize())
                .contains(&edge.right.as_u32())
            && !graph
                .indices(edge.right.as_usize())
                .contains(&edge.left.as_u32())
    }));
}

#[test]
fn ordinary_negative_sampler_enumerates_after_rejection_stalls() {
    struct ZeroRng;

    impl rand::TryRng for ZeroRng {
        type Error = core::convert::Infallible;

        fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
            Ok(0)
        }

        fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
            Ok(0)
        }

        fn try_fill_bytes(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
            destination.fill(0);
            Ok(())
        }
    }

    let graph = KnnTable::new(
        4,
        2,
        vec![1, 2, 0, 2, 0, 1, 0, 1],
        vec![0.1, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1, 0.2],
    )
    .expect("semantic graph should validate");
    let sampled = OrdinaryNegativeSampler::new(&graph, &[])
        .expect("empty protection should validate")
        .sample(1, 1.0, &mut ZeroRng)
        .expect("the deterministic fallback should find the sole admissible pair");

    assert_eq!(sampled.len(), 1);
    assert_eq!(
        RelationPair::new(sampled[0].left, sampled[0].right),
        RelationPair::new(
            GenerationRowId::from_u32(2).expect("row should validate"),
            GenerationRowId::from_u32(3).expect("row should validate"),
        )
    );
}

#[test]
fn hard_miner_excludes_semantic_and_protected_pairs() {
    let graph = KnnTable::new(8, 1, vec![1, 2, 3, 4, 5, 6, 7, 0], vec![0.1; 8])
        .expect("semantic graph should validate");
    let query = GenerationRowId::from_u32(0).expect("row should validate");
    let protected_row = GenerationRowId::from_u32(2).expect("row should validate");
    let protection = [PairProtection {
        pair: RelationPair::new(query, protected_row),
        hard_mass: 1.0,
        ordinary_mass: 1.0,
        hard: true,
        ordinary: true,
    }];
    let config = HardNegativeConfig {
        neighbors: NonZeroUsize::new(2).expect("neighbor count should be non-zero"),
        candidate_multiplier: NonZeroUsize::new(3).expect("multiplier should be non-zero"),
        connectivity: NonZeroUsize::new(4).expect("connectivity should be non-zero"),
        expansion_add: NonZeroUsize::new(16).expect("expansion should be non-zero"),
        expansion_search: NonZeroUsize::new(16).expect("expansion should be non-zero"),
        maximum_weight: 2.0,
        rank_exponent: 1.0,
    };
    let coordinates = (0..8).map(|row| [f64::from(row), 0.0]).collect::<Vec<_>>();
    let spatial =
        USearchSpatialIndex::build(&coordinates, config).expect("spatial index should build");
    assert_eq!(spatial.identity(), config.content_hash());
    let mined = HardNegativeMiner::new(spatial, &graph, &protection, config)
        .expect("miner should validate")
        .mine(query)
        .expect("hard-negative pool should contain enough rows");

    assert!(mined.iter().all(|edge| {
        edge.right != query
            && edge.right != protected_row
            && edge.right.as_u32() != 1
            && edge.right.as_u32() != 7
    }));
    assert!(mined[0].weight > mined[1].weight);
}

#[test]
fn hard_miner_canonicalizes_tied_backend_distances() {
    #[derive(Copy, Clone)]
    struct TiedIndex {
        reverse: bool,
    }

    impl SpatialNeighborIndex for TiedIndex {
        fn rows(&self) -> usize {
            6
        }

        fn search(
            &self,
            row: GenerationRowId,
            limit: usize,
        ) -> Result<Vec<SpatialNeighbor>, HardNegativeError> {
            let tied = if self.reverse { [3, 2] } else { [2, 3] };
            Ok([
                SpatialNeighbor {
                    row: row.as_u32(),
                    distance: 0.0,
                },
                SpatialNeighbor {
                    row: tied[0],
                    distance: 1.0,
                },
                SpatialNeighbor {
                    row: tied[1],
                    distance: 1.0,
                },
                SpatialNeighbor {
                    row: 4,
                    distance: 2.0,
                },
                SpatialNeighbor {
                    row: 1,
                    distance: 3.0,
                },
            ]
            .into_iter()
            .take(limit)
            .collect())
        }

        fn identity(&self) -> ContentHash {
            ContentHash::digest(b"tied-spatial-index")
        }
    }

    let graph = KnnTable::new(6, 1, vec![1, 2, 3, 4, 5, 0], vec![0.1; 6])
        .expect("semantic graph should validate");
    let config = HardNegativeConfig {
        neighbors: NonZeroUsize::new(2).expect("neighbor count should be non-zero"),
        candidate_multiplier: NonZeroUsize::new(3).expect("multiplier should be non-zero"),
        connectivity: NonZeroUsize::new(4).expect("connectivity should be non-zero"),
        expansion_add: NonZeroUsize::new(8).expect("expansion should be non-zero"),
        expansion_search: NonZeroUsize::new(8).expect("expansion should be non-zero"),
        maximum_weight: 2.0,
        rank_exponent: 1.0,
    };
    let query = GenerationRowId::from_u32(0).expect("row should validate");
    let forward = HardNegativeMiner::new(TiedIndex { reverse: false }, &graph, &[], config)
        .expect("forward miner should validate")
        .mine(query)
        .expect("forward ties should mine");
    let reverse = HardNegativeMiner::new(TiedIndex { reverse: true }, &graph, &[], config)
        .expect("reverse miner should validate")
        .mine(query)
        .expect("reverse ties should mine");

    assert_eq!(forward, reverse);
    assert_eq!(
        forward
            .iter()
            .map(|edge| edge.right.as_u32())
            .collect::<Vec<_>>(),
        [2, 3]
    );
}

#[test]
fn prepared_batch_reuses_identical_evidence_across_conditions() {
    let device = CandleDevice::Cpu;
    let representations = training_representation();
    let positive = [SampledEdge {
        left: GenerationRowId::from_u32(2).expect("row should validate"),
        right: GenerationRowId::from_u32(0).expect("row should validate"),
        weight: 1.5,
    }];
    let anchors = [CoordinateSupportRow {
        row: GenerationRowId::from_u32(1).expect("row should validate"),
        target: [0.25, -0.5],
        radius: 2.0,
        weight: 0.75,
    }];
    let local_scales =
        LocalScales::new(vec![1.0, 2.0, 3.0], 3).expect("local scales should validate");
    let prepared = prepare_projector_batch::<TrainBackend>(
        ProjectorBatchSource {
            representations: ProjectorEmbeddings::new(&representations)
                .expect("representations should validate"),
            roles: &[
                EntityRole::KnowledgeEntity,
                EntityRole::OntologyType,
                EntityRole::Other,
            ],
            type_context: Some(
                ProjectorTypeContext::new(&[1.0, 2.0, 3.0], 3, 1)
                    .expect("type context should validate"),
            ),
            type_context_dropout: Some(TypeContextDropout {
                probability: 0.5,
                seed: 4,
                step: 0,
            }),
            semantic_positive: &positive,
            ordinary_negative: &[],
            hard_negative: &[],
            relation: &[],
            local_scales: &local_scales,
            anchors: &anchors,
            landmarks: &[],
        },
        &device,
    )
    .expect("host batch should prepare");
    let zero = prepared
        .at_condition(0.0, &device)
        .expect("zero condition should build");
    let one = prepared
        .at_condition(1.0, &device)
        .expect("unit condition should build");

    assert_eq!(
        prepared
            .rows()
            .iter()
            .map(|row| row.as_u32())
            .collect::<Vec<_>>(),
        vec![0, 1, 2]
    );
    assert_eq!(
        zero.input
            .type_context
            .expect("type context should be present")
            .into_data()
            .to_vec::<f32>()
            .expect("type context should download"),
        vec![0.0, 4.0, 0.0]
    );
    assert_eq!(
        one.input
            .type_context
            .expect("type context should be present")
            .into_data()
            .to_vec::<f32>()
            .expect("type context should download"),
        vec![0.0, 4.0, 0.0]
    );
    assert_eq!(
        zero.input
            .condition
            .into_data()
            .to_vec::<f32>()
            .expect("condition should download"),
        vec![0.0; 3]
    );
    assert_eq!(
        one.input
            .condition
            .into_data()
            .to_vec::<f32>()
            .expect("condition should download"),
        vec![1.0; 3]
    );
}

fn input(device: &CandleDevice, condition: [f32; 2]) -> ProjectorInput<TestBackend> {
    let representation = (0..2 * PROJECTOR_DIMENSIONS)
        .map(|index| {
            f32::from(u16::try_from(index % 31).expect("remainder should fit u16")) / 31.0 - 0.5
        })
        .collect::<Vec<_>>();
    ProjectorInput {
        representation: Tensor::from_data(
            TensorData::new(representation, [2, PROJECTOR_DIMENSIONS]),
            device,
        ),
        type_context: None,
        roles: Tensor::<TestBackend, 2, Int>::from_data(
            TensorData::new(
                vec![
                    i64::from(EntityRole::KnowledgeEntity.index()),
                    i64::from(EntityRole::OntologyType.index()),
                ],
                [2, 1],
            ),
            device,
        ),
        condition: Tensor::from_data(TensorData::new(condition.to_vec(), [2, 1]), device),
    }
}

fn training_input(device: &CandleDevice) -> ProjectorInput<TrainBackend> {
    let representation = training_representation();
    ProjectorInput {
        representation: Tensor::from_data(
            TensorData::new(representation, [3, PROJECTOR_DIMENSIONS]),
            device,
        ),
        type_context: None,
        roles: Tensor::<TrainBackend, 2, Int>::from_data(
            TensorData::new(
                vec![
                    i64::from(EntityRole::KnowledgeEntity.index()),
                    i64::from(EntityRole::OntologyType.index()),
                    i64::from(EntityRole::Other.index()),
                ],
                [3, 1],
            ),
            device,
        ),
        condition: Tensor::from_data(TensorData::new(vec![1.0_f32; 3], [3, 1]), device),
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "fixture rows intentionally narrow after normalization"
)]
fn training_representation() -> Vec<f32> {
    let mut values = (0..3 * PROJECTOR_DIMENSIONS)
        .map(|index| {
            f32::from(u16::try_from(index % 37).expect("remainder should fit u16")) / 37.0 - 0.5
        })
        .collect::<Vec<_>>();
    for row in values.chunks_exact_mut(PROJECTOR_DIMENSIONS) {
        let norm = row
            .iter()
            .map(|value| f64::from(*value).powi(2))
            .sum::<f64>()
            .sqrt();
        for value in row {
            *value = (f64::from(*value) / norm) as f32;
        }
    }
    values
}

fn validation_input(device: &CandleDevice) -> ProjectorInput<TestBackend> {
    let input = training_input(device);
    ProjectorInput {
        representation: input.representation.inner(),
        type_context: input.type_context.map(Tensor::inner),
        roles: input.roles.inner(),
        condition: input.condition.inner(),
    }
}
