//! Certificates for the loss terms.
//!
//! These tests cross-check every hand-derived derivative against a finite difference of its own
//! value function and assert hand-computed dyadic points bit-exactly. They also compare the
//! autodiff support term against an independent analytic gradient formula.

#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions over dyadic values are contracts: the chosen points make every \
              intermediate exactly representable"
)]

use std::sync::LazyLock;

use burn::tensor::{Tensor, TensorData};
use hashql_core::id::{Id as _, IdSlice};

use super::{
    AffinityEnergy, BatchAnchor, BatchRowId, GradientField, RelationEdge, RelationEdges,
    RelationEnergy, SupportOptions, SupportTargets, attraction_term,
    energy::{CoincidentEnergy, ProximalEnergy},
    relation_term, repulsion_term, support_term,
};
use crate::{
    device::{Device, PhysicalDevice, Training},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{
        AffinityCurve, DVec2, FinitePointField, NonNegative, Positive, Vec2, non_negative,
        positive, unit_fraction,
    },
    salt::{
        policy::ClassProbabilities,
        projector::scale::{LocalScales, ScaledFrame},
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::{AttractionIndex, AttractionOptions},
            protection::NodePair,
        },
    },
};

/// Wraps fixture points every test states as finite literals.
fn proven(points: &[Vec2]) -> &FinitePointField<BatchRowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

/// The CPU device the support-term tensors live on, resolved once.
static DEVICE: LazyLock<PhysicalDevice> = LazyLock::new(|| Device::Cpu.pin(0).resolve());

/// Builds an affinity curve from literature parameters `a` and `b`.
///
/// The tests keep both positive and finite.
#[expect(
    clippy::min_ident_chars,
    reason = "`a` and `b` are the affinity curve's literature parameter names"
)]
fn curve(a: f32, b: f32) -> AffinityCurve {
    AffinityCurve::new(
        Positive::new(a).expect("test curve parameters are positive and finite"),
        Positive::new(b).expect("test curve parameters are positive and finite"),
    )
}

/// Builds an affinity energy over `curve(a, b)` with the log guard `epsilon`.
///
/// The tests keep `b` within the objective's exponent bound.
#[expect(
    clippy::min_ident_chars,
    reason = "`a` and `b` are the affinity curve's literature parameter names"
)]
fn affinity_energy(a: f32, b: f32, epsilon: f32) -> AffinityEnergy {
    AffinityEnergy::new(
        curve(a, b),
        Positive::new(epsilon).expect("the test epsilon is positive"),
    )
    .expect("the test exponent satisfies the objective bound")
}

/// A proximal energy with the given radius and temperature.
fn proximal(radius: f32, temperature: f32) -> ProximalEnergy {
    ProximalEnergy::new(
        NonNegative::new(radius).expect("the test radius is non-negative"),
        Positive::new(temperature).expect("the test temperature is positive"),
    )
}

/// A coincident energy with the given radius and Huber threshold.
fn coincident(radius: f32, threshold: f32) -> CoincidentEnergy {
    CoincidentEnergy::new(
        NonNegative::new(radius).expect("the test radius is non-negative"),
        Positive::new(threshold).expect("the test threshold is positive"),
    )
}

/// Builds the relation mixture with scale guard `epsilon`.
///
/// The classes are `coincident(0.25, 1.0)` and `proximal(1.0, 0.5)`.
fn relation_energy(epsilon: f32) -> RelationEnergy {
    RelationEnergy::new(
        coincident(0.25, 1.0),
        proximal(1.0, 0.5),
        Positive::new(epsilon).expect("the test scale guard is positive"),
    )
    .expect("test relation parameters are valid")
}

/// A batch-row pair from two literal row numbers.
fn pair(one: u32, other: u32) -> NodePair<BatchRowId> {
    NodePair::new(BatchRowId::new(one), BatchRowId::new(other))
}

/// Reads one accumulated gradient by batch position.
fn gradient(field: &GradientField<BatchRowId>, row: usize) -> DVec2 {
    field.as_slice()[BatchRowId::from_usize(row)]
}

/// Builds local scales over batch rows from plain `f32` values.
///
/// The tests keep the values finite and non-negative.
fn scales(values: &[f32]) -> LocalScales<BatchRowId> {
    let values: Box<[NonNegative]> = values
        .iter()
        .map(|&value| NonNegative::new(value).expect("test scales are finite and non-negative"))
        .collect();

    LocalScales::new(IdSlice::from_boxed_slice(values))
}

