#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use super::{
    FitConfig, FitError, TrainingRow, TrainingSet, TrainingSetError, applicability, calibration,
    fit, grouped_folds,
    objective::{self, PARAMETER_COUNT, Parameters},
    split_parameters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AlignedVecN, BoxedVecN},
    salt::policy::GeometryClass,
};

const CAPACITY: usize = 8;

/// An owned training corpus growing row by row.
struct Corpus {
    storage: BoxedVecN<{ CAPACITY * CANONICAL_DIMENSIONS }>,
    rows: Vec<TrainingRow>,
}

impl Corpus {
    fn new() -> Self {
        Self {
            storage: BoxedVecN::zero(),
            rows: Vec::new(),
        }
    }

    fn push(
        &mut self,
        leading: &[f32],
        target: [f64; GeometryClass::COUNT],
        weight: f64,
        group: &[u8],
    ) {
        let index = self.rows.len();
        assert!(index < CAPACITY, "the fixture fits the capacity");
        let start = index * CANONICAL_DIMENSIONS;
        self.storage.as_array_mut()[start..start + leading.len()].copy_from_slice(leading);
        self.rows.push(TrainingRow {
            target,
            weight,
            group: digest(group),
        });
    }

    fn embeddings(&self) -> &[AlignedVecN<CANONICAL_DIMENSIONS>] {
        AlignedVecN::from_slice(&self.storage.as_array()[..self.rows.len() * CANONICAL_DIMENSIONS])
            .expect("boxed storage is aligned")
    }

    fn training(&self) -> TrainingSet<'_> {
        TrainingSet::new(self.embeddings(), &self.rows).expect("the fixture corpus validates")
    }
}

fn digest(bytes: &[u8]) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize()
}

fn config() -> FitConfig {
    FitConfig {
        regularization: 0.5,
        maximum_iterations: 1_000,
        gradient_tolerance: 1.0e-7,
        history_size: 8,
        folds: 2,
        seed: 17,
    }
}

/// Two rows with mixed targets and distinct groups.
fn mixed_corpus() -> Corpus {
    let mut corpus = Corpus::new();
    corpus.push(&[0.5, -0.25, 0.125, 0.75], [0.6, 0.3, 0.1], 1.5, b"group-a");
    corpus.push(
        &[-0.5, 0.75, 0.25, -0.125],
        [0.2, 0.2, 0.6],
        2.5,
        b"group-b",
    );
    corpus
}

#[test]
fn training_set_rejects_contract_violations() {
    let empty = TrainingSet::new(&[], &[]).expect_err("an empty corpus is invalid");
    assert_eq!(empty, TrainingSetError::Empty);

    let corpus = mixed_corpus();
    let mismatch = TrainingSet::new(corpus.embeddings(), &corpus.rows[..1])
        .expect_err("mismatched lengths are invalid");
    assert_eq!(
        mismatch,
        TrainingSetError::RowMismatch {
            embeddings: 2,
            rows: 1,
        },
    );

    let mut poisoned = mixed_corpus();
    poisoned.storage.as_array_mut()[CANONICAL_DIMENSIONS + 5] = f32::NAN;
    let non_finite = TrainingSet::new(poisoned.embeddings(), &poisoned.rows)
        .expect_err("a non-finite component is invalid");
    assert_eq!(
        non_finite,
        TrainingSetError::NonFiniteEmbedding {
            row: 1,
            component: 5,
        },
    );

    let mut invalid_target = mixed_corpus();
    invalid_target.rows[0].target = [1.5, -0.25, -0.25];
    let target = TrainingSet::new(invalid_target.embeddings(), &invalid_target.rows)
        .expect_err("a target above one is invalid");
    assert_eq!(
        target,
        TrainingSetError::InvalidTarget {
            row: 0,
            class: GeometryClass::Coincident,
            value: 1.5,
        },
    );

    let mut unnormalized = mixed_corpus();
    unnormalized.rows[1].target = [0.5, 0.1, 0.1];
    let sum = TrainingSet::new(unnormalized.embeddings(), &unnormalized.rows)
        .expect_err("an unnormalized target is invalid");
    assert_eq!(
        sum,
        TrainingSetError::UnnormalizedTarget {
            row: 1,
            sum: 0.5 + 0.1 + 0.1,
        },
    );

    let mut weightless = mixed_corpus();
    weightless.rows[0].weight = 0.0;
    let weight = TrainingSet::new(weightless.embeddings(), &weightless.rows)
        .expect_err("a zero weight is invalid");
    assert_eq!(
        weight,
        TrainingSetError::InvalidWeight { row: 0, value: 0.0 }
    );
}

