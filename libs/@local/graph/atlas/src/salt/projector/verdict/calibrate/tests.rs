use core::num::NonZero;

use hashql_core::id::{Id as _, IdSlice};

use super::{CalibrationOptions, ProximalCalibration, calibrate, reviewed_fraction_within};
use crate::{
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{NonNegative, Vec2, d_non_negative, d_positive, non_negative, positive, unit_fraction},
    salt::{
        policy::ClassProbabilities,
        projector::{
            scale::LocalScales,
            verdict::{PlacementClass, ResolvedVerdict},
        },
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::{AttractionIndex, AttractionOptions},
        },
    },
};

/// A full-Proximal, full-applicability, unit-strength policy.
fn proximal_policy(relation: u64) -> RelationPolicy {
    RelationPolicy {
        relation: OntologyRowId::new(relation),
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
    }
}

/// An unscored instance of `relation` between `source` and `target`.
fn instance(
    edge: u64,
    relation: u64,
    source: u64,
    target: u64,
) -> RelationInstance<NodeRowId, EdgeRowId> {
    RelationInstance {
        edge: EdgeRowId::new(edge),
        relation: OntologyRowId::new(relation),
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        confidence: RelationConfidence::default(),
        multiplicity: 1,
    }
}

fn attraction_index(
    rows: usize,
    policies: &[RelationPolicy],
    mut instances: Vec<RelationInstance<NodeRowId, EdgeRowId>>,
) -> AttractionIndex<NodeRowId, EdgeRowId> {
    RelationIndexes::build(
        rows,
        Policies::new(policies).expect("the fixture policies are certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture instances satisfy the input contract")
    .attraction
}

fn proximal_verdict(relation: u64) -> ResolvedVerdict {
    ResolvedVerdict {
        relation: OntologyRowId::new(relation),
        placement: PlacementClass::Proximal,
    }
}

/// Scales of 0.75 with the guard 0.25 make every normalization exactly one.
///
/// Measured `z` therefore equals raw 2D distance.
fn scale(value: f32) -> NonNegative {
    NonNegative::new(value).expect("test scales are finite and non-negative")
}

fn unit_scales(rows: usize) -> LocalScales<NodeRowId> {
    LocalScales::new(IdSlice::from_boxed_slice(
        vec![scale(0.75); rows].into_boxed_slice(),
    ))
}

fn options(cap: usize) -> CalibrationOptions {
    CalibrationOptions::new(
        NonZero::new(cap).expect("test limits are positive"),
        positive!(0.25),
        positive!(0.5),
    )
}

#[test]
fn z_is_measured_in_the_loss_normalization_by_hand() {
    // One disjoint pair with degrees 1 each, so ν = 1/√(2 · 2) = 0.5.
    let index = attraction_index(2, &[proximal_policy(5)], vec![instance(0, 5, 0, 1)]);

    // d = 5 (a 3-4-5 triangle). Normalization = √((0.75 + 0.25) · (24.75 + 0.25)) = √(25) = 5, so z
    // = 1 exactly.
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(3.0, 4.0)];
    let scales = LocalScales::new(IdSlice::from_boxed_slice(Box::new([
        scale(0.75),
        scale(24.75),
    ])));

    let outcome = calibrate(
        &[proximal_verdict(5)],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    // weight = sampling(1) · c(1) · ν(0.5) · p_P(1) · h(1) = 0.5.
    assert_eq!(outcome.radius, Some(non_negative!(1.0)));
    assert_eq!(outcome.types.len(), 1);
    assert_eq!(outcome.types[0].relation.as_u64(), 5);
    assert_eq!(outcome.types[0].pairs, 1);
    assert_eq!(outcome.types[0].mass, d_non_negative!(0.5));
    assert_eq!(
        outcome.types[0].quantiles,
        Some([non_negative!(1.0), non_negative!(1.0), non_negative!(1.0)])
    );
    // Leaving out the only type leaves nothing to measure.
    assert_eq!(outcome.types[0].radius_without, None);
}

#[test]
fn radius_is_the_weighted_p25() {
    // The fixture has four disjoint pairs (all ν = 0.5, weight 0.5) at z = 1, 2, 3, 4.
    let instances = (0..4)
        .map(|pair| instance(pair, 5, 2 * pair, 2 * pair + 1))
        .collect();
    let index = attraction_index(8, &[proximal_policy(5)], instances);

    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(12.0, 0.0),
        Vec2::new(20.0, 0.0),
        Vec2::new(23.0, 0.0),
        Vec2::new(30.0, 0.0),
        Vec2::new(34.0, 0.0),
    ];
    let scales = unit_scales(8);

    let outcome = calibrate(
        &[proximal_verdict(5)],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    // Total mass 2.0. Cumulative weight crosses 0.25/0.5/0.75 of it at
    // z = 1, 2, and 3: the smallest z whose cumulative 0.5-steps reach
    // 0.5, 1.0, and 1.5. The radius is the low quartile.
    assert_eq!(outcome.radius, Some(non_negative!(1.0)));
    assert_eq!(outcome.types[0].mass, d_non_negative!(2.0));
    assert_eq!(
        outcome.types[0].quantiles,
        Some([non_negative!(1.0), non_negative!(2.0), non_negative!(3.0)])
    );
    assert_eq!(outcome.types[0].radius_without, None);
}

#[test]
fn cap_bounds_a_high_volume_type() {
    // Type 5: eight disjoint pairs at z = 5. Type 9: two disjoint
    // pairs at z = 1. All ν = 0.5.
    let mut instances: Vec<_> = (0..8)
        .map(|pair| instance(pair, 5, 2 * pair, 2 * pair + 1))
        .collect();
    instances.push(instance(8, 9, 16, 17));
    instances.push(instance(9, 9, 18, 19));
    let index = attraction_index(20, &[proximal_policy(5), proximal_policy(9)], instances);

    let mut coordinates = Vec::new();
    for pair in 0..8_u16 {
        let x = f32::from(pair) * 10.0;
        coordinates.push(Vec2::new(x, 0.0));
        coordinates.push(Vec2::new(x + 5.0, 0.0));
    }
    coordinates.extend([
        Vec2::new(200.0, 0.0),
        Vec2::new(201.0, 0.0),
        Vec2::new(300.0, 0.0),
        Vec2::new(301.0, 0.0),
    ]);
    let scales = unit_scales(20);
    let verdicts = [proximal_verdict(5), proximal_verdict(9)];

    // Cap 2: type 5's pairs sample at 2/8, so both types weigh 1.0 and
    // type 9's first pair crosses the p25 threshold (0.5).
    let capped = calibrate(
        &verdicts,
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(2),
    );
    assert_eq!(capped.radius, Some(non_negative!(1.0)));
    assert_eq!(capped.types[0].mass, d_non_negative!(1.0));
    assert_eq!(capped.types[1].mass, d_non_negative!(1.0));

    // The leave-one-out spread names type 9 as the radius's owner:
    // without type 5 the two z = 1 pairs still cross a quarter of
    // their 1.0 mass at the first pair; without type 9 only z = 5
    // remains.
    assert_eq!(capped.types[0].radius_without, Some(non_negative!(1.0)));
    assert_eq!(capped.types[1].radius_without, Some(non_negative!(5.0)));

    // Cap 8: type 5 weighs 4.0 against type 9's 1.0 and buys the
    // radius with volume - the behaviour the sampler factor forbids.
    let uncapped = calibrate(
        &verdicts,
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(8),
    );
    assert_eq!(uncapped.radius, Some(non_negative!(5.0)));
}

#[test]
fn hubs_are_discounted_by_degree() {
    // Type 5 has one hub (node 0) linked to four leaves at z = 2 per pair. Within the group the
    // hub's degree is 4, so ν = 1/√(5 · 2). Type 9: three disjoint pairs at z = 1 with ν = 1/2.
    let instances = vec![
        instance(0, 5, 0, 1),
        instance(1, 5, 0, 2),
        instance(2, 5, 0, 3),
        instance(3, 5, 0, 4),
        instance(4, 9, 5, 6),
        instance(5, 9, 7, 8),
        instance(6, 9, 9, 10),
    ];
    let index = attraction_index(11, &[proximal_policy(5), proximal_policy(9)], instances);

    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(2.0, 0.0),
        Vec2::new(0.0, 2.0),
        Vec2::new(-2.0, 0.0),
        Vec2::new(0.0, -2.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(11.0, 0.0),
        Vec2::new(20.0, 0.0),
        Vec2::new(21.0, 0.0),
        Vec2::new(30.0, 0.0),
        Vec2::new(31.0, 0.0),
    ];
    let scales = unit_scales(11);

    let outcome = calibrate(
        &[proximal_verdict(5), proximal_verdict(9)],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    // The hub type has MORE pairs yet LESS mass: 4/√(10) < 3/2.
    let hub = &outcome.types[0];
    let peers = &outcome.types[1];
    assert!(hub.pairs > peers.pairs);
    assert!(hub.mass < peers.mass);
    let expected_hub_mass = 4.0 / 10.0_f64.sqrt();
    assert!(
        (hub.mass.get() - expected_hub_mass).abs() < 1e-6,
        "hub mass {} should be 4/sqrt(10) = {expected_hub_mass}",
        hub.mass.get(),
    );
    assert_eq!(peers.mass, d_non_negative!(1.5));

    // The pooled p25 equals the peers' z = 1, because their 1.5 mass alone covers the quarter
    // threshold before any hub pair enters.
    let total = hub.mass.get() + peers.mass.get();
    assert!(1.5 >= 0.25 * total);
    assert_eq!(outcome.radius, Some(non_negative!(1.0)));

    // Without the hub only the peers' z = 1 remains; without the
    // peers only the hub's z = 2 does.
    assert_eq!(hub.radius_without, Some(non_negative!(1.0)));
    assert_eq!(peers.radius_without, Some(non_negative!(2.0)));
}

#[test]
fn missing_groups_and_foreign_classes_contribute_nothing() {
    let index = attraction_index(2, &[proximal_policy(5)], vec![instance(0, 5, 0, 1)]);
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let scales = unit_scales(2);

    // Relation 7 has a reviewed Proximal verdict but no attraction group. Relation 5's verdict is
    // Overlay, which carries no geometry.
    let verdicts = [
        ResolvedVerdict {
            relation: OntologyRowId::new(5),
            placement: PlacementClass::Overlay,
        },
        ResolvedVerdict {
            relation: OntologyRowId::new(7),
            placement: PlacementClass::Proximal,
        },
    ];

    let outcome = calibrate(
        &verdicts,
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    assert_eq!(outcome.radius, None);
    assert_eq!(outcome.types.len(), 1);
    assert_eq!(outcome.types[0].relation.as_u64(), 7);
    assert_eq!(outcome.types[0].pairs, 0);
    assert_eq!(outcome.types[0].mass, d_non_negative!(0.0));
    assert_eq!(outcome.types[0].quantiles, None);
    assert_eq!(outcome.types[0].radius_without, None);
}

#[test]
fn no_verdicts_yield_no_radius() {
    let index = attraction_index(2, &[proximal_policy(5)], vec![instance(0, 5, 0, 1)]);
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let scales = unit_scales(2);

    let outcome = calibrate(
        &[],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    assert_eq!(
        outcome,
        ProximalCalibration {
            radius: None,
            types: Vec::new(),
            stability: None,
        },
    );
}

#[test]
fn the_fraction_instrument_re_measures_the_freeze_population() {
    // The p25 fixture: four disjoint pairs (weight 0.5 each, total 2.0) at z = 1, 2, 3, 4.
    let instances = (0..4)
        .map(|pair| instance(pair, 5, 2 * pair, 2 * pair + 1))
        .collect();
    let index = attraction_index(8, &[proximal_policy(5)], instances);
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(12.0, 0.0),
        Vec2::new(20.0, 0.0),
        Vec2::new(23.0, 0.0),
        Vec2::new(30.0, 0.0),
        Vec2::new(34.0, 0.0),
    ];
    let scales = unit_scales(8);
    let verdicts = [proximal_verdict(5)];
    let frame = IdSlice::from_raw(&coordinates);

    // The radius lies on the z = 1 atom. The boundary is inclusive: the pair at the radius
    // itself counts, and the freeze-time reading is the quarter the percentile crossed.
    let at_radius = reviewed_fraction_within(
        &verdicts,
        &index,
        frame,
        &scales,
        options(4),
        non_negative!(1.0),
    );
    assert_eq!(at_radius, Some(d_non_negative!(0.25)));

    // Between atoms the reading is the mass at or below, not an interpolation.
    let between = reviewed_fraction_within(
        &verdicts,
        &index,
        frame,
        &scales,
        options(4),
        non_negative!(2.5),
    );
    assert_eq!(between, Some(d_non_negative!(0.5)));

    // Below the whole population nothing is within, and the reading is a present zero.
    let below = reviewed_fraction_within(
        &verdicts,
        &index,
        frame,
        &scales,
        options(4),
        non_negative!(0.5),
    );
    assert_eq!(below, Some(d_non_negative!(0.0)));

    // No reviewed mass at all reads absent, never zero.
    let unreviewed =
        reviewed_fraction_within(&[], &index, frame, &scales, options(4), non_negative!(1.0));
    assert_eq!(unreviewed, None);
}

#[test]
fn the_calibration_carries_its_stability_certificate() {
    // The p25 fixture again: four equal weights make every certificate reading exact.
    let instances = (0..4)
        .map(|pair| instance(pair, 5, 2 * pair, 2 * pair + 1))
        .collect();
    let index = attraction_index(8, &[proximal_policy(5)], instances);
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(12.0, 0.0),
        Vec2::new(20.0, 0.0),
        Vec2::new(23.0, 0.0),
        Vec2::new(30.0, 0.0),
        Vec2::new(34.0, 0.0),
    ];
    let scales = unit_scales(8);

    let outcome = calibrate(
        &[proximal_verdict(5)],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    let certificate = outcome
        .stability
        .as_ref()
        .expect("a measured radius carries its certificate");

    // With four balanced pairs n_eff is the count, and the floor (29.51 at δ = 0.05) fails.
    assert_eq!(certificate.effective_support, d_positive!(4.0));
    assert_eq!(certificate.pairs, 4);
    assert_eq!(certificate.mass, d_non_negative!(2.0));
    assert_eq!(certificate.temperature, d_positive!(0.5));
    assert_eq!(certificate.tau, d_positive!(0.5));
    assert_eq!(
        certificate.epsilon_zero,
        d_positive!(0.679_050_757_870_309_8)
    );
    // Past the floor the lower endpoint clamps at the population minimum z = 1 and the upper
    // level walks to the maximum z = 4.
    assert_eq!(certificate.gap, d_non_negative!(3.0));
    assert!(!certificate.pass);
    // A single reviewed type is maximally thin, and any reader can see it.
    assert_eq!(certificate.type_effective_support, d_positive!(1.0));

    // A vacuous measurement carries no certificate.
    let vacuous = calibrate(
        &[],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );
    assert_eq!(vacuous.stability, None);
}

#[test]
fn the_leave_one_out_spread_reads_the_owning_review() {
    // Type 5 has two pairs at z = 5 (mass 1.0) and type 9 two pairs at z = 1 (mass 1.0).
    // Leaving either out moves the pooled radius to the other's atom.
    let mut instances: Vec<_> = (0..2)
        .map(|pair| instance(pair, 5, 2 * pair, 2 * pair + 1))
        .collect();
    instances.push(instance(2, 9, 4, 5));
    instances.push(instance(3, 9, 6, 7));
    let index = attraction_index(8, &[proximal_policy(5), proximal_policy(9)], instances);

    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(5.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(15.0, 0.0),
        Vec2::new(20.0, 0.0),
        Vec2::new(21.0, 0.0),
        Vec2::new(30.0, 0.0),
        Vec2::new(31.0, 0.0),
    ];
    let scales = unit_scales(8);

    let outcome = calibrate(
        &[proximal_verdict(5), proximal_verdict(9)],
        &index,
        IdSlice::from_raw(&coordinates),
        &scales,
        options(4),
    );

    // Pooled radius z = 1 (type 9's atom crosses the quarter threshold). Without type 5 the
    // radius stays 1, and without type 9 it moves to 5. The spread is the larger movement.
    assert_eq!(outcome.radius, Some(non_negative!(1.0)));
    assert_eq!(outcome.leave_one_out_spread(), Some(d_non_negative!(4.0)));

    // A vacuous calibration has no radius to spread around.
    let vacuous = ProximalCalibration {
        radius: None,
        types: Vec::new(),
        stability: None,
    };
    assert_eq!(vacuous.leave_one_out_spread(), None);
}