/// Central finite difference of `value` in one scalar argument.
fn scalar_difference(value: impl Fn(f32) -> f32, at: f32, step: f32) -> f32 {
    (value(at + step) - value(at - step)) / (2.0 * step)
}

/// Central finite difference of a term value in one coordinate axis.
fn coordinate_difference(
    value: impl Fn(&[Vec2]) -> f32,
    coordinates: &[Vec2],
    row: usize,
    axis: usize,
    step: f32,
) -> f32 {
    let mut perturbed = coordinates.to_vec();
    let offset = if axis == 0 {
        Vec2::new(step, 0.0)
    } else {
        Vec2::new(0.0, step)
    };
    perturbed[row] = coordinates[row] + offset;
    let above = value(&perturbed);
    perturbed[row] = coordinates[row] - offset;
    let below = value(&perturbed);
    (above - below) / (2.0 * step)
}

#[track_caller]
/// Narrows one accumulated field component for a finite-difference comparison.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the finite-difference tolerance operates at working precision"
)]
fn component(gradient: DVec2, axis: usize) -> f32 {
    [gradient.x(), gradient.y()][axis] as f32
}

/// Asserts an analytic derivative agrees with its central finite difference.
///
/// The tolerance is two percent relative plus `1e-3` absolute, and `context` names the failure.
#[track_caller]
fn assert_derivative_close(derivative: f32, difference: f32, context: &str) {
    assert!(
        (derivative - difference).abs() <= 2e-2_f32.mul_add(difference.abs(), 1e-3),
        "{context}: derivative {derivative} against finite difference {difference}"
    );
}

/// Refuses `b = 0.25` in `AffinityEnergy::new` and admits the bound `b = 0.5`.
///
/// `AffinityEnergy::new` returns `None` for `b = 0.25`, where the coordinate gradient diverges at
/// coincidence, and `Some` at the bound `b = 0.5`.
#[test]
fn affinity_energy_rejects_a_shallow_exponent() {
    // Below `b = 0.5` the coordinate gradient diverges at coincidence.
    assert_eq!(
        AffinityEnergy::new(curve(1.0, 0.25), positive!(0.125)),
        None
    );
    assert!(AffinityEnergy::new(curve(1.0, 0.5), positive!(0.125)).is_some());
}

/// Reads exactly zero values and `±0.25` derivative masses at `a = b = u = 1`, `ε = 0.5`.
///
/// With `a = b = 1`, `u = 1` and `ε = 0.5`, both attraction and repulsion values are exactly zero
/// and their derivative masses are exactly `±0.25`.
#[test]
fn affinity_energies_match_hand_computed_dyadic_values() {
    // a = 1, b = 1, u = 1: q = 0.5 exactly. With ε = 0.5 both logarithm arguments are exactly
    // 1: both values are exactly zero, and the derivative mass a·b·q² is exactly 0.25.
    let energy = affinity_energy(1.0, 1.0, 0.5);

    let (value, derivative) = energy.attraction(non_negative!(1.0));
    assert_eq!(value, 0.0);
    assert_eq!(derivative, 0.25);

    let (value, derivative) = energy.repulsion(non_negative!(1.0));
    assert_eq!(value, 0.0);
    assert_eq!(derivative, -0.25);
}

/// At `u = 0` both attraction and repulsion have finite values and exactly zero derivative.
#[test]
fn affinity_energies_have_zero_derivative_at_coincidence() {
    let energy = affinity_energy(1.577, 0.895, 0.125);

    let (value, derivative) = energy.attraction(non_negative!(0.0));
    assert!(value.is_finite());
    assert_eq!(derivative, 0.0);

    let (value, derivative) = energy.repulsion(non_negative!(0.0));
    assert!(value.is_finite());
    assert_eq!(derivative, 0.0);
}