#[test]
fn grouped_folds_keep_groups_whole_and_sizes_balanced() {
    let rows = [
        (b"alpha".as_slice(), 3),
        (b"beta".as_slice(), 1),
        (b"gamma".as_slice(), 1),
        (b"delta".as_slice(), 1),
    ]
    .into_iter()
    .flat_map(|(group, count)| {
        core::iter::repeat_n(
            TrainingRow {
                target: [0.2, 0.3, 0.5],
                weight: 1.0,
                group: digest(group),
            },
            count,
        )
    })
    .collect::<Vec<_>>();

    let folds = grouped_folds(&rows, 2, 9).expect("four groups fill two folds");

    assert_eq!(folds.len(), rows.len());
    // Rows sharing a group land in one fold.
    assert!(folds[..3].iter().all(|fold| *fold == folds[0]));
    // Largest-first greedy assignment balances sizes 3 and 3.
    let counts = folds.iter().fold([0_usize; 2], |mut counts, fold| {
        counts[*fold] += 1;
        counts
    });
    assert_eq!(counts, [3, 3]);

    let again = grouped_folds(&rows, 2, 9).expect("the assignment is deterministic");
    assert_eq!(folds, again);
}

#[test]
fn grouped_folds_reject_too_few_groups() {
    let corpus = mixed_corpus();
    let error = grouped_folds(&corpus.rows, 3, 0).expect_err("two groups cannot fill three folds");
    assert!(matches!(
        error,
        FitError::InsufficientGroups {
            groups: 2,
            folds: 3
        },
    ));
}

#[test]
fn objective_is_invariant_to_a_common_intercept_shift() {
    let mut corpus = Corpus::new();
    corpus.push(&[], [0.2, 0.3, 0.500_000_000_5], 1.0, b"group");
    let training = corpus.training();
    let objective = objective::Objective {
        training,
        folds: &[0],
        held_out: None,
        regularization: 1.0,
    };

    let zero = Parameters::zero();
    let mut shifted = Parameters::zero();
    shifted.as_array_mut()[PARAMETER_COUNT - GeometryClass::COUNT..].fill(17.0);

    let zero_cost = objective.cost_value(&zero);
    let shifted_cost = objective.cost_value(&shifted);
    assert!((zero_cost - shifted_cost).abs() <= 1.0e-12);

    let zero_gradient = objective.gradient_value(&zero);
    let shifted_gradient = objective.gradient_value(&shifted);
    for (zero, shifted) in zero_gradient.as_array()[PARAMETER_COUNT - GeometryClass::COUNT..]
        .iter()
        .zip(&shifted_gradient.as_array()[PARAMETER_COUNT - GeometryClass::COUNT..])
    {
        assert!((zero - shifted).abs() <= 1.0e-12);
    }
}

#[test]
fn objective_gradient_matches_central_differences() {
    let corpus = mixed_corpus();
    let training = corpus.training();
    let objective = objective::Objective {
        training,
        folds: &[0, 0],
        held_out: None,
        regularization: 0.75,
    };

    let mut parameters = Parameters::zero();
    {
        let array = parameters.as_array_mut();
        let leading_by_class = [
            [0.10, -0.05, 0.20, 0.15],
            [-0.10, 0.25, 0.05, -0.20],
            [0.30, -0.15, -0.10, 0.05],
        ];
        for (class, leading) in leading_by_class.into_iter().enumerate() {
            array[class * CANONICAL_DIMENSIONS..class * CANONICAL_DIMENSIONS + leading.len()]
                .copy_from_slice(&leading);
        }
        array[PARAMETER_COUNT - GeometryClass::COUNT..].copy_from_slice(&[-0.125, 0.0, 0.125]);
    }

    let gradient = objective.gradient_value(&parameters);
    let step = 1.0e-5;
    for index in [
        0,
        2,
        CANONICAL_DIMENSIONS + 1,
        2 * CANONICAL_DIMENSIONS + 3,
        PARAMETER_COUNT - GeometryClass::COUNT,
        PARAMETER_COUNT - 1,
    ] {
        let mut forward = parameters.clone();
        forward.as_array_mut()[index] += step;
        let mut backward = parameters.clone();
        backward.as_array_mut()[index] -= step;
        let difference =
            (objective.cost_value(&forward) - objective.cost_value(&backward)) / (2.0 * step);

        let analytic = gradient.as_array()[index];
        assert!(
            (difference - analytic).abs() <= 1.0e-6 * analytic.abs().max(1.0),
            "component {index}: finite difference {difference} vs gradient {analytic}",
        );
    }
}

