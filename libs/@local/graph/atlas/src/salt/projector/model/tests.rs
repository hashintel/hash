//! Certificates for the projector model's initialization contracts.
//!
//! Identity assertions are bit-exact by design: the zero-initialized layers contribute exactly
//! zero, `1 + 0 = 1` exactly, and `h · 1 + 0` reproduces `h` bit for bit: any drift is a broken
//! contract, not rounding.

use std::sync::LazyLock;

use burn::{
    module::Param,
    tensor::{Int, Tensor, TensorData},
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{Architecture, Film, Initialization, NodeRole, Projector, ProjectorInput};
use crate::{
    device::{Device, Inference, PhysicalDevice},
    math::nz,
};

/// The CPU device every model fixture runs on, resolved once.
static DEVICE: LazyLock<PhysicalDevice> = LazyLock::new(|| Device::Cpu.pin(0).resolve());

/// A small architecture with `CONDITION_DIMENSIONS` condition inputs.
///
/// Width 8, two residual blocks, six representation and four role dimensions.
fn tiny<const CONDITION_DIMENSIONS: usize>() -> Architecture {
    Architecture {
        width: nz!(8),
        residual_blocks: nz!(2),
        representation_dimensions: nz!(6),
        role_dimensions: nz!(4),
        condition_dimensions: nz!(CONDITION_DIMENSIONS),
    }
}

/// A `rows × columns` inference tensor from row-major `values`.
fn matrix(rows: usize, columns: usize, values: Vec<f32>) -> Tensor<Inference, 2> {
    Tensor::from_data(TensorData::new(values, [rows, columns]), &*DEVICE)
}

/// A one-dimensional integer role tensor from `values`.
fn roles(values: Vec<i64>) -> Tensor<Inference, 1, Int> {
    let rows = values.len();
    Tensor::from_data(TensorData::new(values, [rows]), &*DEVICE)
}

/// A 2-D tensor's contents as row-major `f32` values.
fn to_values(tensor: Tensor<Inference, 2>) -> Vec<f32> {
    tensor
        .into_data()
        .to_vec()
        .expect("projector outputs should convert to f32 values")
}

/// A representation batch with varied, hand-picked values.
fn representation(rows: usize, columns: usize) -> Tensor<Inference, 2> {
    let values = (0..rows * columns)
        .map(|index| {
            #[expect(
                clippy::cast_precision_loss,
                reason = "test indexes are tiny and exactly representable"
            )]
            let index = index as f32;
            index.mul_add(0.375, -1.5)
        })
        .collect();
    matrix(rows, columns, values)
}

/// Returns the hidden input unchanged from a fresh `FiLM` layer at every condition.
///
/// A freshly initialized `FiLM` layer returns its hidden input unchanged for every condition value
/// and width.
#[test]
fn film_is_identity_at_initialization_for_every_condition() {
    for condition_dimensions in [1, 3] {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(7);
        let mut initialization = Initialization {
            rng: &mut rng,
            next_parameter_id: 1,
        };
        let film = Film::<Inference>::new(4, condition_dimensions, &mut initialization, &*DEVICE);

        let hidden = matrix(2, 4, vec![0.5, -1.25, 3.0, 0.0, -0.75, 2.5, -4.0, 1.0]);
        for condition_value in [0.0_f32, 1.0, -3.5] {
            let condition = matrix(
                2,
                condition_dimensions,
                vec![condition_value; 2 * condition_dimensions],
            );
            let output = film.forward(hidden.clone(), condition);
            assert_eq!(
                to_values(output),
                to_values(hidden.clone()),
                "FiLM should be the identity at initialization (condition width \
                 {condition_dimensions}, value {condition_value})"
            );
        }
    }
}

/// Pins the modulation arithmetic the identity certificates cannot see.
///
/// The `[dgamma; beta]` column order, the `+ 1` on gamma, and per-row conditions. Every value is
/// dyadic: equality is exact.
#[test]
fn film_modulates_by_hand_computed_values() {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(31);
    let mut initialization = Initialization {
        rng: &mut rng,
        next_parameter_id: 1,
    };
    let mut film = Film::<Inference>::new(2, 1, &mut initialization, &*DEVICE);
    film.linear.weight = Param::from_tensor(matrix(1, 4, vec![0.5, -0.25, 0.75, 1.5]));
    film.linear.bias = Some(Param::from_tensor(Tensor::from_data(
        TensorData::new(vec![0.125_f32, 0.25, -0.375, 0.5], [4]),
        &*DEVICE,
    )));

    // Row 1: c = 2, dgamma = [1.125, -0.25], beta = [1.125, 3.5]:
    //   [2 · 2.125 + 1.125, -1 · 0.75 + 3.5] = [5.375, 2.75].
    // Row 2: c = -2, dgamma = [-0.875, 0.75], beta = [-1.875, -2.5]:
    //   [0.5 · 0.125 - 1.875, 4 · 1.75 - 2.5] = [-1.8125, 4.5].
    let output = film.forward(
        matrix(2, 2, vec![2.0, -1.0, 0.5, 4.0]),
        matrix(2, 1, vec![2.0, -2.0]),
    );
    assert_eq!(
        to_values(output),
        vec![5.375, 2.75, -1.8125, 4.5],
        "modulation should be (1 + dgamma(c)) * v + beta(c)"
    );
}