/// Matches both affinity derivatives to finite differences for two exponents.
///
/// For an integer and a fractional exponent, the attraction and repulsion derivatives agree with
/// central finite differences at five probe distances.
#[test]
fn affinity_derivatives_match_finite_differences() {
    // Both an integer and a fractional exponent: b = 1 makes the derivative's u^(b - 1) factor
    // exactly one, and a fractional b exercises the general power.
    #[expect(
        clippy::min_ident_chars,
        reason = "`a` and `b` are the affinity curve's literature parameter names"
    )]
    for (a, b) in [(1.0, 1.0), (1.577, 0.895)] {
        let energy = affinity_energy(a, b, 0.125);
        for at in [0.25_f32, 0.5, 1.0, 2.0, 5.0] {
            let step = at * 1e-3;
            let at_domain = NonNegative::new(at).expect("the probe points are non-negative");
            let probe = |distance_squared: f32| {
                NonNegative::new(distance_squared).expect("the probes stay inside the domain")
            };
            let difference = scalar_difference(
                |distance_squared| energy.attraction(probe(distance_squared)).0,
                at,
                step,
            );
            assert_derivative_close(
                energy.attraction(at_domain).1,
                difference,
                &format!("attraction a {a} b {b} at {at}"),
            );

            let difference = scalar_difference(
                |distance_squared| energy.repulsion(probe(distance_squared)).0,
                at,
                step,
            );
            assert_derivative_close(
                energy.repulsion(at_domain).1,
                difference,
                &format!("repulsion a {a} b {b} at {at}"),
            );
        }
    }
}

/// At the radius the proximal value is `temperature · ln 2` and the derivative exactly `0.5`.
///
/// Far outside the derivative saturates at one, and far inside it vanishes.
#[test]
fn proximal_energy_matches_hand_computed_values() {
    // At the radius the argument is exactly zero: the value is
    // temperature · softplus(0) = 0.5 · ln 2 and the derivative is
    // sigmoid(0) = 0.5 exactly.
    let energy = proximal(1.0, 0.5);

    let (value, derivative) = energy.evaluate(non_negative!(1.0));
    assert!(0.5_f32.mul_add(-core::f32::consts::LN_2, value.get()).abs() < 1e-7);
    assert_eq!(derivative, non_negative!(0.5));

    // Far outside, the pull saturates at unit slope.
    assert!((energy.evaluate(non_negative!(9.0)).1.get() - 1.0).abs() < 1e-6);
    // Far inside it vanishes: sixteen temperatures below a wide radius at coincidence.
    assert!(proximal(8.0, 0.5).evaluate(NonNegative::ZERO).1.get() < 1e-6);
}

/// Matches the proximal derivative to finite differences a step above zero.
///
/// The proximal derivative agrees with central finite differences on a grid that stays a step above
/// zero.
#[test]
fn proximal_derivative_matches_finite_differences() {
    let energy = proximal(1.0, 0.5);
    // The grid stays a step above zero, where a central difference would leave the domain.
    for at in [0.125_f32, 0.5, 0.875, 1.0, 1.5, 3.0] {
        let difference = scalar_difference(
            |z| {
                energy
                    .evaluate(NonNegative::new(z).expect("the grid stays inside the domain"))
                    .0
                    .get()
            },
            at,
            1e-3,
        );
        assert_derivative_close(
            energy
                .evaluate(NonNegative::new(at).expect("the grid stays inside the domain"))
                .1
                .get(),
            difference,
            &format!("proximal at {at}"),
        );
    }
}

#[test]
fn coincident_energy_matches_hand_computed_regimes() {
    let energy = coincident(1.0, 1.0);

    // Inside the radius: exactly zero value and derivative.
    assert_eq!(
        energy.evaluate(non_negative!(0.5)),
        (NonNegative::ZERO, NonNegative::ZERO)
    );
    // In the quadratic regime an excess of 0.5 gives huber 0.125 and a derivative equal to the
    // excess.
    assert_eq!(
        energy.evaluate(non_negative!(1.5)),
        (non_negative!(0.125), non_negative!(0.5))
    );
    // In the linear regime an excess of 2 gives value 1 · (2 - 0.5) and a capped derivative.
    assert_eq!(
        energy.evaluate(non_negative!(3.0)),
        (non_negative!(1.5), non_negative!(1.0))
    );
}

/// Matches the coincident derivative to finite differences away from the regime kinks.
///
/// The coincident derivative agrees with central finite differences on a grid that avoids the
/// regime kinks.
#[test]
fn coincident_derivative_matches_finite_differences() {
    let energy = coincident(1.0, 1.0);
    // The grid avoids the exact kink points, where a central
    // difference straddles two regimes.
    for at in [0.25_f32, 0.875, 1.25, 1.75, 2.5, 4.0] {
        let difference = scalar_difference(
            |z| {
                energy
                    .evaluate(NonNegative::new(z).expect("the grid stays inside the domain"))
                    .0
                    .get()
            },
            at,
            1e-3,
        );
        assert_derivative_close(
            energy
                .evaluate(NonNegative::new(at).expect("the grid stays inside the domain"))
                .1
                .get(),
            difference,
            &format!("coincident at {at}"),
        );
    }
}

