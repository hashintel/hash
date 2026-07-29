//! Certificates for the budget clip algebra and the gradient surrogate.
//!
//! The clip assertions are bit-exact where every intermediate is dyadic; the budget inequalities
//! hold as strict properties over random inputs. The surrogate certificates establish the seam the
//! training loop depends on: one backward pass through the surrogate deposits exactly the requested
//! coordinate gradient, both at a detached coordinate leaf and through the full model Jacobian.

#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions over dyadic values are the point: exact factors, exact \
              pass-through, and exact gradient deposition are contracts, not rounding accidents"
)]

use alloc::collections::BTreeMap;

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    module::{Module as _, ModuleMapper, ModuleVisitor, Param, ParamId},
    tensor::{Int, Tensor, TensorData, backend::AutodiffBackend},
};
use proptest::{prop_assert, property_test};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{Budget, BudgetOptions, BudgetSummary, surrogate};
use crate::{
    math::{Positive, Vec2},
    salt::projector::model::{Architecture, Projector, ProjectorInput},
};

type TestBackend = Autodiff<NdArray>;

fn device() -> NdArrayDevice {
    NdArrayDevice::default()
}

fn options(positive: f32, total: f32, floor: f32, epsilon: f32) -> BudgetOptions {
    BudgetOptions::new(positive, total, floor, epsilon)
        .expect("test coefficients should be valid budget options")
}

#[test]
fn options_reject_invalid_coefficients() {
    // The positive coefficient must not exceed the total one.
    assert_eq!(BudgetOptions::new(2.0, 1.0, 0.5, 0.25), None);
    // Zero, negative, and non-finite values are rejected everywhere.
    assert_eq!(BudgetOptions::new(0.0, 1.0, 0.5, 0.25), None);
    assert_eq!(BudgetOptions::new(1.0, 1.0, -0.5, 0.25), None);
    assert_eq!(BudgetOptions::new(1.0, 1.0, 0.5, 0.0), None);
    assert_eq!(BudgetOptions::new(f32::NAN, 1.0, 0.5, 0.25), None);
    assert_eq!(BudgetOptions::new(1.0, f32::INFINITY, 0.5, 0.25), None);
    // Equality of the coefficients is allowed.
    assert!(BudgetOptions::new(1.0, 1.0, 0.5, 0.25).is_some());
}

#[test]
fn clip_matches_hand_computed_dyadic_values() {
    // baseline = |(0, 4)| = 4; relation norm = 63.75;
    // positive factor = 1 · 4 / (63.75 + 0.25) = 0.0625 exactly;
    // clipped = (0, 63.75 · 0.0625) = (0, 3.984375);
    // total factor = min(1, 2 · 4 / (3.984375 + 0.25)) = 1 exactly.
    let outcome = options(1.0, 2.0, 0.5, 0.25).clip(Vec2::new(0.0, 4.0), Vec2::new(0.0, 63.75));

    assert_eq!(outcome.baseline, 4.0);
    assert_eq!(outcome.semantic_norm, 4.0);
    assert_eq!(outcome.relation_norm, 63.75);
    assert_eq!(outcome.positive_factor, 0.0625);
    assert_eq!(outcome.total_factor, 1.0);
    assert_eq!(outcome.gradient, Vec2::new(0.0, 3.984_375));
}

#[test]
fn clip_passes_small_relation_gradients_through_unchanged() {
    // positive factor = min(1, 4 / (0.5 + 0.25)) = 1; the gradient is
    // reproduced bit for bit.
    let relation = Vec2::new(0.5, 0.0);
    let outcome = options(1.0, 2.0, 0.5, 0.25).clip(Vec2::new(0.0, 4.0), relation);

    assert_eq!(outcome.positive_factor, 1.0);
    assert_eq!(outcome.total_factor, 1.0);
    assert_eq!(outcome.gradient, relation);
}

#[test]
fn clip_floors_a_vanished_semantic_gradient() {
    let outcome = options(1.0, 2.0, 0.5, 0.25).clip(Vec2::splat(0.0), Vec2::new(8.0, 0.0));

    assert_eq!(outcome.semantic_norm, 0.0);
    assert_eq!(outcome.baseline, 0.5);
    // positive factor = 1 · 0.5 / (8 + 0.25) is below one: the floor,
    // not the vanished semantic norm, sets the budget.
    assert!(outcome.positive_factor < 1.0);
    assert!(outcome.gradient.length() <= 0.5);
}

#[test]
fn clip_preserves_the_gradient_direction() {
    let relation = Vec2::new(3.0, -4.0);
    let outcome = options(0.5, 1.0, 0.25, 0.03125).clip(Vec2::new(0.0, 0.125), relation);

    // The clip scales; it never rotates. The cross product of the
    // applied gradient with the raw one is exactly zero because both
    // factors are scalars.
    assert_eq!(outcome.gradient.perp_dot(relation), 0.0);
    // Scaling factors are non-negative, so the direction is preserved,
    // not flipped.
    assert!(outcome.gradient.dot(relation) >= 0.0);
}

