#![expect(
    clippy::float_cmp,
    reason = "fixtures use dyadic coordinates and scales whose distances, normalizations, and \
              weights are exact in f32/f64, so equality assertions are contracts"
)]

use core::num::NonZero;

use super::{CalibrationOptions, ProximalCalibration, calibrate};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{NonNegative, Vec2},
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
            coincident: 0.0,
            proximal: 1.0,
        },
        selected: ClassProbabilities {
            coincident: 0.0,
            proximal: 1.0,
        },
        applicability: 1.0,
        strength: 1.0,
    }
}

/// An unscored instance of `relation` between `source` and `target`.
fn instance(edge: u64, relation: u64, source: u64, target: u64) -> RelationInstance {
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
    mut instances: Vec<RelationInstance>,
) -> AttractionIndex {
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
/// So measured `z` equals raw 2D distance.
fn scale(value: f32) -> NonNegative {
    NonNegative::new(value).expect("test scales are finite and non-negative")
}

fn unit_scales(rows: usize) -> LocalScales {
    LocalScales::new(vec![scale(0.75); rows].into_boxed_slice())
}

fn options(cap: usize) -> CalibrationOptions {
    CalibrationOptions::new(NonZero::new(cap).expect("test limits are positive"), 0.25)
        .expect("0.25 is a valid scale guard")
}

#[test]
fn z_is_measured_in_the_loss_normalization_by_hand() {
    // One disjoint pair: degrees 1 each, so ν = 1/√(2 · 2) = 0.5.
    let index = attraction_index(2, &[proximal_policy(5)], vec![instance(0, 5, 0, 1)]);

    // d = 5 (a 3-4-5 triangle); normalization = √((0.75 + 0.25) ·
    // (24.75 + 0.25)) = √(25) = 5, so z = 1 exactly.
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(3.0, 4.0)];
    let scales = LocalScales::new(Box::new([scale(0.75), scale(24.75)]));

    let outcome = calibrate(
        &[proximal_verdict(5)],
        &index,
        &coordinates,
        &scales,
        options(4),
    );

    // weight = sampling(1) · c(1) · ν(0.5) · p_P(1) · h(1) = 0.5.
    assert_eq!(outcome.radius, Some(1.0));
    assert_eq!(outcome.types.len(), 1);
    assert_eq!(outcome.types[0].relation.get(), 5);
    assert_eq!(outcome.types[0].pairs, 1);
    assert_eq!(outcome.types[0].mass, 0.5);
    assert_eq!(outcome.types[0].quantiles, Some([1.0, 1.0, 1.0]));
    // Leaving out the only type leaves nothing to measure.
    assert_eq!(outcome.types[0].radius_without, None);
}

#[test]
fn radius_is_the_weighted_p75() {
    // Four disjoint pairs (all ν = 0.5, weight 0.5) at z = 1, 2, 3, 4.
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
        &coordinates,
        &scales,
        options(4),
    );

    // Total mass 2.0. Cumulative weight crosses 0.25/0.5/0.75 of it at
    // z = 1, 2, and 3: the smallest z whose cumulative 0.5-steps reach
    // 0.5, 1.0, and 1.5.
    assert_eq!(outcome.radius, Some(3.0));
    assert_eq!(outcome.types[0].mass, 2.0);
    assert_eq!(outcome.types[0].quantiles, Some([1.0, 2.0, 3.0]));
    assert_eq!(outcome.types[0].radius_without, None);
}

