#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use super::{
    Classification, CoincidentAdmission, PolicyOverride, PolicySource, ResolveError, resolve,
};
use crate::{
    dataset::OntologyRowId,
    math::UnitFraction,
    salt::{
        policy::{ClassProbabilities, Posterior, classifier::Prediction},
        relation::Policies,
    },
};

/// A prediction whose calibrated distribution and applicability are the
/// only fields resolution reads.
fn prediction(calibrated: [f64; 3], applicability: f64) -> Prediction {
    let posterior = Posterior::new(calibrated).expect("test distributions are valid");
    Prediction {
        logits: [0.0; 3],
        raw: posterior,
        calibrated: posterior,
        distance: 0.0,
        applicability,
    }
}

fn relation(row: u64) -> OntologyRowId {
    OntologyRowId::new(row)
}

#[test]
fn a_prediction_resolves_through_the_applicability_mix() {
    // Dyadic values: every product and narrowing below is exact.
    let policies = resolve(
        &[(
            relation(7),
            Classification::Predicted(prediction([0.5, 0.25, 0.25], 0.5)),
        )],
        &[],
        CoincidentAdmission::default(),
    )
    .expect("one prediction resolves");

    assert_eq!(policies.len(), 1);
    let policy = policies[0];
    assert_eq!(policy.relation, relation(7));
    // Selected is the source's own answer, before the mix.
    assert_eq!(
        policy.selected,
        ClassProbabilities {
            coincident: 0.5,
            proximal: 0.25,
        },
    );
    // Attraction scales the stored components by the applicability;
    // the ceded mass lands in the implicit Overlay remainder.
    assert_eq!(
        policy.attraction,
        ClassProbabilities {
            coincident: 0.25,
            proximal: 0.125,
        },
    );
    assert_eq!(policy.applicability, 0.5);
    assert_eq!(policy.strength, 1.0);
}

#[test]
fn an_unclassifiable_relation_falls_back_to_overlay() {
    let policies = resolve(
        &[(relation(3), Classification::Unclassified)],
        &[],
        CoincidentAdmission::default(),
    )
    .expect("the fallback resolves");

    let policy = policies[0];
    assert_eq!(
        policy.selected,
        ClassProbabilities {
            coincident: 0.0,
            proximal: 0.0,
        },
    );
    assert_eq!(policy.attraction, policy.selected);
    assert_eq!(policy.applicability, 0.0);
}

#[test]
fn overrides_supersede_predictions_by_precedence() {
    let classifications = [(
        relation(1),
        Classification::Predicted(prediction([0.0, 1.0, 0.0], 1.0)),
    )];
    let overrides = [
        PolicyOverride {
            relation: relation(1),
            source: PolicySource::Synthetic,
            distribution: Posterior::new([0.25, 0.5, 0.25]).expect("valid"),
        },
        PolicyOverride {
            relation: relation(1),
            source: PolicySource::Human,
            distribution: Posterior::new([0.5, 0.25, 0.25]).expect("valid"),
        },
        PolicyOverride {
            relation: relation(1),
            source: PolicySource::Reviewed,
            distribution: Posterior::new([0.0, 0.75, 0.25]).expect("valid"),
        },
    ];

    let policies = resolve(&classifications, &overrides, CoincidentAdmission::default())
        .expect("overrides resolve");

    // The human override wins; asserted records carry applicability 1,
    // so the mix passes the distribution through unchanged.
    let policy = policies[0];
    assert_eq!(
        policy.selected,
        ClassProbabilities {
            coincident: 0.5,
            proximal: 0.25,
        },
    );
    assert_eq!(policy.attraction, policy.selected);
    assert_eq!(policy.applicability, 1.0);
}

#[test]
fn admission_reroutes_failing_coincident_mass() {
    let admission = CoincidentAdmission {
        enforced: true,
        class_probability_threshold: UnitFraction::new(0.2).expect("0.2 lies inside [0, 1]"),
        applicability_threshold: UnitFraction::new(0.5).expect("0.5 lies inside [0, 1]"),
    };
    let classifications = [
        // Mixed Coincident 0.5 * 0.5 = 0.25 >= 0.2, a >= 0.5: admitted.
        (
            relation(0),
            Classification::Predicted(prediction([0.5, 0.25, 0.25], 0.5)),
        ),
        // Mixed Coincident 0.25 * 0.5 = 0.125 < 0.2: rerouted.
        (
            relation(1),
            Classification::Predicted(prediction([0.25, 0.5, 0.25], 0.5)),
        ),
        // Applicability 0.25 < 0.5 despite mixed Coincident 0.1875:
        // rerouted.
        (
            relation(2),
            Classification::Predicted(prediction([0.75, 0.125, 0.125], 0.25)),
        ),
    ];

    let policies = resolve(&classifications, &[], admission).expect("judged predictions resolve");

    assert_eq!(policies[0].attraction.coincident, 0.25);
    assert_eq!(policies[1].attraction.coincident, 0.0);
    assert_eq!(policies[2].attraction.coincident, 0.0);
    // Proximal never gains rerouted mass and is never judged.
    assert_eq!(policies[1].attraction.proximal, 0.25);
    // The selected distribution is untouched by mix and admission
    // alike.
    assert_eq!(policies[1].selected.coincident, 0.25);
}

#[test]
fn contract_violations_are_rejected() {
    let duplicate = resolve(
        &[
            (relation(1), Classification::Unclassified),
            (relation(1), Classification::Unclassified),
        ],
        &[],
        CoincidentAdmission::default(),
    )
    .expect_err("a duplicated relation is invalid");
    assert_eq!(
        duplicate,
        ResolveError::DuplicateRelation {
            relation: relation(1),
        },
    );

    let ambiguous = resolve(
        &[(relation(1), Classification::Unclassified)],
        &[
            PolicyOverride {
                relation: relation(1),
                source: PolicySource::Human,
                distribution: Posterior::new([0.5, 0.25, 0.25]).expect("valid"),
            },
            PolicyOverride {
                relation: relation(1),
                source: PolicySource::Human,
                distribution: Posterior::new([0.25, 0.5, 0.25]).expect("valid"),
            },
        ],
        CoincidentAdmission::default(),
    )
    .expect_err("two human overrides are ambiguous");
    assert_eq!(
        ambiguous,
        ResolveError::AmbiguousOverride {
            relation: relation(1),
            source: PolicySource::Human,
        },
    );

    let unknown = resolve(
        &[(relation(1), Classification::Unclassified)],
        &[PolicyOverride {
            relation: relation(2),
            source: PolicySource::Human,
            distribution: Posterior::new([0.5, 0.25, 0.25]).expect("valid"),
        }],
        CoincidentAdmission::default(),
    )
    .expect_err("an override outside the universe is invalid");
    assert_eq!(
        unknown,
        ResolveError::UnknownOverride {
            relation: relation(2),
        },
    );
}

#[test]
fn resolution_feeds_the_certified_policy_table() {
    // Input order is irrelevant; the output is strictly ascending and
    // passes the relation indexes' certification unchanged.
    let classifications = [
        (
            relation(9),
            Classification::Predicted(prediction([0.25, 0.5, 0.25], 0.75)),
        ),
        (relation(2), Classification::Unclassified),
        (
            relation(5),
            Classification::Predicted(prediction([0.0, 1.0, 0.0], 1.0)),
        ),
    ];

    let policies =
        resolve(&classifications, &[], CoincidentAdmission::default()).expect("the table resolves");

    assert!(policies.is_sorted_by(|previous, next| previous.relation.get() < next.relation.get()));
    Policies::new(&policies).expect("the resolved table passes certification");
}
