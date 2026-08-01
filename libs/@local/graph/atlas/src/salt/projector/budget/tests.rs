//! Certificates for the budget diagnostics and the gradient surrogate.
//!
//! The measurement assertions are bit-exact where every intermediate is dyadic. The surrogate
//! certificates establish the seam the training loop depends on: one backward pass through the
//! surrogate deposits exactly the requested coordinate gradient, both at a detached coordinate leaf
//! and through the full model Jacobian.

#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions over dyadic values are the point: exact norms, exact \
              baselines, and exact gradient deposition are contracts, not rounding accidents"
)]

use alloc::collections::BTreeMap;

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    module::{Module as _, ModuleMapper, ModuleVisitor, Param, ParamId},
    tensor::{Int, Tensor, TensorData, backend::AutodiffBackend},
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{Budget, BudgetSummary, surrogate};
use crate::{
    math::{Positive, Vec2},
    salt::projector::model::{Architecture, Projector, ProjectorInput},
};

type TestBackend = Autodiff<NdArray>;

fn device() -> NdArrayDevice {
    NdArrayDevice::default()
}

#[test]
fn measure_records_the_baseline_convention() {
    let budget = Budget {
        floor: Positive::new(0.25).expect("the fixture floor is positive"),
    };
    let relation = Vec2::new(-12.0, 3.5);

    let outcome = budget.measure(Vec2::new(0.375, 0.0), relation);
    assert_eq!(outcome.semantic_norm, 0.375);
    assert_eq!(outcome.relation_norm, 12.5);
    assert_eq!(outcome.baseline, 0.375);

    // The floor binds exactly where the semantic norm falls under it.
    let floored = budget.measure(Vec2::new(0.125, 0.0), relation);
    assert_eq!(floored.semantic_norm, 0.125);
    assert_eq!(floored.baseline, 0.25);

    // A vanished semantic gradient measures against the floor alone.
    let vanished = budget.measure(Vec2::splat(0.0), relation);
    assert_eq!(vanished.semantic_norm, 0.0);
    assert_eq!(vanished.baseline, 0.25);
}

#[test]
fn summary_reports_hand_computed_ratios() {
    let budget = Budget {
        floor: Positive::new(0.5).expect("the fixture floor is positive"),
    };
    let mut summary = BudgetSummary::new();

    // Ratios over the shared baseline 4: 63.75 / 4 and 0.5 / 4;
    // mean = (15.9375 + 0.125) / 2 = 8.03125, dyadic at every step.
    summary.record(&budget.measure(Vec2::new(0.0, 4.0), Vec2::new(0.0, 63.75)));
    summary.record(&budget.measure(Vec2::new(0.0, 4.0), Vec2::new(0.5, 0.0)));

    assert_eq!(summary.nodes(), 2);
    assert_eq!(summary.mean_ratio(), Some(8.03125));
}

#[test]
fn summary_is_empty_before_any_record() {
    let summary = BudgetSummary::new();

    assert_eq!(summary.nodes(), 0);
    assert_eq!(summary.mean_ratio(), None);
}

#[test]
fn surrogate_deposits_exactly_the_requested_gradient_at_a_leaf() {
    let device = device();
    let coordinates: Tensor<TestBackend, 2> = Tensor::from_data(
        TensorData::new(vec![0.5_f32, -1.25, 2.0, 0.0, -0.75, 4.0], [3, 2]),
        &device,
    )
    .require_grad();
    let requested = vec![1.5_f32, -0.5, 0.25, 8.0, 0.0, -2.0];
    let gradient = Tensor::from_data(TensorData::new(requested.clone(), [3, 2]), &device);

    let gradients = surrogate(coordinates.clone(), gradient).backward();
    let deposited = coordinates
        .grad(&gradients)
        .expect("the surrogate should reach the coordinate leaf")
        .into_data()
        .to_vec::<f32>()
        .expect("gradients should convert to f32 values");

    // The surrogate's coordinate gradient is the requested field bit for bit: `1 · requested`
    // produces each entry, untouched by any arithmetic that could round.
    assert_eq!(deposited, requested);
}

/// Nudges every parameter off its initialization.
///
/// The identity-contract layers initialize to zero and would block gradient flow into the deep
/// block parameters, leaving the surrogate certificate comparing zeros with zeros; a deterministic
/// ramp makes every parameter's gradient generically nonzero.
struct Perturb;