/// A freshly initialized residual block returns its input unchanged for every condition width.
#[test]
fn residual_block_is_identity_at_initialization() {
    for condition_dimensions in [1, 3] {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(11);
        let mut initialization = Initialization {
            rng: &mut rng,
            next_parameter_id: 1,
        };
        let block = super::ResidualBlock::<Inference>::new(
            4,
            condition_dimensions,
            &mut initialization,
            &*DEVICE,
        );

        let hidden = matrix(2, 4, vec![1.5, -0.25, 2.0, -3.0, 0.125, 4.5, -1.0, 0.5]);
        let condition = matrix(
            2,
            condition_dimensions,
            vec![0.75; 2 * condition_dimensions],
        );
        let output = block.forward(hidden.clone(), condition);
        assert_eq!(
            to_values(output),
            to_values(hidden),
            "a residual block should be the identity at initialization (condition width \
             {condition_dimensions})"
        );
    }
}

/// Projects the same finite coordinates from a fresh projector whatever the condition.
///
/// A fresh projector projects the same finite 2-D coordinates whatever the condition value, for
/// one- and three-dimensional conditions.
#[test]
fn forward_is_condition_invariant_at_initialization() {
    for (condition_dimensions, architecture) in [(1, tiny::<1>()), (3, tiny::<3>())] {
        let projector = Projector::<Inference>::new(
            architecture,
            &*DEVICE,
            Xoshiro256PlusPlus::seed_from_u64(13),
        );

        let project = |condition_value: f32| {
            to_values(projector.forward(ProjectorInput {
                representation: representation(3, 6),
                roles: roles(vec![0, 1, 2]),
                condition: matrix(
                    3,
                    condition_dimensions,
                    vec![condition_value; 3 * condition_dimensions],
                ),
            }))
        };

        let at_zero = project(0.0);
        assert_eq!(
            at_zero,
            project(7.0),
            "conditions should share one function at initialization (condition width \
             {condition_dimensions})"
        );
        assert_eq!(at_zero.len(), 6, "three rows should project to 2D each");
        assert!(
            at_zero.iter().all(|value| value.is_finite()),
            "initial projections should be finite"
        );
    }
}

#[test]
fn initialization_is_deterministic_in_the_seed() {
    let input = || ProjectorInput {
        representation: representation(2, 6),
        roles: roles(vec![0, 1]),
        condition: matrix(2, 1, vec![0.5, 0.5]),
    };

    let project = |seed: u64| {
        let projector = Projector::<Inference>::new(
            tiny::<1>(),
            &*DEVICE,
            Xoshiro256PlusPlus::seed_from_u64(seed),
        );
        to_values(projector.forward(input()))
    };

    assert_eq!(
        project(17),
        project(17),
        "equal seeds should build identical models"
    );
    assert_ne!(
        project(17),
        project(18),
        "different seeds should build different models"
    );
}

#[test]
fn roles_reach_the_output() {
    let projector =
        Projector::<Inference>::new(tiny::<1>(), &*DEVICE, Xoshiro256PlusPlus::seed_from_u64(19));

    let project = |role: i64| {
        to_values(projector.forward(ProjectorInput {
            representation: representation(1, 6),
            roles: roles(vec![role]),
            condition: matrix(1, 1, vec![0.0]),
        }))
    };

    let knowledge = i64::from(NodeRole::KnowledgeEntity.index());
    let ontology = i64::from(NodeRole::OntologyType.index());
    assert_ne!(
        project(knowledge),
        project(ontology),
        "different roles should project one representation differently"
    );
}

/// Projecting two rows as a batch equals projecting each alone and concatenating.
#[test]
fn rows_project_independently() {
    let projector =
        Projector::<Inference>::new(tiny::<1>(), &*DEVICE, Xoshiro256PlusPlus::seed_from_u64(23));

    let full = representation(2, 6);
    let batch = to_values(projector.forward(ProjectorInput {
        representation: full.clone(),
        roles: roles(vec![0, 2]),
        condition: matrix(2, 1, vec![0.25, 0.25]),
    }));

    let first = to_values(projector.forward(ProjectorInput {
        representation: full.clone().narrow(0, 0, 1),
        roles: roles(vec![0]),
        condition: matrix(1, 1, vec![0.25]),
    }));
    let second = to_values(projector.forward(ProjectorInput {
        representation: full.narrow(0, 1, 1),
        roles: roles(vec![2]),
        condition: matrix(1, 1, vec![0.25]),
    }));

    assert_eq!(
        batch,
        [first, second].concat(),
        "each row should project independently of its batch"
    );
}

/// A condition tensor wider than the architecture panics with the documented message.
#[test]
#[should_panic(expected = "condition width should match the architecture")]
fn forward_rejects_a_mismatched_condition_width() {
    let projector =
        Projector::<Inference>::new(tiny::<1>(), &*DEVICE, Xoshiro256PlusPlus::seed_from_u64(29));
    drop(projector.forward(ProjectorInput {
        representation: representation(1, 6),
        roles: roles(vec![0]),
        condition: matrix(1, 2, vec![0.0, 0.0]),
    }));
}