#[test]
fn relation_energy_requires_ordered_radii() {
    // The Coincident radius must lie strictly below the Proximal one.
    assert!(
        RelationEnergy::new(coincident(1.0, 1.0), proximal(1.0, 0.5), positive!(0.25)).is_none()
    );
    assert!(
        RelationEnergy::new(coincident(2.0, 1.0), proximal(1.0, 0.5), positive!(0.25)).is_none()
    );
    assert!(
        RelationEnergy::new(coincident(0.5, 1.0), proximal(1.0, 0.5), positive!(0.25)).is_some()
    );
}

/// Reads `mixture` as the exact class-weighted sum accumulated in `f64`.
///
/// `mixture` returns exactly the class-weighted sum of the coincident and proximal values and
/// derivatives, accumulated in `f64`.
#[test]
fn relation_mixture_is_the_weighted_class_sum() {
    let energy = relation_energy(0.25);
    let z = non_negative!(1.75);

    let (coincident_value, coincident_derivative) = coincident(0.25, 1.0).evaluate(z);
    let (proximal_value, proximal_derivative) = proximal(1.0, 0.5).evaluate(z);
    let (value, derivative) = energy.mixture(z, non_negative!(0.5), non_negative!(0.25));

    assert_eq!(
        value.into_raw(),
        0.5_f64.mul_add(
            f64::from(coincident_value.get()),
            0.25 * f64::from(proximal_value.get())
        )
    );
    assert_eq!(
        derivative.into_raw(),
        0.5_f64.mul_add(
            f64::from(coincident_derivative.get()),
            0.25 * f64::from(proximal_derivative.get())
        )
    );
}

#[test]
fn gradient_field_accumulates_and_resets() {
    let mut field = GradientField::new(3);
    field.accumulate(BatchRowId::new(0), Vec2::new(1.0, -2.0));
    field.accumulate(BatchRowId::new(0), Vec2::new(0.5, 0.5));
    field.accumulate(BatchRowId::new(2), Vec2::new(-1.0, 4.0));

    assert_eq!(field.0.len(), 3);
    assert_eq!(gradient(&field, 0), DVec2::from(Vec2::new(1.5, -1.5)));
    assert_eq!(gradient(&field, 1), DVec2::from(Vec2::splat(0.0)));
    assert_eq!(gradient(&field, 2), DVec2::from(Vec2::new(-1.0, 4.0)));

    field.0.fill(DVec2::ZERO);
    assert!(field.as_slice().iter().all(|&entry| entry == DVec2::ZERO));
}

/// Reads exactly zero value and `(∓0.5, 0)` endpoint gradients for one unit-distance pair.
///
/// One unit-distance pair under the dyadic energy yields exactly zero value and per-endpoint
/// gradients `(-0.5, 0)` and `(0.5, 0)`.
#[test]
fn attraction_term_matches_hand_computed_gradient() {
    // One unit-distance pair under the dyadic energy: value exactly
    // zero, per-endpoint gradient 2 · derivative · difference =
    // (-0.5, 0) at the first node and its negation at the second.
    let energy = affinity_energy(1.0, 1.0, 0.5);
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let mut field = GradientField::new(2);

    let value = attraction_term(
        proven(&coordinates),
        [(pair(0, 1), 1.0)],
        energy,
        1.0,
        &mut field,
    );

    assert_eq!(value, 0.0);
    assert_eq!(gradient(&field, 0), DVec2::from(Vec2::new(-0.5, 0.0)));
    assert_eq!(gradient(&field, 1), DVec2::from(Vec2::new(0.5, 0.0)));
}

/// Points the attraction gradient along the separation and the repulsion gradient against it.
///
/// The attraction gradient at the first endpoint points along the separation (descent pulls the
/// pair together) and the repulsion gradient points against it.
#[test]
fn attraction_pulls_and_repulsion_pushes() {
    let energy = affinity_energy(1.577, 0.895, 0.125);
    let coordinates = [Vec2::new(0.25, -0.5), Vec2::new(1.5, 0.75)];
    let toward = coordinates[0] - coordinates[1];

    let mut field = GradientField::new(2);
    attraction_term(
        proven(&coordinates),
        [(pair(0, 1), 1.0)],
        energy,
        1.0,
        &mut field,
    );
    // The loss gradient ascends distance; the descent step moves the
    // endpoints together.
    assert!(gradient(&field, 0).dot(DVec2::from(toward)).into_raw() > 0.0);

    let mut field = GradientField::new(2);
    repulsion_term(
        proven(&coordinates),
        [(pair(0, 1), 1.0)],
        energy,
        1.0,
        &mut field,
    );
    assert!(gradient(&field, 0).dot(DVec2::from(toward)).into_raw() < 0.0);
}

