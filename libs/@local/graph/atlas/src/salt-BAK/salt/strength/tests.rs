use core::convert::Infallible;

use crate::salt::{
    policy::Probability,
    representation::{CANONICAL_DIMENSIONS, CanonicalEmbedding},
    strength::{
        RelationStrength, StrengthError, StrengthHead, StrengthMode, StrengthPosterior,
        strength_eligible,
    },
};

#[test]
fn posterior_strength_shrinks_toward_unit_with_low_applicability() {
    let posterior = StrengthPosterior {
        weak: probability(0.2),
        standard: probability(0.3),
        strong: probability(0.5),
    };

    let fully_applicable = RelationStrength::from_posterior(posterior, probability(1.0))
        .expect("valid probabilities should produce a bounded strength");
    let partly_applicable = RelationStrength::from_posterior(posterior, probability(0.25))
        .expect("valid probabilities should produce a bounded strength");
    let inapplicable = RelationStrength::from_posterior(posterior, probability(0.0))
        .expect("valid probabilities should produce a bounded strength");

    assert!((fully_applicable.get() - 1.4).abs() <= f64::EPSILON);
    assert!((partly_applicable.get() - 1.1).abs() <= f64::EPSILON);
    assert_eq!(inapplicable, RelationStrength::UNIT);
}

#[test]
fn strength_rejects_invalid_materialized_values_and_posteriors() {
    assert_matches!(
        RelationStrength::new(f64::NAN),
        Err(StrengthError::NonFinite { .. })
    ));
    assert_matches!(
        RelationStrength::new(2.0_f64.next_up()),
        Err(StrengthError::OutOfRange { .. })
    ));

    let posterior = StrengthPosterior {
        weak: probability(0.2),
        standard: probability(0.2),
        strong: probability(0.2),
    };
    assert_matches!(
        RelationStrength::from_posterior(posterior, probability(1.0)),
        Err(StrengthError::PosteriorSum { .. })
    ));
}

#[test]
fn unit_mode_bypasses_the_head_while_head_mode_dispatches() {
    #[derive(Debug, Copy, Clone)]
    struct FixedHead;

    impl StrengthHead for FixedHead {
        type Error = Infallible;

        fn predict(
            &self,
            _embedding: CanonicalEmbedding<'_>,
        ) -> Result<RelationStrength, Self::Error> {
            Ok(RelationStrength::new(1.75).expect("fixture strength should be valid"))
        }
    }

    let values = [0.0_f32; CANONICAL_DIMENSIONS];
    let embedding = CanonicalEmbedding::new(&values).expect("zero embedding should be finite");

    let unit = StrengthMode::<FixedHead>::Unit
        .predict(embedding)
        .expect("unit mode should be infallible");
    let fitted = StrengthMode::Head(FixedHead)
        .predict(embedding)
        .expect("fixed head should be infallible");

    assert_eq!(unit, RelationStrength::UNIT);
    assert_eq!(fitted.get(), 1.75);
}

#[test]
fn strength_fitting_eligibility_includes_the_declared_boundary() {
    assert!(!strength_eligible(probability(0.2_f64.next_down())));
    assert!(strength_eligible(probability(0.2)));
}

fn probability(value: f64) -> Probability {
    Probability::new(value).expect("fixture probability should be in range")
}