/// One-hot rows over the first three components, one class each.
fn one_hot_corpus() -> Corpus {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0, 0.0, 0.0], [1.0, 0.0, 0.0], 1.0, b"one");
    corpus.push(&[0.0, 1.0, 0.0], [0.0, 1.0, 0.0], 1.0, b"two");
    corpus.push(&[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], 1.0, b"three");
    corpus
}

fn coefficient_norm(parameters: &Parameters) -> f64 {
    parameters.as_array()[..PARAMETER_COUNT - GeometryClass::COUNT]
        .iter()
        .map(|value| value * value)
        .sum::<f64>()
        .sqrt()
}

#[test]
fn stronger_regularization_shrinks_the_fitted_coefficients() {
    let corpus = one_hot_corpus();
    let training = corpus.training();

    let (weak, _) = objective::fit_model(
        training,
        &[0, 0, 0],
        None,
        FitConfig {
            regularization: 0.1,
            ..config()
        },
    )
    .expect("the weak fit converges");
    let (strong, _) = objective::fit_model(
        training,
        &[0, 0, 0],
        None,
        FitConfig {
            regularization: 10.0,
            ..config()
        },
    )
    .expect("the strong fit converges");

    assert!(coefficient_norm(&strong) < coefficient_norm(&weak));
}

#[test]
fn fitted_parameters_are_locally_optimal() {
    let corpus = one_hot_corpus();
    let training = corpus.training();
    let objective = objective::Objective {
        training,
        folds: &[0, 0, 0],
        held_out: None,
        regularization: 0.5,
    };

    let (parameters, _) =
        objective::fit_model(training, &[0, 0, 0], None, config()).expect("the fit converges");
    let optimum = objective.cost_value(&parameters);

    for index in [0, 1, CANONICAL_DIMENSIONS + 1, PARAMETER_COUNT - 1] {
        for delta in [-1.0e-3, 1.0e-3] {
            let mut perturbed = parameters.clone();
            perturbed.as_array_mut()[index] += delta;
            assert!(
                objective.cost_value(&perturbed) >= optimum,
                "perturbing component {index} by {delta} improved the objective",
            );
        }
    }
}

#[test]
fn fit_model_requires_complete_class_mass() {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [0.0, 0.5, 0.5], 1.0, b"one");
    corpus.push(&[0.0, 1.0], [0.0, 0.5, 0.5], 1.0, b"two");

    let error = objective::fit_model(corpus.training(), &[0, 0], None, config())
        .expect_err("a class without mass cannot fit");
    assert!(matches!(
        error,
        FitError::MissingClassMass {
            class: GeometryClass::Coincident,
        },
    ));
}

#[test]
fn overconfident_logits_calibrate_above_one() {
    let rows = vec![
        TrainingRow {
            target: [0.6, 0.2, 0.2],
            weight: 1.0,
            group: digest(b"a"),
        };
        4
    ];
    let logits = vec![[6.0, 0.0, 0.0]; 4];

    let temperature = calibration::fit_temperature(&rows, &logits);

    // softmax([6, 0, 0] / T) equals the target at exp(6 / T) = 3, an
    // interior optimum of the [0.05, 20] bracket. Near the optimum the
    // cross-entropy is flat below f64 resolution over a relative
    // window of roughly sqrt(2 * eps / 0.24) ~ 3e-8 in ln T, so the
    // search cannot localize tighter than that.
    let expected = 6.0 / 3.0_f64.ln();
    assert!(temperature > 1.0);
    assert!((temperature - expected).abs() <= 1.0e-6 * expected);
    // Local optimality: the returned temperature beats its neighbors.
    let optimum = calibration::metrics(&rows, &logits, temperature).calibrated_cross_entropy;
    for neighbor in [temperature * 1.05, temperature / 1.05] {
        let value = calibration::metrics(&rows, &logits, neighbor).calibrated_cross_entropy;
        assert!(optimum <= value);
    }
}