/// Deposits exactly zero gradient for a coincident repulsion pair with positive value.
///
/// A coincident repulsion pair has a positive value but deposits exactly zero gradient, having no
/// direction to push along.
#[test]
fn coincident_pair_contributes_value_but_no_gradient() {
    let energy = affinity_energy(1.0, 1.0, 0.125);
    let coordinates = [Vec2::new(0.5, 0.5), Vec2::new(0.5, 0.5)];
    let mut field = GradientField::new(2);

    let value = repulsion_term(
        proven(&coordinates),
        [(pair(0, 1), 1.0)],
        energy,
        1.0,
        &mut field,
    );

    // A coincident negative pair is the least probable placement: its value is large, and it
    // has no direction to push along.
    assert!(value > 0.0);
    assert_eq!(gradient(&field, 0), DVec2::from(Vec2::splat(0.0)));
    assert_eq!(gradient(&field, 1), DVec2::from(Vec2::splat(0.0)));
}

/// A varied four-node frame with no coincident or symmetric pairs.
fn frame() -> [Vec2; 4] {
    [
        Vec2::new(0.0, 0.125),
        Vec2::new(1.0, -0.25),
        Vec2::new(-0.75, 0.875),
        Vec2::new(0.375, 1.5),
    ]
}

/// Matches the accumulated attraction gradient over four weighted pairs to finite differences.
///
/// The accumulated attraction gradient over four weighted pairs, one duplicated, agrees with
/// central finite differences on every row and axis.
#[test]
fn attraction_term_gradient_matches_finite_differences() {
    let energy = affinity_energy(1.577, 0.895, 0.125);
    // The duplicate pair certifies accumulation, because proportional sampling can draw one edge
    // twice.
    let pairs = [
        (pair(0, 1), 1.0),
        (pair(1, 2), 0.5),
        (pair(0, 3), 0.75),
        (pair(0, 1), 1.0),
    ];
    let scale = 1.25;

    let coordinates = frame();
    let mut field = GradientField::new(4);
    attraction_term(proven(&coordinates), pairs, energy, scale, &mut field);

    for row in 0..4 {
        for axis in 0..2 {
            let difference = coordinate_difference(
                |perturbed| {
                    let mut scratch = GradientField::new(4);
                    attraction_term(proven(perturbed), pairs, energy, scale, &mut scratch)
                },
                &coordinates,
                row,
                axis,
                1e-3,
            );
            assert_derivative_close(
                component(gradient(&field, row), axis),
                difference,
                &format!("attraction node {row} axis {axis}"),
            );
        }
    }
}

/// Matches the accumulated repulsion gradient over three weighted pairs to finite differences.
///
/// The accumulated repulsion gradient over three weighted pairs agrees with central finite
/// differences on every row and axis.
#[test]
fn repulsion_term_gradient_matches_finite_differences() {
    let energy = affinity_energy(1.577, 0.895, 0.125);
    let pairs = [(pair(0, 2), 1.0), (pair(1, 3), 0.25), (pair(2, 3), 0.5)];
    let scale = 0.75;

    let coordinates = frame();
    let mut field = GradientField::new(4);
    repulsion_term(proven(&coordinates), pairs, energy, scale, &mut field);

    for row in 0..4 {
        for axis in 0..2 {
            let difference = coordinate_difference(
                |perturbed| {
                    let mut scratch = GradientField::new(4);
                    repulsion_term(proven(perturbed), pairs, energy, scale, &mut scratch)
                },
                &coordinates,
                row,
                axis,
                1e-3,
            );
            assert_derivative_close(
                component(gradient(&field, row), axis),
                difference,
                &format!("repulsion node {row} axis {axis}"),
            );
        }
    }
}

