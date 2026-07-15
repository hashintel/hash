use crate::salt::{
    classifier::ClassifierOutput,
    policy::{
        CoincidentGate, PlacementClass, PlacementPosterior, PolicyEvidence, PolicySource,
        PosteriorError, Probability, ProbabilityError, resolve,
    },
};

#[test]
fn precedence_selects_the_first_available_policy_record() {
    let human_override = PlacementPosterior::new(0.7, 0.2, 0.1).expect("posterior should validate");
    let human_reviewed = PlacementPosterior::new(0.1, 0.8, 0.1).expect("posterior should validate");
    let synthetic = PlacementPosterior::new(0.0, 0.2, 0.8).expect("posterior should validate");
    let classifier = prediction(0.2, 0.3, 0.5, 0.4);

    let policy = resolve(
        PolicyEvidence {
            human_override: Some(human_override),
            human_reviewed: Some(human_reviewed),
            synthetic: Some(synthetic),
            classifier: Some(classifier),
        },
        CoincidentGate::default(),
    );

    assert_eq!(policy.source, PolicySource::HumanOverride);
    assert_eq!(policy.selected, human_override);
    assert_eq!(policy.applicability, Probability::ONE);
    assert_posterior(policy.effective_attraction, [0.0, 0.2, 0.8]);
}

#[test]
fn classifier_applicability_mixes_only_toward_overlay() {
    let policy = resolve(
        PolicyEvidence {
            classifier: Some(prediction(0.6, 0.3, 0.1, 0.25)),
            ..PolicyEvidence::default()
        },
        CoincidentGate {
            enabled: true,
            minimum_probability: probability(0.1),
            minimum_applicability: probability(0.2),
        },
    );

    assert_eq!(policy.source, PolicySource::Classifier);
    assert_posterior(policy.attraction, [0.15, 0.075, 0.775]);
    assert!(policy.coincident_admitted);
    assert_eq!(policy.effective_attraction, policy.attraction);
}

#[test]
fn failed_coincident_gate_moves_mass_to_overlay() {
    let policy = resolve(
        PolicyEvidence {
            classifier: Some(prediction(0.6, 0.3, 0.1, 0.25)),
            ..PolicyEvidence::default()
        },
        CoincidentGate {
            enabled: true,
            minimum_probability: probability(0.1),
            minimum_applicability: probability(0.3),
        },
    );

    assert!(!policy.coincident_admitted);
    assert_posterior(policy.effective_attraction, [0.0, 0.075, 0.925]);
}

#[test]
fn missing_evidence_falls_back_to_overlay() {
    let policy = resolve(PolicyEvidence::default(), CoincidentGate::default());

    assert_eq!(policy.source, PolicySource::OverlayFallback);
    assert_eq!(policy.applicability, Probability::ZERO);
    assert_eq!(policy.selected, PlacementPosterior::OVERLAY);
    assert_eq!(policy.effective_attraction, PlacementPosterior::OVERLAY);
}

#[test]
fn posterior_validation_rejects_invalid_probabilities_and_mass() {
    assert!(matches!(
        PlacementPosterior::new(f64::NAN, 0.0, 1.0),
        Err(PosteriorError::Probability {
            class: PlacementClass::Coincident,
            error: ProbabilityError::NonFinite,
        })
    ));
    assert!(matches!(
        PlacementPosterior::new(0.6, 0.3, 0.2),
        Err(PosteriorError::NotNormalized)
    ));
    assert!(matches!(
        Probability::new(1.01),
        Err(ProbabilityError::OutsideUnitInterval)
    ));
    assert!(matches!(
        Probability::new(-0.0),
        Err(ProbabilityError::OutsideUnitInterval)
    ));
    let normalized = PlacementPosterior::new(0.2, 0.3, 0.500_000_000_000_5)
        .expect("mass within the declared tolerance should normalize");
    assert_eq!(
        normalized.coincident.get() + normalized.proximal.get() + normalized.overlay.get(),
        1.0
    );
}

#[test]
fn class_ties_follow_coincident_proximal_overlay_order() {
    let coincident_tie = PlacementPosterior::new(0.5, 0.5, 0.0).expect("posterior should validate");
    let proximal_tie = PlacementPosterior::new(0.0, 0.5, 0.5).expect("posterior should validate");

    assert_eq!(coincident_tie.top_class(), PlacementClass::Coincident);
    assert_eq!(proximal_tie.top_class(), PlacementClass::Proximal);
}

fn prediction(
    coincident: f64,
    proximal: f64,
    overlay: f64,
    applicability: f64,
) -> ClassifierOutput {
    let calibrated =
        PlacementPosterior::new(coincident, proximal, overlay).expect("posterior should validate");
    ClassifierOutput {
        logits: [0.0; 3],
        raw: calibrated,
        calibrated,
        distance: 0.0,
        applicability: probability(applicability),
    }
}

fn probability(value: f64) -> Probability {
    Probability::new(value).expect("probability should validate")
}

fn assert_posterior(actual: PlacementPosterior, expected: [f64; 3]) {
    let actual = [
        actual.coincident.get(),
        actual.proximal.get(),
        actual.overlay.get(),
    ];
    for (actual, expected) in actual.into_iter().zip(expected) {
        assert!(
            (actual - expected).abs() <= 1.0e-14,
            "{actual:.17} differs from {expected:.17}"
        );
    }
}