#[test]
fn calibration_never_worsens_cross_entropy() {
    let rows = [
        TrainingRow {
            target: [0.7, 0.2, 0.1],
            weight: 2.0,
            group: digest(b"a"),
        },
        TrainingRow {
            target: [0.1, 0.6, 0.3],
            weight: 1.0,
            group: digest(b"b"),
        },
    ];
    let logits = [[0.4, -0.2, 0.1], [-0.3, 0.8, 0.2]];

    let temperature = calibration::fit_temperature(&rows, &logits);
    let metrics = calibration::metrics(&rows, &logits, temperature);

    // The unit temperature is always among the candidates.
    assert!(metrics.calibrated_cross_entropy <= metrics.raw_cross_entropy);
}

#[test]
fn metrics_match_hand_computed_values() {
    let rows = [TrainingRow {
        target: [1.0, 0.0, 0.0],
        weight: 2.0,
        group: digest(b"a"),
    }];
    let logits = [[0.0, 0.0, 0.0]];

    let metrics = calibration::metrics(&rows, &logits, 1.0);

    // Uniform probabilities: CE = ln 3, Brier = (2/3)^2 + 2 * (1/3)^2.
    assert!((metrics.raw_cross_entropy - 3.0_f64.ln()).abs() <= 1.0e-15);
    assert!((metrics.raw_brier - 2.0 / 3.0).abs() <= 1.0e-15);
}

#[test]
fn applicability_matches_hand_computed_values() {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [0.2, 0.3, 0.5], 1.0, b"a");
    corpus.push(&[3.0], [0.2, 0.3, 0.5], 1.0, b"b");

    let fitted = applicability::fit_applicability(corpus.training())
        .expect("finite embeddings fit applicability");

    #[expect(
        clippy::suboptimal_flops,
        reason = "the reference deliberately mirrors the plain shrinkage formula"
    )]
    let expected_scales = {
        let dimensions = 3072.0_f64;
        let pooled = 1.0 / dimensions;
        let shrinkage = dimensions / (2.0 + dimensions);
        let leading = (1.0 - shrinkage) * 1.0 + shrinkage * pooled;
        let other = shrinkage * pooled;
        (1.0 / leading.sqrt(), 1.0 / other.sqrt())
    };

    assert_eq!(fitted.mean.as_array()[0], 2.0);
    assert_eq!(fitted.mean.as_array()[1], 0.0);
    let scales = fitted.inverse_scales.as_array();
    assert!((scales[0] - expected_scales.0).abs() <= 1.0e-9 * expected_scales.0);
    assert!((scales[1] - expected_scales.1).abs() <= 1.0e-9 * expected_scales.1);

    // Both rows sit one leading unit from the mean, so their distances
    // agree: sqrt(scale^2 / dimensions).
    let expected_distance = (expected_scales.0 * expected_scales.0 / 3072.0).sqrt();
    assert_eq!(fitted.distances.len(), 2);
    for distance in &fitted.distances {
        assert!((distance - expected_distance).abs() <= 1.0e-9 * expected_distance);
    }
}

#[test]
fn a_constant_corpus_gets_unit_scales_and_zero_distances() {
    let mut corpus = Corpus::new();
    corpus.push(&[0.5, 0.5], [0.2, 0.3, 0.5], 1.0, b"a");
    corpus.push(&[0.5, 0.5], [0.2, 0.3, 0.5], 1.0, b"b");

    let fitted = applicability::fit_applicability(corpus.training())
        .expect("finite embeddings fit applicability");

    assert!(
        fitted
            .inverse_scales
            .as_array()
            .iter()
            .all(|scale| *scale == 1.0)
    );
    assert!(fitted.distances.iter().all(|distance| *distance == 0.0));
}