/// Builds an attraction index over four nodes and two relations.
///
/// One mixed-class relation (Coincident coefficient 1) and one pure Proximal relation.
fn attraction_fixture() -> AttractionIndex<NodeRowId, EdgeRowId> {
    let policies = [
        RelationPolicy {
            relation: OntologyRowId::new(3),
            attraction: ClassProbabilities {
                coincident: unit_fraction!(0.5),
                proximal: unit_fraction!(0.5),
            },
            selected: ClassProbabilities {
                coincident: unit_fraction!(0.5),
                proximal: unit_fraction!(0.5),
            },
            applicability: unit_fraction!(1.0),
            strength: NonNegative::ONE,
            _pad: [0; 4],
        },
        RelationPolicy {
            relation: OntologyRowId::new(9),
            attraction: ClassProbabilities {
                coincident: unit_fraction!(0.0),
                proximal: unit_fraction!(1.0),
            },
            selected: ClassProbabilities {
                coincident: unit_fraction!(0.0),
                proximal: unit_fraction!(1.0),
            },
            applicability: unit_fraction!(1.0),
            strength: NonNegative::ONE,
            _pad: [0; 4],
        },
    ];
    let mut instances = vec![
        RelationInstance {
            edge: EdgeRowId::new(0),
            relation: OntologyRowId::new(3),
            source: NodeRowId::new(0),
            target: NodeRowId::new(1),
            confidence: RelationConfidence::default(),
            multiplicity: 1,
        },
        RelationInstance {
            edge: EdgeRowId::new(1),
            relation: OntologyRowId::new(3),
            source: NodeRowId::new(2),
            target: NodeRowId::new(3),
            confidence: RelationConfidence::default(),
            multiplicity: 1,
        },
        RelationInstance {
            edge: EdgeRowId::new(2),
            relation: OntologyRowId::new(9),
            source: NodeRowId::new(0),
            target: NodeRowId::new(2),
            confidence: RelationConfidence::default(),
            multiplicity: 1,
        },
    ];
    RelationIndexes::build(
        4,
        Policies::new(&policies).expect("the fixture policies are certified"),
        &mut instances,
        AttractionOptions::new(non_negative!(1.0), non_negative!(0.0)),
    )
    .expect("the fixture instances satisfy the input contract")
    .attraction
}

/// Wraps every group of an index with all its edges, as a sampler emitting everything would.
///
/// Converts every group into the batch-local shape under the identity row map: the fixture
/// coordinates are corpus-length, and corpus rows and batch positions therefore coincide.
fn full_batch(index: &AttractionIndex<NodeRowId, EdgeRowId>) -> Vec<RelationEdges<BatchRowId>> {
    let position = |row: NodeRowId| {
        BatchRowId::new(u32::try_from(row.as_u64()).expect("fixture rows fit the batch encoding"))
    };
    index
        .groups()
        .iter()
        .map(|group| RelationEdges {
            relation: group.relation(),
            weights: group.weights(),
            edges: group
                .edges()
                .iter()
                .map(|edge| RelationEdge {
                    source: position(edge.source),
                    target: position(edge.target),
                    confidence: edge.confidence.value(),
                    normalization: edge.normalization,
                })
                .collect(),
        })
        .collect()
}

/// Reads `0.25 ln 2` and `(∓0.25, 0)` endpoint gradients for one proximal instance on its radius.
///
/// One pure-proximal instance at unit distance on the proximal radius yields the value `0.25 ln 2`
/// within `1e-6` and gradients `(∓0.25, 0)` on its endpoints and zero elsewhere.
#[test]
fn relation_term_matches_hand_computed_values() {
    // One pure-Proximal instance between rows 0 and 2 at distance 1. Scales 0.75 with guard
    // 0.25 normalize by exactly 1: z = 1 lies exactly on the Proximal radius, where the
    // derivative is sigmoid(0) = 0.5. Degree normalization ν for two degree-one endpoints is
    // 1/√(2·2) = 0.5 and the unscored confidence is the neutral 1: the instance factor is 0.5.
    // The gradient on the source is direction · (factor 0.5 · derivative 0.5) with direction
    // (-1, 0).
    let index = attraction_fixture();
    let batch = full_batch(&index);
    let proximal_only = &batch[1..];
    assert_eq!(proximal_only.len(), 1);
    assert_eq!(proximal_only[0].relation.as_u64(), 9);

    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(5.0, 5.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(-5.0, 5.0),
    ];
    let rho = scales(&[0.75, 0.75, 0.75, 0.75]);
    let mut field = GradientField::new(4);

    let value = relation_term(
        ScaledFrame::new(proven(&coordinates), &rho),
        proximal_only,
        relation_energy(0.25),
        1.0,
        &mut field,
    );

    // value = 0.5 (ν) · temperature (0.5) · softplus(0) = 0.25 ln 2.
    assert!(0.25_f32.mul_add(-core::f32::consts::LN_2, value).abs() < 1e-6);
    assert_eq!(gradient(&field, 0), DVec2::from(Vec2::new(-0.25, 0.0)));
    assert_eq!(gradient(&field, 2), DVec2::from(Vec2::new(0.25, 0.0)));
    assert_eq!(gradient(&field, 1), DVec2::from(Vec2::splat(0.0)));
    assert_eq!(gradient(&field, 3), DVec2::from(Vec2::splat(0.0)));
}