#[test]
fn summary_reports_hand_computed_fractions_and_ratios() {
    let options = options(1.0, 2.0, 0.5, 0.25);
    let mut summary = BudgetSummary::new();

    // Node 1: clipped (from the dyadic certificate above).
    summary.record(&options.clip(Vec2::new(0.0, 4.0), Vec2::new(0.0, 63.75)));
    // Node 2: passed through unchanged.
    summary.record(&options.clip(Vec2::new(0.0, 4.0), Vec2::new(0.5, 0.0)));

    assert_eq!(summary.nodes(), 2);
    assert_eq!(summary.clipped_fraction(), Some(0.5));
    assert_eq!(summary.capped_fraction(), Some(0.0));
    // Both total factors saturated at exactly one.
    assert_eq!(summary.mean_cap_factor(), Some(1.0));
    // Unclipped ratios: 63.75 / 4 and 0.5 / 4; mean = (15.9375 + 0.125) / 2.
    assert_eq!(summary.mean_unclipped_ratio(), Some(8.03125));
    // Applied ratios: 3.984375 / 4 and 0.5 / 4; mean = 0.560546875.
    assert_eq!(summary.mean_clipped_ratio(), Some(0.560_546_9));
}

#[test]
fn equal_coefficients_couple_the_cap_to_the_clip_by_an_epsilon() {
    // With positive == total, a positively clipped gradient lands
    // within one ε of the shared budget, so the trailing factor
    // dips just below one: activation is the ε signature, and
    // the mean cap factor is what separates it from real capping.
    let outcome = options(1.0, 1.0, 0.5, 0.25).clip(Vec2::new(0.0, 4.0), Vec2::new(0.0, 63.75));

    assert!(outcome.positive_factor < 1.0);
    assert!(outcome.total_factor < 1.0);
    // The shave is bounded by ε over the budget: factor ≥
    // budget / (budget + ε) = 4 / 4.25.
    assert!(outcome.total_factor >= 4.0 / 4.25);
}

#[test]
fn summary_is_empty_before_any_record() {
    let summary = BudgetSummary::new();

    assert_eq!(summary.nodes(), 0);
    assert_eq!(summary.clipped_fraction(), None);
    assert_eq!(summary.capped_fraction(), None);
    assert_eq!(summary.mean_cap_factor(), None);
    assert_eq!(summary.mean_unclipped_ratio(), None);
    assert_eq!(summary.mean_clipped_ratio(), None);
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

    // The surrogate's coordinate gradient IS the requested field, bit
    // for bit: each entry is produced by `1 · requested`, untouched by
    // any arithmetic that could round.
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

    // Both paths reach every trainable parameter: stem linear (2) and
    // norm (2), the role embedding (1), two blocks of norm + linear +
    // FiLM linear + output linear (8 each), and the head (2).
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

/// Both budget inequalities hold for every input.
///
/// The applied gradient's norm stays within `positive · baseline` and within `total ·
/// baseline`, and both factors lie in `(0, 1]`.
#[property_test]
fn clip_satisfies_the_budget_inequalities(
    #[strategy = -1e3_f32..1e3] semantic_x: f32,
    #[strategy = -1e3_f32..1e3] semantic_y: f32,
    #[strategy = -1e3_f32..1e3] relation_x: f32,
    #[strategy = -1e3_f32..1e3] relation_y: f32,
) {
    let options = options(0.5, 1.0, 0.125, 0.03125);
    let outcome = options.clip(
        Vec2::new(semantic_x, semantic_y),
        Vec2::new(relation_x, relation_y),
    );

    prop_assert!(outcome.positive_factor > 0.0 && outcome.positive_factor <= 1.0);
    prop_assert!(outcome.total_factor > 0.0 && outcome.total_factor <= 1.0);

    // A hair of tolerance covers the rounding of norm and product.
    let bound = 1.0 + 1e-5;
    let applied = outcome.gradient.length();
    prop_assert!(
        applied <= options.positive() * outcome.baseline * bound,
        "applied norm {} exceeds the positive budget {}",
        applied,
        options.positive() * outcome.baseline,
    );
    prop_assert!(
        applied <= options.total() * outcome.baseline * bound,
        "applied norm {} exceeds the total budget {}",
        applied,
        options.total() * outcome.baseline,
    );
    // Clipping never grows a gradient.
    prop_assert!(applied <= outcome.relation_norm * bound);
}

/// An observed budget applies the relation gradient unchanged, with both factors exactly one.
#[test]
fn observed_budget_passes_gradients_through() {
    let budget = Budget::Observed {
        floor: Positive::new(0.25).expect("the fixture floor is positive"),
    };
    let relation = Vec2::new(-12.0, 3.5);

    let outcome = budget.apply(Vec2::new(0.375, 0.0), relation);
    assert_eq!(outcome.gradient, relation);
    assert_eq!(outcome.positive_factor, 1.0);
    assert_eq!(outcome.total_factor, 1.0);
    assert_eq!(outcome.semantic_norm, 0.375);
    assert_eq!(outcome.relation_norm, 12.5);
    assert_eq!(outcome.baseline, 0.375);

    // The floor binds exactly as enforcement's baseline convention.
    let floored = budget.apply(Vec2::new(0.125, 0.0), relation);
    assert_eq!(floored.baseline, 0.25);
}

/// Observed and enforced outcomes share the baseline convention on identical inputs.
#[test]
fn observed_baseline_matches_enforcement() {
    let options = BudgetOptions::new(0.5, 0.5, 0.25, 1.0e-12).expect("the budget is valid");
    let observed = Budget::Observed {
        floor: Positive::new(0.25).expect("the fixture floor is positive"),
    };

    for semantic in [
        Vec2::new(0.0, 0.0),
        Vec2::new(0.125, 0.0),
        Vec2::new(0.0, 2.0),
    ] {
        let relation = Vec2::new(-1.5, 2.0);
        let enforced = options.clip(semantic, relation);
        let outcome = observed.apply(semantic, relation);
        assert_eq!(outcome.baseline, enforced.baseline);
        assert_eq!(outcome.semantic_norm, enforced.semantic_norm);
        assert_eq!(outcome.relation_norm, enforced.relation_norm);
    }
}
