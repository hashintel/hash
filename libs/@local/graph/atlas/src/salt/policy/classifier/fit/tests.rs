#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use core::{assert_matches, num::NonZeroU64};
use std::sync::Mutex;

use super::{
    FitConfig, FitError, TrainingRow, TrainingSet, TrainingSetError, applicability, calibration,
    fit, fit_model, grouped_folds,
    objective::{PARAMETER_COUNT, Parameters},
    regularization,
    solver::{
        Gram, PreparationError, PreparationSettings, SolverConfig, SolverConfigError,
        SolverFailure, WorkCounters,
    },
    split_parameters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AlignedVecN, BoxedVecN, d_positive},
    progress::{NoProgress, Progress},
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
        solver: SolverConfig {
            preparation: PreparationSettings {
                regularization: d_positive!(0.5),
                ..
            },
            ..
        },
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
    assert_matches!(
        error,
        FitError::InsufficientGroups {
            groups: 2,
            folds: 3
        },
    );
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

    let regularized = |regularization| FitConfig {
        solver: SolverConfig {
            preparation: PreparationSettings { regularization, .. },
            ..
        },
        ..config()
    };

    let gram = Gram::assemble(corpus.embeddings(), &mut WorkCounters::default());
    let (weak, _) = fit_model(
        training,
        &[0, 0, 0],
        None,
        regularized(d_positive!(0.1)),
        &gram,
        WorkCounters::default(),
    )
    .expect("the weak fit converges");
    let (strong, _) = fit_model(
        training,
        &[0, 0, 0],
        None,
        regularized(d_positive!(10.0)),
        &gram,
        WorkCounters::default(),
    )
    .expect("the strong fit converges");

    assert!(coefficient_norm(&strong) < coefficient_norm(&weak));
}

#[test]
fn fit_model_requires_complete_class_mass() {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [0.0, 0.5, 0.5], 1.0, b"one");
    corpus.push(&[0.0, 1.0], [0.0, 0.5, 0.5], 1.0, b"two");

    let gram = Gram::assemble(corpus.embeddings(), &mut WorkCounters::default());
    let error = fit_model(
        corpus.training(),
        &[0, 0],
        None,
        config(),
        &gram,
        WorkCounters::default(),
    )
    .expect_err("a class without mass cannot fit");
    assert_matches!(
        error,
        FitError::Preparation(PreparationError::MissingClassMass {
            class: GeometryClass::Coincident,
        }),
    );
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
    // window of roughly √(2 · ε / 0.24) ~ 3e-8 in ln T, so the
    // search cannot localize tighter than that.
    let expected = 6.0 / 3.0_f64.ln();
    assert!(temperature > 1.0);
    assert!((temperature - expected).abs() <= 1.0e-6 * expected);
    // Local optimality: the returned temperature beats its neighbours.
    let optimum = calibration::metrics(&rows, &logits, temperature).calibrated_cross_entropy;
    for neighbour in [temperature * 1.05, temperature / 1.05] {
        let value = calibration::metrics(&rows, &logits, neighbour).calibrated_cross_entropy;
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

    // Uniform probabilities: CE = ln 3, Brier = (2/3)^2 + 2 · (1/3)^2.
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
    // agree: √(scale^2 / dimensions).
    let expected_distance = (expected_scales.0 * expected_scales.0 / 3072.0).sqrt();
    assert_eq!(fitted.distances.len(), 2);
    for distance in &fitted.distances {
        assert!((distance - expected_distance).abs() <= 1.0e-9 * expected_distance);
    }
}

#[test]
fn constant_corpus_gets_unit_scales_and_zero_distances() {
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

        #[expect(
            clippy::integer_division_remainder_used,
            reason = "the fixture rotates classes and weights cyclically by row"
        )]
        let (target, weight) = (
            targets[row % GeometryClass::COUNT],
            if row % 2 == 0 { 1.0 } else { 2.0 },
        );
        corpus.push(&leading, target, weight, group);
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
            seed: 7,
            ..config()
        },
        &NoProgress,
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
    assert!(fitted.evidence.regularization <= 1.0);
    assert!(fitted.evidence.iterations >= 1);

    // The separable corpus rewards weak regularization out of fold, so the
    // selection stays weak and the fitted raw posteriors reproduce the
    // generating soft targets on the training rows.
    for (row, expected) in corpus.rows.iter().enumerate() {
        let prediction = fitted
            .classifier
            .predict(&corpus.embeddings()[row])
            .expect("training embeddings predict");
        for (probability, target) in prediction.raw.to_array().into_iter().zip(expected.target) {
            assert!(
                (probability - target).abs() <= 0.05,
                "row {row}: posterior {probability} strays from target {target}",
            );
        }
        assert!(prediction.applicability > 0.0);
    }
}