#[test]
fn split_parameters_places_rows_and_intercepts() {
    let mut parameters = Parameters::zero();
    parameters.as_array_mut()[0] = 1.5;
    parameters.as_array_mut()[CANONICAL_DIMENSIONS] = 2.5;
    parameters.as_array_mut()[PARAMETER_COUNT - GeometryClass::COUNT..]
        .copy_from_slice(&[7.0, 8.0, 9.0]);

    let (coefficients, intercepts) = split_parameters(&parameters);

    assert_eq!(coefficients[0].as_array()[0], 1.5);
    assert_eq!(coefficients[1].as_array()[0], 2.5);
    assert_eq!(coefficients[2].as_array()[0], 0.0);
    assert_eq!(intercepts, [7.0, 8.0, 9.0]);
}

/// Six single-group rows whose soft targets rotate the dominant class.
fn soft_corpus() -> Corpus {
    let mut corpus = Corpus::new();
    let targets = [[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]];
    let groups: [&[u8]; 6] = [b"g0", b"g1", b"g2", b"g3", b"g4", b"g5"];
    for (row, group) in groups.into_iter().enumerate() {
        let mut leading = [0.0_f32; 6];
        leading[row] = 1.0;
        let weight = if row % 2 == 0 { 1.0 } else { 2.0 };
        corpus.push(&leading, targets[row % GeometryClass::COUNT], weight, group);
    }
    corpus
}

#[test]
fn fit_recovers_the_generating_distributions() {
    let corpus = soft_corpus();
    let training = corpus.training();

    let fitted = fit(
        training,
        FitConfig {
            regularization: 1.0e-3,
            seed: 7,
            ..config()
        },
    )
    .expect("the separable corpus fits");

    assert!(fitted.classifier.temperature() > 0.05);
    assert!(fitted.classifier.temperature() < 20.0);
    assert_eq!(fitted.evidence.folds.len(), 6);
    assert!(fitted.evidence.folds.iter().all(|fold| *fold < 2));
    assert!(
        fitted
            .evidence
            .out_of_fold_logits
            .iter()
            .flatten()
            .all(|logit| logit.is_finite())
    );
    assert!(
        fitted.evidence.calibrated_cross_entropy <= fitted.evidence.raw_cross_entropy + 1.0e-12
    );
    assert!(fitted.evidence.iterations >= 1);

    // With near-zero regularization the fitted raw posteriors reproduce
    // the generating soft targets on the training rows.
    for (row, expected) in corpus.rows.iter().enumerate() {
        let prediction = fitted
            .classifier
            .predict(&corpus.embeddings()[row])
            .expect("training embeddings predict");
        for (probability, target) in prediction.raw.as_array().iter().zip(expected.target) {
            assert!(
                (probability - target).abs() <= 0.05,
                "row {row}: posterior {probability} strays from target {target}",
            );
        }
        assert!(prediction.applicability > 0.0);
    }
}

#[test]
fn an_exhausted_iteration_bound_is_an_error() {
    let corpus = soft_corpus();
    let error = fit(
        corpus.training(),
        FitConfig {
            maximum_iterations: 1,
            gradient_tolerance: 1.0e-12,
            ..config()
        },
    )
    .expect_err("one iteration cannot converge");

    assert!(matches!(error, FitError::DidNotConverge { .. }));
}

#[test]
fn configuration_domains_are_validated() {
    let corpus = mixed_corpus();
    for (field, config) in [
        (
            "regularization",
            FitConfig {
                regularization: 0.0,
                ..config()
            },
        ),
        (
            "gradient_tolerance",
            FitConfig {
                gradient_tolerance: f64::NAN,
                ..config()
            },
        ),
        (
            "maximum_iterations",
            FitConfig {
                maximum_iterations: 0,
                ..config()
            },
        ),
        (
            "history_size",
            FitConfig {
                history_size: 0,
                ..config()
            },
        ),
        (
            "folds",
            FitConfig {
                folds: 1,
                ..config()
            },
        ),
    ] {
        let error = fit(corpus.training(), config).expect_err("the configuration is invalid");
        assert!(
            matches!(error, FitError::InvalidConfig { field: actual, .. } if actual == field),
            "expected an invalid {field}",
        );
    }
}