/// Matches the relation gradient under mixed local scales to finite differences.
///
/// The relation gradient over the full attraction fixture with mixed local scales agrees with
/// central finite differences on every row and axis.
#[test]
fn relation_term_gradient_matches_finite_differences() {
    let index = attraction_fixture();
    let batch = full_batch(&index);
    let energy = relation_energy(0.25);
    let rho = scales(&[0.5, 1.25, 0.75, 2.0]);
    let scale = 1.5;

    let coordinates = frame();
    let mut field = GradientField::new(4);
    relation_term(
        ScaledFrame::new(proven(&coordinates), &rho),
        &batch,
        energy,
        scale,
        &mut field,
    );

    for row in 0..4 {
        for axis in 0..2 {
            let difference = coordinate_difference(
                |perturbed| {
                    let mut scratch = GradientField::new(4);
                    relation_term(
                        ScaledFrame::new(proven(perturbed), &rho),
                        &batch,
                        energy,
                        scale,
                        &mut scratch,
                    )
                },
                &coordinates,
                row,
                axis,
                1e-3,
            );
            assert_derivative_close(
                component(gradient(&field, row), axis),
                difference,
                &format!("relation node {row} axis {axis}"),
            );
        }
    }
}

/// Keeps the relation gradient exactly zero with every row at one point.
///
/// With every row at the same point the relation value is positive but the gradient field stays
/// exactly zero.
#[test]
fn relation_term_skips_gradient_at_coincident_points() {
    let index = attraction_fixture();
    let batch = full_batch(&index);
    let coordinates = [Vec2::splat(1.0); 4];
    let rho = scales(&[0.75; 4]);
    let mut field = GradientField::new(4);

    let value = relation_term(
        ScaledFrame::new(proven(&coordinates), &rho),
        &batch,
        relation_energy(0.25),
        1.0,
        &mut field,
    );

    // z = 0 still carries Proximal energy mass, but a coincident pair
    // has no direction to pull along.
    assert!(value > 0.0);
    assert!(field.as_slice().iter().all(|&entry| entry == DVec2::ZERO));
}

/// Refuses empty, NaN and negative-weight support targets and admits a valid anchor.
///
/// `SupportTargets::new` returns `None` for no anchors, a NaN target or a negative weight, and
/// `Some` for a valid anchor.
#[test]
fn support_targets_reject_invalid_anchors() {
    let valid = BatchAnchor {
        row: BatchRowId::new(0),
        target: Vec2::new(1.0, -1.0),
        radius: non_negative!(0.5),
        weight: 1.0,
    };

    assert!(SupportTargets::<Training>::new(&[], &*DEVICE).is_none());
    assert!(
        SupportTargets::<Training>::new(
            &[BatchAnchor {
                target: Vec2::new(f32::NAN, 0.0),
                ..valid
            }],
            &*DEVICE
        )
        .is_none()
    );
    assert!(
        SupportTargets::<Training>::new(
            &[BatchAnchor {
                weight: -0.5,
                ..valid
            }],
            &*DEVICE
        )
        .is_none()
    );
    assert!(SupportTargets::<Training>::new(&[valid], &*DEVICE).is_some());
}