#[test]
fn regularization_winner_takes_the_minimum_and_ties_prefer_the_stronger_penalty() {
    let reading = |regularization: f64, cross_entropy: f64| regularization::RegularizationReading {
        regularization,
        cross_entropy,
    };

    // An interior minimum wins.
    assert_eq!(
        regularization::winner(&[reading(0.1, 3.0), reading(1.0, 1.0), reading(10.0, 2.0)]),
        1
    );
    // A strictly improving curve ends at the last candidate.
    assert_eq!(
        regularization::winner(&[reading(0.1, 3.0), reading(1.0, 2.0), reading(10.0, 1.0)]),
        2
    );
    // An exact tie prefers the stronger penalty.
    assert_eq!(
        regularization::winner(&[reading(0.1, 1.0), reading(1.0, 2.0), reading(10.0, 1.0)]),
        2
    );
}

#[test]
fn fit_selects_regularization_and_records_the_curve() {
    let corpus = soft_corpus();

    let fitted = fit(corpus.training(), config(), &NoProgress).expect("the soft corpus fits");

    let curve = &fitted.evidence.selection;
    assert_eq!(curve.len(), regularization::CANDIDATES.len());
    assert!(
        curve
            .array_windows::<2>()
            .all(|[lhs, rhs]| lhs.regularization < rhs.regularization)
    );

    let winner = regularization::winner(curve);
    assert_eq!(fitted.evidence.regularization, curve[winner].regularization);
    // The winner's reading and the reported raw metric are the same reduction
    // over the same logits, so the equality is exact.
    assert_eq!(
        fitted.evidence.raw_cross_entropy,
        curve[winner].cross_entropy
    );

    let again = fit(corpus.training(), config(), &NoProgress).expect("the refit is deterministic");
    assert_eq!(
        again.evidence.regularization,
        fitted.evidence.regularization
    );
    assert_eq!(again.evidence.selection, fitted.evidence.selection);
}

#[test]
fn exhausted_outer_iteration_budget_is_an_error() {
    let corpus = soft_corpus();
    let error = fit(
        corpus.training(),
        FitConfig {
            solver: SolverConfig {
                maximum_outer_iterations: NonZeroU64::new(1).expect("one is nonzero"),
                ..
            },
            ..config()
        },
        &NoProgress,
    )
    .expect_err("one outer iteration cannot converge");

    assert_matches!(error, FitError::Solver(SolverFailure::OuterIterationBudget));
}

#[test]
fn configuration_violations_are_named() {
    let corpus = mixed_corpus();

    let error = fit(
        corpus.training(),
        FitConfig {
            folds: 1,
            ..config()
        },
        &NoProgress,
    )
    .expect_err("one fold cannot hold anything out");
    assert_matches!(error, FitError::FoldCount { folds: 1 });

    let error = fit(
        corpus.training(),
        FitConfig {
            solver: SolverConfig {
                radius_minimum: d_positive!(2.0),
                radius_maximum: d_positive!(1.0),
                ..
            },
            ..config()
        },
        &NoProgress,
    )
    .expect_err("the radius ordering is violated");
    assert_matches!(
        error,
        FitError::Config(SolverConfigError::RadiusDomain { .. })
    );
}

/// Records the fold announcements and completions of one fit.
#[derive(Debug, Default)]
struct RecordingProgress {
    announced: Mutex<Vec<usize>>,
    completed: Mutex<Vec<usize>>,
}

impl RecordingProgress {
    fn announced(&self) -> Vec<usize> {
        self.announced
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone()
    }

    /// The completed folds, ascending: the pool finishes them in its own order.
    fn completed(&self) -> Vec<usize> {
        let mut folds = self
            .completed
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone();
        folds.sort_unstable();

        folds
    }
}

impl Progress for RecordingProgress {
    /// The fixture watches folds, so nothing crosses into owning machinery.
    type Detached = NoProgress;

    fn detach(&self) -> NoProgress {
        NoProgress
    }

    fn classifier_started(&self, folds: usize) {
        self.announced
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push(folds);
    }

    fn classifier_fold_completed(&self, fold: usize) {
        self.completed
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push(fold);
    }
}

#[test]
fn every_cross_validation_fold_reports_once() {
    let corpus = soft_corpus();
    let progress = RecordingProgress::default();

    fit(
        corpus.training(),
        FitConfig {
            folds: 3,
            ..config()
        },
        &progress,
    )
    .expect("the separable corpus fits");

    // Four models are fitted; the fourth holds nothing out and is the
    // deployment model, not a fold, so the counter's ceiling is the
    // announced three.
    assert_eq!(progress.announced(), [3]);
    assert_eq!(progress.completed(), [0, 1, 2]);
}

#[test]
fn a_fit_that_never_converges_completes_no_fold() {
    let corpus = soft_corpus();
    let progress = RecordingProgress::default();

    fit(
        corpus.training(),
        FitConfig {
            solver: SolverConfig {
                maximum_outer_iterations: NonZeroU64::new(1).expect("one is nonzero"),
                ..
            },
            ..config()
        },
        &progress,
    )
    .expect_err("one outer iteration cannot converge");

    // The announcement is the workload, not a promise it will land: a
    // model that failed has not completed, so the bar stays empty
    // rather than filling as the failures arrive.
    assert_eq!(progress.announced(), [2]);
    assert_eq!(progress.completed(), [0_usize; 0]);
}