#[test]
fn cap_bounds_a_high_volume_type() {
    // Type 5: eight disjoint pairs at z = 1. Type 9: two disjoint
    // pairs at z = 5. All ν = 0.5.
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
        coordinates.push(Vec2::new(x + 1.0, 0.0));
    }
    coordinates.extend([
        Vec2::new(200.0, 0.0),
        Vec2::new(205.0, 0.0),
        Vec2::new(300.0, 0.0),
        Vec2::new(305.0, 0.0),
    ]);
    let scales = unit_scales(20);
    let verdicts = [proximal_verdict(5), proximal_verdict(9)];

    // Cap 2: type 5's pairs sample at 2/8, so both types weigh 1.0 and
    // the p75 threshold (1.5) is crossed by type 9's first pair.
    let capped = calibrate(&verdicts, &index, &coordinates, &scales, options(2));
    assert_eq!(capped.radius, Some(5.0));
    assert_eq!(capped.types[0].mass, 1.0);
    assert_eq!(capped.types[1].mass, 1.0);

    // The leave-one-out spread names type 9 as the radius's owner:
    // without type 5 the two z = 5 pairs cross 0.75 of their 1.0 mass
    // at the second pair; without type 9 the 0.125-steps over z = 1
    // reach 0.75 at the sixth.
    assert_eq!(capped.types[0].radius_without, Some(5.0));
    assert_eq!(capped.types[1].radius_without, Some(1.0));

    // Cap 8: type 5 weighs 4.0 against type 9's 1.0 and buys the
    // radius with volume - the behaviour the sampler factor forbids.
    let uncapped = calibrate(&verdicts, &index, &coordinates, &scales, options(8));
    assert_eq!(uncapped.radius, Some(1.0));
}

#[test]
fn hubs_are_discounted_by_degree() {
    // Type 5: one hub (node 0) linked to four leaves, z = 2 per pair;
    // within the group the hub's degree is 4, so ν = 1/√(5 · 2).
    // Type 9: three disjoint pairs at z = 1 with ν = 1/2.
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
        &coordinates,
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
        (hub.mass - expected_hub_mass).abs() < 1e-6,
        "hub mass {} should be 4/sqrt(10) = {expected_hub_mass}",
        hub.mass,
    );
    assert_eq!(peers.mass, 1.5);

    // Pooled p50 lands on the peers' z = 1: their 1.5 mass alone
    // crosses half the total. With undiscounted weights the hub's four
    // pairs would weigh 2.0 and drag the median to z = 2.
    let total = hub.mass + peers.mass;
    assert!(1.5 >= 0.5 * total);
    assert_eq!(outcome.radius, Some(2.0));

    // Without the hub only the peers' z = 1 remains; without the
    // peers only the hub's z = 2 does.
    assert_eq!(hub.radius_without, Some(1.0));
    assert_eq!(peers.radius_without, Some(2.0));
}

#[test]
fn missing_groups_and_foreign_classes_contribute_nothing() {
    let index = attraction_index(2, &[proximal_policy(5)], vec![instance(0, 5, 0, 1)]);
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let scales = unit_scales(2);

    // Relation 7 is reviewed Proximal but has no attraction group;
    // relation 5's verdict is Overlay, which carries no geometry.
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

    let outcome = calibrate(&verdicts, &index, &coordinates, &scales, options(4));

    assert_eq!(outcome.radius, None);
    assert_eq!(outcome.types.len(), 1);
    assert_eq!(outcome.types[0].relation.get(), 7);
    assert_eq!(outcome.types[0].pairs, 0);
    assert_eq!(outcome.types[0].mass, 0.0);
    assert_eq!(outcome.types[0].quantiles, None);
    assert_eq!(outcome.types[0].radius_without, None);
}

#[test]
fn no_verdicts_yield_no_radius() {
    let index = attraction_index(2, &[proximal_policy(5)], vec![instance(0, 5, 0, 1)]);
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let scales = unit_scales(2);

    let outcome = calibrate(&[], &index, &coordinates, &scales, options(4));

    assert_eq!(
        outcome,
        ProximalCalibration {
            radius: None,
            types: Vec::new(),
        },
    );
}

#[test]
fn options_reject_an_invalid_scale_guard() {
    let cap = NonZero::new(4).expect("four is positive");

    assert!(CalibrationOptions::new(cap, 0.25).is_some());
    assert!(CalibrationOptions::new(cap, 0.0).is_none());
    assert!(CalibrationOptions::new(cap, -1.0).is_none());
    assert!(CalibrationOptions::new(cap, f32::NAN).is_none());
    assert!(CalibrationOptions::new(cap, f32::INFINITY).is_none());
}