/// Builds the three-row support fixture with anchors at rows 0 and 2.
///
/// The support options carry a unit threshold and a `0.25` guard.
fn support_fixture() -> (
    Tensor<Training, 2>,
    SupportTargets<Training>,
    SupportOptions,
) {
    let coordinates = Tensor::from_data(
        TensorData::new(vec![0.5_f32, -0.25, 2.0, 1.5, -1.0, 0.75], [3, 2]),
        &*DEVICE,
    )
    .require_grad();
    let anchors = [
        BatchAnchor {
            row: BatchRowId::new(0),
            target: Vec2::new(0.25, 0.5),
            radius: non_negative!(0.75),
            weight: 1.5,
        },
        BatchAnchor {
            row: BatchRowId::new(2),
            target: Vec2::new(-2.0, 1.25),
            radius: non_negative!(1.5),
            weight: 0.5,
        },
    ];
    let targets = SupportTargets::new(&anchors, &*DEVICE).expect("the fixture anchors are valid");
    let options = SupportOptions::new(positive!(1.0), positive!(0.25));
    (coordinates, targets, options)
}

/// Matches the autodiff support gradient to the hand-derived chain rule within `1e-5`.
///
/// The autodiff gradient of the support term agrees with the hand-derived chain rule
/// `scale · weight · min(n, threshold) · (y - t) / (√(d² + ε²) · (r + ε))` within `1e-5` on both
/// anchored rows, and the unanchored row receives none.
#[test]
fn support_term_gradient_matches_the_analytic_formula() {
    // Independent reference: for each anchor, the hand-derived chain rule gives
    // dL/dy = scale · weight · min(n, threshold) · (y - t) / (√(d² + ε²) · (r + ε)) with n the
    // smoothed normalized distance. The autodiff backward pass must agree.
    let (coordinates, targets, options) = support_fixture();
    let scale = 1.25;

    let gradients = support_term(&coordinates, &targets, options, scale).backward();
    let gradient = coordinates
        .grad(&gradients)
        .expect("the support term should reach the coordinates")
        .into_data()
        .to_vec::<f32>()
        .expect("gradients should convert to f32 values");

    let anchors = [
        (
            0_usize,
            Vec2::new(0.5, -0.25),
            Vec2::new(0.25, 0.5),
            0.75,
            1.5,
        ),
        (2, Vec2::new(-1.0, 0.75), Vec2::new(-2.0, 1.25), 1.5, 0.5),
    ];
    let (threshold, epsilon) = (1.0_f32, 0.25_f32);
    for (row, coordinate, target, radius, weight) in anchors {
        let difference = coordinate - target;
        let smoothed = epsilon
            .mul_add(epsilon, difference.length_squared().get())
            .sqrt();
        let normalized = (smoothed - epsilon) / (radius + epsilon);
        let factor = scale * weight * normalized.min(threshold) / (smoothed * (radius + epsilon));
        let expected = difference * factor;
        for axis in 0..2 {
            let actual = gradient[row * 2 + axis];
            assert!(
                (actual - expected[axis]).abs() <= 1e-5 * expected[axis].abs().max(1.0),
                "anchor row {row} axis {axis}: autodiff {actual} against analytic {}",
                expected[axis],
            );
        }
    }

    // Unanchored rows receive no support gradient.
    assert_eq!(gradient[2], 0.0);
    assert_eq!(gradient[3], 0.0);
}

/// Reads zero value and an exactly zero gradient for an anchor lying on its target.
///
/// An anchor whose row lies exactly on its target yields a support value of zero and a defined,
/// exactly zero gradient.
#[test]
fn support_term_is_finite_at_exact_coincidence() {
    // Anchored nodes start exactly on their targets. The smoothed distance keeps the gradient
    // defined (and zero) there.
    let coordinates: Tensor<Training, 2> =
        Tensor::from_data(TensorData::new(vec![0.5_f32, -0.25], [1, 2]), &*DEVICE).require_grad();
    let anchors = [BatchAnchor {
        row: BatchRowId::new(0),
        target: Vec2::new(0.5, -0.25),
        radius: non_negative!(0.75),
        weight: 1.0,
    }];
    let targets = SupportTargets::new(&anchors, &*DEVICE).expect("the fixture anchors are valid");
    let options = SupportOptions::new(positive!(1.0), positive!(0.25));

    let value = support_term(&coordinates, &targets, options, 1.0);
    let scalar = value
        .clone()
        .into_data()
        .to_vec::<f32>()
        .expect("the value should convert to f32 values")[0];
    assert_eq!(scalar, 0.0);

    let gradients = value.backward();
    let gradient = coordinates
        .grad(&gradients)
        .expect("the support term should reach the coordinates")
        .into_data()
        .to_vec::<f32>()
        .expect("gradients should convert to f32 values");
    assert_eq!(gradient, vec![0.0, 0.0]);
}
