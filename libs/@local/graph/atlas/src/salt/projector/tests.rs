use burn::{
    backend::{Candle, candle::CandleDevice},
    tensor::{Int, Tensor, TensorData, backend::Backend as _},
};
use type_system::{
    knowledge::entity::id::{EntityId, EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::*;
use crate::salt::{
    graph::KnnTable,
    identity::{ArtifactOrdinal, GenerationRowId},
    policy::Probability,
    relation::{AttractionEdge, RelationConfidence},
    representation::PROJECTOR_DIMENSIONS,
    strength::RelationStrength,
};

type TestBackend = Candle;

#[test]
fn film_is_identity_for_every_condition_at_initialization() {
    let device = CandleDevice::Cpu;
    TestBackend::seed(&device, 42);
    let projector = ConditionedProjector::<TestBackend>::new(
        ProjectorConfig {
            width: 16,
            residual_blocks: 2,
            role_dimensions: 4,
            ..ProjectorConfig::default()
        },
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

    assert_eq!(scales, vec![5.0, 4.0, 7.0]);
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