impl ModuleMapper<TestBackend> for Perturb {
    fn map_float<const D: usize>(
        &mut self,
        param: Param<Tensor<TestBackend, D>>,
    ) -> Param<Tensor<TestBackend, D>> {
        let (id, tensor, mapper) = param.consume();
        let elements = tensor.shape().num_elements();
        let ramp = (0..elements)
            .map(|index| {
                #[expect(
                    clippy::cast_precision_loss,
                    reason = "test parameter counts are tiny and exactly representable"
                )]
                let index = index as f32;
                index.mul_add(0.03125, 0.0625)
            })
            .collect::<Vec<_>>();
        let shape = tensor.shape();
        let device = tensor.device();
        let ramp = Tensor::from_data(TensorData::new(ramp, shape), &device);
        // The sum is an interior autodiff node; re-rooting it as a
        // required-gradient leaf is what lets gradients accumulate at
        // the perturbed parameter.
        Param::from_mapped_value(id, (tensor + ramp).detach().require_grad(), mapper)
    }
}

/// Collects every parameter gradient a backward pass produced.
struct GradientCollector<'graph> {
    gradients: &'graph <TestBackend as AutodiffBackend>::Gradients,
    collected: BTreeMap<ParamId, Vec<f32>>,
}

impl ModuleVisitor<TestBackend> for GradientCollector<'_> {
    fn visit_float<const D: usize>(&mut self, param: &Param<Tensor<TestBackend, D>>) {
        if let Some(gradient) = param.val().grad(self.gradients) {
            self.collected.insert(
                param.id,
                gradient
                    .into_data()
                    .to_vec()
                    .expect("gradients should convert to f32 values"),
            );
        }
    }
}

fn parameter_gradients(
    model: &Projector<TestBackend>,
    gradients: &<TestBackend as AutodiffBackend>::Gradients,
) -> BTreeMap<ParamId, Vec<f32>> {
    let mut collector = GradientCollector {
        gradients,
        collected: BTreeMap::new(),
    };
    model.visit(&mut collector);
    collector.collected
}

#[test]
fn surrogate_matches_ordinary_autodiff_through_the_model() {
    // Reference: L(y) = sum(y · y) has coordinate gradient 2 · y. Path
    // A backpropagates L through the model directly; path B evaluates
    // the same coordinate gradient detached and hands it to the
    // surrogate. Equal parameter gradients certify that one surrogate
    // backward deposits J^T g for the full FiLM-residual Jacobian.
    let device = device();
    let architecture = Architecture {
        width: 8.try_into().expect("8 is nonzero"),
        residual_blocks: 2.try_into().expect("2 is nonzero"),
        representation_dimensions: 6.try_into().expect("6 is nonzero"),
        role_dimensions: 4.try_into().expect("4 is nonzero"),
        condition_dimensions: 1.try_into().expect("1 is nonzero"),
    };
    let model =
        Projector::<TestBackend>::new(architecture, &device, Xoshiro256PlusPlus::seed_from_u64(11))
            .map(&mut Perturb);

    let representation = || {
        let values = (0..3 * 6)
            .map(|index| {
                #[expect(
                    clippy::cast_precision_loss,
                    reason = "test indexes are tiny and exactly representable"
                )]
                let index = index as f32;
                index.mul_add(0.375, -1.5)
            })
            .collect::<Vec<_>>();
        Tensor::<TestBackend, 2>::from_data(TensorData::new(values, [3, 6]), &device)
    };
    let roles = || {
        Tensor::<TestBackend, 1, Int>::from_data(TensorData::new(vec![0_i64, 1, 2], [3]), &device)
    };
    let condition =
        || Tensor::<TestBackend, 2>::from_data(TensorData::new(vec![0.5_f32; 3], [3, 1]), &device);
    let input = || ProjectorInput {
        representation: representation(),
        roles: roles(),
        condition: condition(),
    };

    // Path A: ordinary autodiff through the model.
    let coordinates = model.forward(input());
    let direct = parameter_gradients(
        &model,
        &(coordinates.clone() * coordinates).sum().backward(),
    );

    // Path B: the same coordinate gradient, detached, via the surrogate.
    let coordinates = model.forward(input());
    let field = (coordinates.clone() * 2.0).inner();
    let surrogated = parameter_gradients(&model, &surrogate(coordinates, field).backward());

    // Both paths reach every trainable parameter. The 23 entries are stem linear (2) and norm (2),
    // the role embedding (1), two blocks of norm + linear + FiLM linear + output linear (8 each),
    // and the head (2).
    assert_eq!(direct.len(), 23);
    assert_eq!(
        direct.keys().collect::<Vec<_>>(),
        surrogated.keys().collect::<Vec<_>>()
    );

    for (id, direct_values) in &direct {
        let surrogate_values = &surrogated[id];
        assert_eq!(direct_values.len(), surrogate_values.len());
        for (index, (direct, surrogated)) in direct_values.iter().zip(surrogate_values).enumerate()
        {
            assert!(
                (direct - surrogated).abs() <= 1e-6 * direct.abs().max(1.0),
                "parameter {id:?} gradient {index}: direct {direct} against surrogate {surrogated}"
            );
        }
    }
}
