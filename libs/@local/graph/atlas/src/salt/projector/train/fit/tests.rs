//! Certificates for the training run.
//!
//! End-to-end convergence, the phase boundary's radius policy, the lens schedule, and the refresh
//! telemetry.
//!
//! The corpus is two four-node semantic clusters whose representations share a cluster pattern, so
//! the model can learn the separation the semantic edges describe. Landmarks on one row per
//! cluster keep the frame from collapsing or drifting.

#![expect(
    clippy::float_cmp,
    reason = "structurally-zero displacements and frozen radii are bit-exact contracts"
)]

use core::assert_matches;
use std::sync::{LazyLock, Mutex};

use burn::module::AutodiffModule as _;
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    FitOutcome, FrozenRadius, Model, TargetRefusalCause, TrainError, TrainOptions, TrainerInputs,
    TrainingSchedule, fit, fit_from_boundary, fit_to_boundary,
    fixture::{
        Corpus, HALF, RELATION, ROWS, TargetDraws, corpus_with, instance, options, proximal_policy,
        proximal_verdict, rng, schedule, split_digest, target_corpus, target_draws, target_inputs,
        target_options,
    },
    objective::{SplitPopulation, TargetOptions},
    session,
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::{Device, PhysicalDevice, Training},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{
        FinitePointField, NonNegative, Positive, Vec2, d_non_negative, d_positive, non_negative,
        nz, open_unit_fraction, positive, positive_unit_fraction, unit_fraction,
    },
    progress::{NoProgress, Progress},
    salt::{
        policy::ClassProbabilities,
        projector::{
            artifact,
            gauge::{DuplicateClassId, GaugeOrdinal, GaugeRefusal},
            loss::{Penalty, UnitLaw},
            model::{Architecture, Projector},
            scale::frozen::{FrozenRuler, RulerParameters},
            train::{Coefficients, refresh, step::LossBreakdown},
            verdict::{
                ResolvedVerdict,
                calibrate::{
                    ProximalCalibration, TypeCalibration,
                    stability::{StabilityBound, StabilityCertificate},
                },
            },
        },
        relation::{RelationPolicy, attraction::AttractionOptions},
    },
};

static DEVICE: LazyLock<PhysicalDevice> = LazyLock::new(|| Device::Cpu.pin(0).resolve());

impl<N: Id> FitOutcome<N, Training> {
    /// Unwraps a completed run. The refusal fixtures assert on the refusal arm directly.
    #[track_caller]
    fn trained(self) -> Model<N, Training> {
        match self {
            Self::Trained(fitted) => fitted,
            Self::TargetRefused(refusal) => panic!("the run refused: {refusal:?}"),
        }
    }
}

/// A vacuous two-cluster corpus with no relation evidence at all.
fn semantic_corpus() -> Corpus {
    corpus_with(&[], Vec::new(), Vec::new(), AttractionOptions::default())
}

/// A boundary corpus carrying one Proximal relation that spans the clusters.
fn proximal_corpus(verdicts: Vec<ResolvedVerdict>) -> Corpus {
    corpus_with(
        &[proximal_policy(RELATION)],
        vec![
            instance(0, RELATION, 0, 4),
            instance(1, RELATION, 1, 5),
            instance(2, RELATION, 2, 6),
        ],
        verdicts,
        AttractionOptions::default(),
    )
}

fn architecture() -> Architecture {
    Architecture {
        width: nz!(8),
        residual_blocks: nz!(1),
        representation_dimensions: nz!(PROJECTOR_DIMENSIONS),
        role_dimensions: nz!(4),
        condition_dimensions: nz!(1),
    }
}

fn model() -> Projector<Training> {
    Projector::new(architecture(), &*DEVICE, rng(7))
}

/// Forwards the trained corpus at a step.
fn project(
    trained: &Projector<Training>,
    corpus: &Corpus,
    eta: NonNegative,
) -> Box<FinitePointField<NodeRowId>> {
    refresh::forward(
        &trained.valid(),
        corpus.inputs().columns,
        eta,
        nz!(ROWS),
        &*DEVICE,
    )
    .expect("the trained fixture model is finite")
}

/// Mean pairwise distance over the given row pairs.
fn mean_distance<N>(
    layout: &FinitePointField<N>,
    pairs: impl Iterator<Item = (usize, usize)>,
) -> f32
where
    N: Id,
{
    let layout = layout.as_slice();
    let mut total = 0.0;
    let mut count = 0.0;
    for (one, other) in pairs {
        total += layout[N::from_usize(one)]
            .distance(layout[N::from_usize(other)])
            .get();
        count += 1.0;
    }
    total / count
}

/// Probed at N=25 and N=300, seeds 11 and 23, with the landmark coefficient zeroed (the corpus's
/// only nonzero pinning force here - `anchor` is already zero in `options()` and this fixture
/// supplies no anchors): separation survives at every point (within ~0.0003-0.012, between ~29-96,
/// both seeds), so the semantic gradient itself drives the separation this test names and measures.
#[test]
fn training_separates_the_semantic_clusters() {
    let corpus = semantic_corpus();
    // Boundary at the end: a pure semantic run records no boundary.
    let options = options(schedule(nz!(25), 25, nz!(10)));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(11),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();

    assert_eq!(fitted.evidence.losses.len(), 25);
    assert!(fitted.evidence.boundary.is_none());

    let layout = project(&fitted.projector, &corpus, non_negative!(0.0));
    let within = mean_distance(
        &layout,
        (0..HALF)
            .flat_map(|one| ((one + 1)..HALF).map(move |other| (one, other)))
            .flat_map(|(one, other)| [(one, other), (one + HALF, other + HALF)]),
    );
    let between = mean_distance(
        &layout,
        (0..HALF).flat_map(|one| (HALF..ROWS).map(move |other| (one, other))),
    );
    assert!(
        within < between,
        "clusters should separate: within {within} against between {between}"
    );
}

#[test]
fn landmark_support_keeps_the_frame() {
    let corpus = semantic_corpus();
    let mut options = options(schedule(nz!(25), 25, nz!(10)));
    // A dominant landmark coefficient pins the anchored rows.
    options.coefficients = Coefficients::new(
        Positive::ONE,
        non_negative!(0.5),
        non_negative!(0.5),
        NonNegative::ONE,
        NonNegative::ZERO,
        non_negative!(8.0),
    );
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(11),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();

    let layout = project(&fitted.projector, &corpus, non_negative!(0.0));
    for anchor in &corpus.landmarks {
        let distance = layout.as_slice()[anchor.row].distance(anchor.target);
        assert!(
            distance < anchor.radius,
            "row {} should hold near its landmark: distance {distance}",
            anchor.row.as_u64()
        );
    }
}

/// A ten-step run certifies the mechanism `training_separates_the_semantic_clusters` measures at
/// convergence: the semantic gradient already pulls cluster mates closer well short of the full
/// schedule that compounds the effect into a separated layout. (One optimizer step is not enough
/// for a stable direction: Adam's first update is close to the coordinatewise sign of the gradient,
/// so a single step can move an individual row either way even though the mean cluster displacement
/// already improves. Across ten steps the true gradient direction dominates.)
#[test]
fn few_steps_semantic_gradient_pulls_cluster_mates_together() {
    let corpus = semantic_corpus();
    let before = project(&model(), &corpus, non_negative!(0.0));
    let mut options = options(schedule(nz!(10), 10, nz!(2)));
    // The default fixture carries other non-zero coefficients (both repulsion terms, the landmark
    // term, and the evidence-less relation term). Zeroing every force but the semantic one isolates
    // the mechanism the certificate names. Rows in one cluster share almost the same input
    // representation, so the shared network weights let any other active force move cluster mates
    // in a correlated way, and that confound must be off for the certificate to test what it names.
    options.coefficients = Coefficients::new(
        Positive::ONE,
        NonNegative::ZERO,
        NonNegative::ZERO,
        NonNegative::ZERO,
        NonNegative::ZERO,
        NonNegative::ZERO,
    );
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(11),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();
    let after = project(&fitted.projector, &corpus, non_negative!(0.0));

    let within_pairs = || {
        (0..HALF)
            .flat_map(|one| ((one + 1)..HALF).map(move |other| (one, other)))
            .flat_map(|(one, other)| [(one, other), (one + HALF, other + HALF)])
    };
    let before_distance = mean_distance(&before, within_pairs());
    let after_distance = mean_distance(&after, within_pairs());
    assert!(
        after_distance < before_distance,
        "a short semantic run should pull cluster mates closer: before {before_distance} after \
         {after_distance}"
    );
}

/// A ten-step run under a dominant landmark coefficient certifies the mechanism
/// `landmark_support_keeps_the_frame` measures at convergence: the force already points each
/// anchored row toward its target well short of the full run. (One optimizer step is not enough:
/// Adam's first update is close to the coordinatewise sign of the gradient rather than its true
/// direction, so a single step can send an anchored row away from its target even under a dominant
/// coefficient. Across ten steps the true gradient direction dominates.)
#[test]
fn few_steps_landmark_force_points_anchors_at_their_targets() {
    let corpus = semantic_corpus();
    let before = project(&model(), &corpus, non_negative!(0.0));
    let mut options = options(schedule(nz!(10), 10, nz!(2)));
    // A dominant landmark coefficient pins the anchored rows. Neither repulsion term aims at a
    // fixed target point, so zeroing them keeps their sampling noise from swinging the one row this
    // certificate reads. The relation term has no evidence in this corpus and goes to zero with
    // them. The semantic term's type admits no zero, so the 8:1 landmark dominance carries the
    // isolation.
    options.coefficients = Coefficients::new(
        Positive::ONE,
        NonNegative::ZERO,
        NonNegative::ZERO,
        NonNegative::ZERO,
        NonNegative::ZERO,
        non_negative!(8.0),
    );
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(11),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();
    let after = project(&fitted.projector, &corpus, non_negative!(0.0));

    let before = before.as_slice();
    let after = after.as_slice();
    for anchor in &corpus.landmarks {
        let row = anchor.row;
        // The step's direction, not its magnitude: an Adam step can overshoot
        // a nearby target in one move, but the force it took the step under
        // must still point the row toward its landmark.
        let movement = after[row] - before[row];
        let toward = anchor.target - before[row];
        assert!(
            movement.dot(toward) > 0.0,
            "row {} should move toward its landmark over the run: before {:?} after {:?} target \
             {:?}",
            anchor.row.as_u64(),
            before[row],
            after[row],
            anchor.target,
        );
    }
}

#[test]
fn equal_seeds_train_equal_frames() {
    let corpus = semantic_corpus();
    let options = options(schedule(nz!(24), 24, nz!(8)));
    let one = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(13),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();
    let two = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(13),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();

    assert_eq!(one.evidence.losses, two.evidence.losses);
    assert_eq!(
        project(&one.projector, &corpus, non_negative!(0.0)),
        project(&two.projector, &corpus, non_negative!(0.0)),
        "equal seeds should train bit-equal frames on the deterministic backend"
    );
}

#[test]
fn boundary_freezes_a_measured_radius_and_opens_the_ladder() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(nz!(12), 6, nz!(4)));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the boundary fixture trains")
    .trained();

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.step, 6);
    let FrozenRadius::Measured { radius } = boundary.radius else {
        panic!("the boundary freezes a measured radius");
    };
    assert!(radius.get() > 0.0);
    assert_eq!(boundary.calibration.radius(), Some(radius));

    let entry = &boundary.calibration.types()[0];
    assert_eq!(entry.relation, OntologyRowId::new(RELATION));
    assert_eq!(entry.pairs, 3);
    assert!(entry.mass > d_non_negative!(0.0));
    assert!(entry.quantiles.is_some());

    // Phase A is semantic-only; the ladder's zero step stays so; and
    // every positive step exerts relation force (the Proximal energy
    // is strictly positive).
    let losses = &fitted.evidence.losses;
    assert!(losses[..6].iter().all(|loss| loss.relation == 0.0));
    assert_eq!(losses[6].relation, 0.0, "the ladder opens at the zero step");
    assert!(losses[7].relation > 0.0, "the half step pulls");
    assert!(losses[8].relation > 0.0, "the full step pulls");

    // The evidence records the relation-active nodes the run measured.
    assert!(fitted.evidence.budget.overall().nodes() > 0);

    // Ticks at the cadence steps and the boundary.
    let ticks: Vec<usize> = fitted
        .evidence
        .telemetry
        .iter()
        .map(|tick| tick.step)
        .collect();
    assert_eq!(ticks, [0, 4, 6, 8]);

    // The certificate rides the calibration as an evaluation of the same freeze population.
    let certificate = boundary
        .calibration
        .stability()
        .expect("a measured boundary carries its evaluated certificate");
    assert_eq!(certificate.quantile.get(), 0.25);
    assert!(certificate.effective_support.get() > 0.0);
    assert_eq!(certificate.pairs, 3);
    assert_eq!(
        certificate.pass,
        certificate.epsilon_zero.get() <= certificate.quantile.get()
            && certificate.gap.get() <= certificate.tau.get()
    );

    // The drift report reads at every scale-bearing tick: the boundary tick and the ones
    // after it. The first entry is the freeze-time reading of the freeze frame itself, so it
    // sits at or above the radius fraction, and every reading is a mass share.
    let fraction_steps: Vec<usize> = fitted
        .evidence
        .fractions
        .iter()
        .map(|reading| reading.step)
        .collect();
    assert_eq!(fraction_steps, [6, 8]);
    assert!(
        fitted
            .evidence
            .fractions
            .iter()
            .all(|reading| (0.0..=1.0).contains(&reading.fraction.get()))
    );
    assert!(fitted.evidence.fractions[0].fraction >= d_non_negative!(0.25));
}

#[test]
fn missing_reviewed_radius_names_the_fix() {
    let corpus = proximal_corpus(Vec::new());
    let options = options(schedule(nz!(12), 6, nz!(4)));
    let error = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect_err("proximal force without reviews cannot freeze a radius");

    assert_eq!(error, TrainError::MissingProximalReviews);
    let message = error.to_string();
    assert!(message.contains("confirm Proximal types"));
}

#[test]
fn forceless_corpus_trains_vacuously() {
    let corpus = semantic_corpus();
    let options = options(schedule(nz!(9), 3, nz!(4)));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(19),
        &*DEVICE,
        &NoProgress,
    )
    .expect("a forceless corpus trains vacuously")
    .trained();

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.radius, FrozenRadius::Vacuous);
    assert_eq!(boundary.calibration.radius(), None);
    assert!(boundary.calibration.types().is_empty());
    assert_eq!(boundary.calibration.stability(), None);
    assert!(
        fitted.evidence.fractions.is_empty(),
        "a vacuous run has no radius to drift against"
    );
    assert!(
        fitted
            .evidence
            .losses
            .iter()
            .all(|loss| loss.relation == 0.0),
        "a vacuous run never exerts relation force"
    );
}

#[test]
fn vacuous_run_trains_a_flat_ladder() {
    let corpus = semantic_corpus();
    // The ladder opens at step 3, but a forceless corpus pins the
    // zero step through it: the condition weights never receive
    // gradient, so every step projects the identical map.
    let options = options(schedule(nz!(9), 3, nz!(4)));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(19),
        &*DEVICE,
        &NoProgress,
    )
    .expect("a forceless corpus trains vacuously")
    .trained();

    let low = project(&fitted.projector, &corpus, non_negative!(0.0));
    assert_eq!(
        low,
        project(&fitted.projector, &corpus, non_negative!(1.0)),
        "the lens extremes should project bit-identical maps"
    );
    assert_eq!(
        low,
        project(&fitted.projector, &corpus, non_negative!(0.5)),
        "the middle step should project the same map as the extremes"
    );
    assert!(
        fitted.evidence.telemetry.iter().all(|tick| tick
            .displacement
            .overall()
            .moments()
            .maximum()
            == 0.0),
        "every tick should measure a zero displacement field"
    );
}

#[test]
fn measured_radius_requires_an_opening_segment() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let error = fit(
        model(),
        &corpus.inputs(),
        &options(schedule(nz!(8), 0, nz!(4))),
        &mut rng(23),
        &*DEVICE,
        &NoProgress,
    )
    .expect_err("a boundary at step zero cannot measure a radius");
    assert_eq!(error, TrainError::UnbaselinedRadius);
}

#[test]
fn coincident_without_proximal_force_refuses() {
    let coincident_policy = RelationPolicy {
        relation: OntologyRowId::new(RELATION),
        attraction: ClassProbabilities {
            coincident: unit_fraction!(1.0),
            proximal: unit_fraction!(0.0),
        },
        selected: ClassProbabilities {
            coincident: unit_fraction!(1.0),
            proximal: unit_fraction!(0.0),
        },
        applicability: unit_fraction!(1.0),
        strength: NonNegative::ONE,
        _pad: [0; 4],
    };
    let corpus = corpus_with(
        &[coincident_policy],
        vec![instance(0, RELATION, 0, 4), instance(1, RELATION, 1, 5)],
        Vec::new(),
        AttractionOptions::new(non_negative!(2.0), non_negative!(0.0)),
    );
    let error = fit(
        model(),
        &corpus.inputs(),
        &options(schedule(nz!(8), 4, nz!(4))),
        &mut rng(23),
        &*DEVICE,
        &NoProgress,
    )
    .expect_err("coincident force alone cannot set the Proximal radius");
    assert_eq!(error, TrainError::CoincidentWithoutProximal);
}

#[test]
fn phase_a_ticks_measure_a_frozen_lens() {
    // Through the opening segment the FiLM condition weight is
    // zero-initialized and receives an exactly-zero gradient at the
    // zero step, so Adam never moves it and the two lens extremes
    // produce bit-identical frames: the measured displacement is
    // exactly zero, not approximately.
    let corpus = semantic_corpus();
    let options = options(schedule(nz!(4), 4, nz!(2)));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(29),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the semantic fixture trains")
    .trained();

    assert_eq!(fitted.evidence.telemetry.len(), 2);
    for tick in &fitted.evidence.telemetry {
        let moments = tick.displacement.overall().moments();
        assert_eq!(moments.count(), ROWS as u64);
        assert_eq!(
            moments.maximum(),
            0.0,
            "the lens is provably inert through phase A"
        );
    }
}

#[test]
fn non_finite_representation_fails_the_first_tick() {
    let mut corpus = semantic_corpus();
    corpus.storage.as_array_mut()[3 * PROJECTOR_DIMENSIONS + 9] = f32::INFINITY;
    let options = options(schedule(nz!(4), 4, nz!(2)));
    let error = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(31),
        &*DEVICE,
        &NoProgress,
    )
    .expect_err("an infinite representation diverges the forward pass");

    let TrainError::Refresh(refresh::RefreshError::Diverged { row, .. }) = error else {
        panic!("divergence surfaces as a refresh error, got {error:?}");
    };
    assert_eq!(row.as_u64(), 3, "the error names the diverged corpus row");
}

#[test]
fn chunked_forwards_match_the_whole_corpus_pass() {
    let corpus = semantic_corpus();
    let projector = model();
    let inference = projector.valid();
    let chunked = refresh::forward(
        &inference,
        corpus.inputs().columns,
        non_negative!(1.0),
        nz!(3),
        &*DEVICE,
    )
    .expect("the fixture model is finite");
    let whole = refresh::forward(
        &inference,
        corpus.inputs().columns,
        non_negative!(1.0),
        nz!(ROWS),
        &*DEVICE,
    )
    .expect("the fixture model is finite");
    assert_eq!(
        chunked, whole,
        "rows project independently, so slicing cannot change the frame"
    );
}

#[test]
fn schedule_validates_its_domain() {
    // Out-of-range rates are unconstructible: the initial rate as a `PositiveUnitFraction`, the
    // minimum as a `UnitFraction`. The residual domain here is the boundary and the rate ordering.
    let valid = TrainingSchedule::new(
        nz!(10),
        5,
        nz!(2),
        positive_unit_fraction!(0.05),
        unit_fraction!(0.001),
    );
    assert!(valid.is_some());
    assert!(
        TrainingSchedule::new(
            nz!(10),
            11,
            nz!(2),
            positive_unit_fraction!(0.05),
            unit_fraction!(0.001)
        )
        .is_none(),
        "the boundary lies within the run"
    );
    assert!(
        TrainingSchedule::new(
            nz!(10),
            5,
            nz!(2),
            positive_unit_fraction!(0.05),
            unit_fraction!(0.0)
        )
        .is_some(),
        "a zero minimum decays the rate to nothing and is lawful"
    );
    assert!(
        TrainingSchedule::new(
            nz!(10),
            5,
            nz!(2),
            positive_unit_fraction!(0.05),
            unit_fraction!(0.1)
        )
        .is_none(),
        "the minimum does not exceed the initial rate"
    );
}

#[test]
fn checkpointed_resume_matches_the_straight_run() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(nz!(12), 6, nz!(4)));

    let straight = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the boundary fixture trains")
    .trained();

    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &options,
        &mut stream,
        &*DEVICE,
        &NoProgress,
    )
    .expect("the opening segment trains");
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");
    drop((state, stream));

    let (reopened, mut stream) =
        artifact::open_resume::<NodeRowId, Training>(bytes.as_slice(), architecture(), &*DEVICE)
            .expect("the resume checkpoint opens");
    let resumed = fit_from_boundary(
        reopened,
        &corpus.inputs(),
        &options,
        &mut stream,
        &*DEVICE,
        &NoProgress,
    )
    .expect("the resumed ladder trains")
    .trained();

    assert_eq!(
        resumed.evidence.losses.as_slice(),
        &straight.evidence.losses[6..],
        "the resumed ladder should replay the straight run's ladder steps exactly"
    );
    assert_eq!(
        resumed.evidence.boundary, straight.evidence.boundary,
        "the resumed boundary should freeze the bit-equal radius"
    );
    assert_eq!(
        project(&resumed.projector, &corpus, non_negative!(0.0)),
        project(&straight.projector, &corpus, non_negative!(0.0)),
    );
    assert_eq!(
        project(&resumed.projector, &corpus, non_negative!(1.0)),
        project(&straight.projector, &corpus, non_negative!(1.0)),
        "the straight and resumed runs should train bit-equal frames"
    );
}

#[test]
fn forked_ladders_share_the_frozen_radius() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let opening = options(schedule(nz!(12), 6, nz!(4)));

    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &opening,
        &mut stream,
        &*DEVICE,
        &NoProgress,
    )
    .expect("the opening segment trains");
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");

    let fork = |relation: NonNegative| {
        let (state, mut stream) = artifact::open_resume::<NodeRowId, Training>(
            bytes.as_slice(),
            architecture(),
            &*DEVICE,
        )
        .expect("the resume checkpoint opens");
        let mut cell = opening;
        cell.coefficients = Coefficients::new(
            Positive::ONE,
            non_negative!(0.5),
            non_negative!(0.5),
            relation,
            NonNegative::ZERO,
            NonNegative::ONE,
        );
        fit_from_boundary(
            state,
            &corpus.inputs(),
            &cell,
            &mut stream,
            &*DEVICE,
            &NoProgress,
        )
        .expect("the forked ladder trains")
        .trained()
    };

    let one = fork(non_negative!(1.0));
    let two = fork(non_negative!(4.0));

    assert_eq!(
        one.evidence.boundary, two.evidence.boundary,
        "fork cells should freeze the bit-equal radius from the shared opening"
    );
    assert_ne!(
        project(&one.projector, &corpus, non_negative!(1.0)),
        project(&two.projector, &corpus, non_negative!(1.0)),
        "the forked relation coefficient should change the trained ladder"
    );
}

#[test]
fn resumed_ladder_rejects_a_changed_schedule() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let opening = options(schedule(nz!(12), 6, nz!(4)));
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &opening,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the opening segment trains");

    let changed = options(schedule(nz!(16), 6, nz!(4)));
    let error = fit_from_boundary(
        state,
        &corpus.inputs(),
        &changed,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect_err("a changed schedule should be rejected");
    assert_eq!(
        error,
        TrainError::ScheduleChanged {
            opening: schedule(nz!(12), 6, nz!(4)),
            resumed: schedule(nz!(16), 6, nz!(4)),
        }
    );
}

/// Records every reported training step, and every snapshot of a stated appetite.
#[derive(Debug, Default)]
struct RecordingProgress {
    appetite: usize,
    steps: Mutex<Vec<(usize, usize, LossBreakdown)>>,
    snapshots: Mutex<Vec<(Vec<Vec2>, usize)>>,
}

impl RecordingProgress {
    /// An observer that watches the placement's rows as well as its losses.
    fn watching(appetite: usize) -> Self {
        Self {
            appetite,
            ..Self::default()
        }
    }

    fn steps(&self) -> Vec<(usize, usize, LossBreakdown)> {
        self.steps
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone()
    }

    fn snapshots(&self) -> Vec<(Vec<Vec2>, usize)> {
        self.snapshots
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .clone()
    }
}

impl Progress for RecordingProgress {
    /// The fixture watches training steps, so nothing crosses into owning machinery.
    type Detached = NoProgress;

    fn detach(&self) -> NoProgress {
        NoProgress
    }

    fn projector_step(&self, step: usize, steps: usize, loss: &LossBreakdown) {
        self.steps
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push((step, steps, *loss));
    }

    fn projector_sample_size(&self) -> usize {
        self.appetite
    }

    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {
        self.snapshots
            .lock()
            .expect("the fixture mutex should not be poisoned")
            .push((positions.to_vec(), landmarks));
    }
}

#[test]
fn every_training_step_reports_the_loss_it_records() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(nz!(12), 6, nz!(4)));
    let progress = RecordingProgress::default();

    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &*DEVICE,
        &progress,
    )
    .expect("the boundary fixture trains")
    .trained();

    let reported = progress.steps();
    // The observation stream is the evidence, live: same values, same
    // order, one per step, each stated against the whole schedule.
    assert_eq!(
        reported.iter().map(|&(step, ..)| step).collect::<Vec<_>>(),
        (0..12).collect::<Vec<_>>(),
    );
    assert!(reported.iter().all(|&(_, steps, _)| steps == 12));
    assert_eq!(
        reported
            .iter()
            .map(|&(.., loss)| loss)
            .collect::<Vec<_>>()
            .as_slice(),
        fitted.evidence.losses.as_slice(),
    );
}

#[test]
fn phases_report_against_the_whole_schedule() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(nz!(12), 6, nz!(4)));

    let forked = RecordingProgress::default();
    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &options,
        &mut stream,
        &*DEVICE,
        &forked,
    )
    .expect("the opening segment trains");
    fit_from_boundary(
        state,
        &corpus.inputs(),
        &options,
        &mut stream,
        &*DEVICE,
        &forked,
    )
    .expect("the resumed ladder trains")
    .trained();

    // A phase reports against the whole schedule, not against its own
    // range: the two segments concatenate into one 0..12 stream rather
    // than each restarting the count at the boundary. Stated against
    // the schedule rather than against a straight run, which composes
    // these same two calls and would agree with any shared defect.
    let reported = forked.steps();
    assert_eq!(
        reported.iter().map(|&(step, ..)| step).collect::<Vec<_>>(),
        (0..12).collect::<Vec<_>>(),
    );
    assert!(reported.iter().all(|&(_, steps, _)| steps == 12));
}

#[test]
fn a_watching_observer_sees_the_placement_move_and_changes_nothing() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(nz!(12), 6, nz!(4)));

    let observer = RecordingProgress::watching(4);
    let watched = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &*DEVICE,
        &observer,
    )
    .expect("the boundary fixture trains")
    .trained();
    let unwatched = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the boundary fixture trains")
    .trained();

    // Each snapshot comes from the refresh's own frame, so exactly one exists per tick and the
    // telemetry counts the same ticks. Each snapshot reports the sample the observer requested,
    // with the corpus's two landmark rows first.
    let snapshots = observer.snapshots();
    assert_eq!(snapshots.len(), watched.evidence.telemetry.len());
    assert!(!snapshots.is_empty());
    assert!(
        snapshots
            .iter()
            .all(|&(ref positions, landmarks)| positions.len() == 4 && landmarks == 2)
    );

    // The sample consumes no randomness, so watching cannot move the
    // run: the two runs' losses are bit-equal, step for step.
    assert_eq!(watched.evidence.losses, unwatched.evidence.losses);

    // The placement moves under the observer's eye rather than
    // reporting one frozen frame over and over.
    let first = &snapshots.first().expect("a tick reported").0;
    let last = &snapshots.last().expect("a tick reported").0;
    assert_ne!(first, last);
}

/// Runs a closure under a warn-level subscriber and returns everything it logged.
fn captured_warnings(run: impl FnOnce()) -> String {
    #[derive(Clone, Default)]
    struct Capture(alloc::sync::Arc<Mutex<Vec<u8>>>);

    impl std::io::Write for Capture {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0
                .lock()
                .expect("the capture lock is never poisoned")
                .extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl<'writer> tracing_subscriber::fmt::MakeWriter<'writer> for Capture {
        type Writer = Self;

        fn make_writer(&'writer self) -> Self::Writer {
            self.clone()
        }
    }

    let capture = Capture::default();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .with_writer(capture.clone())
        .with_ansi(false)
        .finish();
    tracing::subscriber::with_default(subscriber, run);

    let bytes = capture
        .0
        .lock()
        .expect("the capture lock is never poisoned")
        .clone();
    String::from_utf8(bytes).expect("formatted log output is UTF-8")
}

/// A certificate literal whose decision is the given `pass`, dyadic throughout.
fn certificate(pass: bool) -> StabilityCertificate {
    StabilityCertificate {
        quantile: open_unit_fraction!(0.25),
        delta: open_unit_fraction!(0.05),
        kappa: d_positive!(1.0),
        temperature: d_positive!(0.5),
        tau: d_positive!(0.5),
        effective_support: d_positive!(4.0),
        pairs: 4,
        mass: d_non_negative!(2.0),
        epsilon_zero: d_positive!(0.5),
        gap: d_non_negative!(0.25),
        bound: StabilityBound::Unattainable,
        pass,
        type_effective_support: d_positive!(1.0),
    }
}

/// A calibration whose leave-one-out spread is exactly `spread` around a unit radius.
fn spread_calibration(spread: f32, pass: bool) -> ProximalCalibration {
    ProximalCalibration::fixture(
        Some(non_negative!(1.0)),
        vec![TypeCalibration {
            relation: OntologyRowId::new(5),
            pairs: 4,
            mass: d_non_negative!(2.0),
            quantiles: Some([non_negative!(1.0), non_negative!(2.0), non_negative!(3.0)]),
            radius_without: Some(
                NonNegative::new(1.0 + spread)
                    .expect("the fixture spread keeps the radius non-negative"),
            ),
        }],
        Some(certificate(pass)),
    )
}

#[test]
fn a_failing_certificate_warns_with_its_check_name() {
    let calibration = spread_calibration(0.25, false);
    let output =
        captured_warnings(|| session::warn_boundary_findings(&calibration, positive!(0.5)));

    assert!(output.contains("reviewed_mass_stability_bound"), "{output}");
    assert!(
        output.contains("fails its evaluated stability bound"),
        "{output}"
    );
    // The leave-one-type-out spread rides beside the warning.
    assert!(output.contains("leave_one_out_spread"), "{output}");
    // The tight spread crossed no spread warning.
    assert!(!output.contains("leave_one_out_radius_spread"), "{output}");
}

#[test]
fn a_spread_beyond_one_temperature_warns_with_its_check_name() {
    let calibration = spread_calibration(4.0, true);
    let output =
        captured_warnings(|| session::warn_boundary_findings(&calibration, positive!(0.5)));

    assert!(output.contains("leave_one_out_radius_spread"), "{output}");
    assert!(
        output.contains("more than one transition width"),
        "{output}"
    );
    assert!(
        !output.contains("reviewed_mass_stability_bound"),
        "{output}"
    );
}

#[test]
fn a_passing_certificate_with_a_tight_spread_warns_nothing() {
    let calibration = spread_calibration(0.25, true);
    let output =
        captured_warnings(|| session::warn_boundary_findings(&calibration, positive!(0.5)));

    assert_eq!(output, "");
}

/// The field-derived constants the identity declares re-derive from the recorded boundary
/// field, and the enforcement record covers exactly the ladder's interval. The
/// neighbour-dependent constants ride the ruler tables, whose re-freeze carries its own
/// certificate below.
#[test]
fn the_identity_constants_re_derive_from_the_recorded_boundary_field() {
    let corpus = target_corpus();
    let draws = target_draws();
    let options = options(schedule(nz!(12), 6, nz!(4)));

    let fitted = fit(
        model(),
        &target_inputs(&corpus, &draws, target_options(1.0)),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the target fixture trains")
    .trained();

    let target = fitted
        .evidence
        .target
        .as_ref()
        .expect("a target-configured ladder records its evidence");
    let identity = target.identity;
    assert_eq!(identity.boundary_step, 6);
    assert_eq!(target.unit_law, UnitLaw::PerLinkInstance);
    assert_eq!(target.split_digest, split_digest());

    let field: &IdSlice<NodeRowId, Vec2> = &target.boundary_field;
    assert_eq!(field.len(), ROWS);

    // Every field-derived constant re-derives from the recorded field, bit for bit. The
    // recorded field is finite by construction, so the reading needs no scan.
    let spread = target.boundary_field.rms_spread();
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the re-derivation repeats the freeze's own narrowing"
    )]
    let narrowed = spread as f32;
    assert_eq!(identity.reference_spread.get(), narrowed);

    let anchors: IdVec<GaugeOrdinal, Vec2> =
        draws.gauge_rows.iter().map(|&row| field[row]).collect();
    // Finite with no scan: a gather from the proven-finite recorded field stays finite.
    let gauge_spread = FinitePointField::new_unchecked(&anchors).rms_spread();
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the re-derivation repeats the freeze's own narrowing"
    )]
    let gauge_narrowed = gauge_spread as f32;
    assert_eq!(identity.gauge_spread.get(), gauge_narrowed);

    assert_eq!(
        identity.radius.get(),
        identity.dimensionless_radius.get() * identity.reference_spread.get()
    );
    assert_eq!(
        identity.epsilon_abs.get(),
        identity.epsilon_rel.get() * identity.reference_spread.get()
    );

    // The estimand read at every ladder step, and the evidence at every post-boundary tick.
    assert_eq!(target.estimands.len(), 6);
    let evaluation_steps: Vec<usize> = target
        .evaluations
        .iter()
        .map(|evaluation| evaluation.step)
        .collect();
    assert_eq!(evaluation_steps, [6, 8]);

    // The record covers the ladder interval and its closing reading: the enforcement point
    // one past the last step index reads the returned model's field after the final update.
    assert_eq!(target.enforcement.opened_at, 6);
    assert_eq!(target.enforcement.last_application, Some(12));
    assert_eq!(target.row_maxima.len(), ROWS);

    // At the boundary step the zero field is the snapshot itself, so the common-mode fit
    // reads the exact identity scale and neither displacement nor saturation reads anything.
    let boundary = &target.evaluations[0];
    assert_eq!(boundary.zero_similarity.scale().get(), 1.0);
    let mut anchor_rows = 0;
    for stratum in &boundary.displacement {
        anchor_rows += stratum.anchors;
        assert_eq!(stratum.displacement.q95.get(), 0.0);
        assert_eq!(stratum.displacement.mean.get(), 0.0);
    }
    assert_eq!(anchor_rows, 4);
    let mut rows = 0;
    for stratum in &boundary.saturation {
        rows += stratum.rows;
        assert_eq!(stratum.saturated, 0);
    }
    assert_eq!(rows, ROWS as u64);
    assert!(boundary.scale.get() > 0.0);
    assert!(boundary.residual.is_finite());

    // The composite loss carries the activation-scaled contribution from the boundary on and
    // nothing before it.
    assert!(
        fitted.evidence.losses[..6]
            .iter()
            .all(|loss| loss.target == 0.0)
    );
    assert_eq!(fitted.evidence.losses[6].target, target.estimands[0]);
}

/// A live gauge fit refusal ends the run as the refused outcome: no activation candidate, no
/// target claim, and the whole run record - boundary and target records sealed in - rides the
/// refusal, cut at the last completed reading before the failed one.
#[test]
fn gauge_fit_refusal_keeps_the_recorded_evidence() {
    let corpus = target_corpus();
    let draws = target_draws();
    let options = options(schedule(nz!(12), 6, nz!(4)));
    let mut declared = target_options(1.0);
    // At the boundary step no relation gradient has flowed, the steps read bit-identical
    // coordinates, and the residual is exactly zero, so a bar below any real deformation
    // refuses the first fit after a post-boundary update.
    declared.residual_bar = Some(positive!(1e-12));

    let outcome = fit(
        model(),
        &target_inputs(&corpus, &draws, declared),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("a refusal is an outcome, and only a diverged run errors");
    let FitOutcome::TargetRefused(refusal) = outcome else {
        panic!("expected the target refusal, got a trained run");
    };

    assert_eq!(refusal.step, 7);
    assert_matches!(
        refusal.cause,
        TargetRefusalCause::Gauge(GaugeRefusal::ResidualAboveBar { .. })
    );

    // The run record rides the refusal whole. The boundary record entered it when the radius
    // freeze completed at step 6, the run's standing self-measurement is cut at the last
    // completed reading (losses through step 6, ticks at steps 0, 4, and 6 - the refusing
    // step ran none), and the refusing step's loss never computed.
    let record = refusal.evidence;
    let boundary = record
        .boundary
        .as_ref()
        .expect("the radius freeze completed at the boundary step");
    assert_eq!(boundary.step, 6);
    assert_matches!(boundary.radius, FrozenRadius::Measured { .. });
    assert_eq!(record.losses.len(), 7);
    assert_eq!(record.telemetry.len(), 3);

    // The phase sealed its accumulated record into the run record: the identity frozen at
    // the boundary and the boundary step's own measured readings survive, and the
    // enforcement interval reads through the refusing step's own application - every
    // completed optimizer update is covered with no closing application owed.
    let evidence = record
        .target
        .as_ref()
        .expect("the phase sealed its record into the refusal");
    assert_eq!(evidence.identity.boundary_step, 6);
    assert_eq!(evidence.split_digest, split_digest());
    assert_eq!(evidence.boundary_field.len(), ROWS);
    assert_eq!(evidence.tables.scales().len(), ROWS);
    assert!(evidence.tables.neighbours().rows() > 0);
    assert_eq!(evidence.enforcement.opened_at, 6);
    assert_eq!(evidence.enforcement.last_application, Some(7));
    assert_eq!(evidence.estimands.len(), 1);
    assert_eq!(evidence.evaluations.len(), 1);
    assert_eq!(evidence.evaluations[0].step, 6);
}

/// A refusal at a post-boundary tick step cuts between the tick's two readings.
///
/// The refresh telemetry precedes the target pass, so the refusing step's tick enters the
/// record, while the per-evaluation evidence follows the refusing fit and never records. The
/// schedule places the first fit after an optimizer update on a tick step - boundary 7,
/// interval 4, step 8 - and that one step therefore witnesses both sides of the cut.
#[test]
fn tick_step_refusal_records_telemetry_and_no_evaluation() {
    let corpus = target_corpus();
    let draws = target_draws();
    let options = options(schedule(nz!(12), 7, nz!(4)));
    let mut declared = target_options(1.0);
    // The same bar as the plain gauge fit refusal: exactly zero at the boundary step's fit,
    // above any real deformation at the first fit after an update.
    declared.residual_bar = Some(positive!(1e-12));

    let outcome = fit(
        model(),
        &target_inputs(&corpus, &draws, declared),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("a refusal is an outcome, and only a diverged run errors");
    let FitOutcome::TargetRefused(refusal) = outcome else {
        panic!("expected the target refusal, got a trained run");
    };

    assert_eq!(refusal.step, 8);
    assert_matches!(
        refusal.cause,
        TargetRefusalCause::Gauge(GaugeRefusal::ResidualAboveBar { .. })
    );

    // The refusing step is a tick step (8 % 4 == 0), and its telemetry entered the record
    // before the target pass refused. The loop records a step's loss after the pass, so the
    // refusing step's loss never pushed.
    let record = refusal.evidence;
    let ticks: Vec<usize> = record.telemetry.iter().map(|tick| tick.step).collect();
    assert_eq!(ticks, [0, 4, 7, 8]);
    assert_eq!(record.losses.len(), 8);

    // The enforcement interval reads through the refusing step's own application, while the
    // readings past the refusing fit never happened: no estimand and no evaluation at step 8.
    let evidence = record
        .target
        .as_ref()
        .expect("the phase sealed its record into the refusal");
    assert_eq!(evidence.enforcement.opened_at, 7);
    assert_eq!(evidence.enforcement.last_application, Some(8));
    assert_eq!(evidence.estimands.len(), 1);
    assert_eq!(evidence.evaluations.len(), 1);
    assert_eq!(evidence.evaluations[0].step, 7);
}

/// A boundary freeze refusal ends the run as the refused outcome before any target step runs.
/// The boundary record enters the run record the moment the radius freeze completes, before
/// the target freeze is attempted. The refusal therefore carries it beside the opening
/// segment's accumulated readings, and no target record exists because the phase never froze.
#[test]
fn boundary_freeze_refusal_carries_the_boundary_evidence() {
    let corpus = target_corpus();
    let draws = target_draws();
    let options = options(schedule(nz!(12), 6, nz!(4)));
    let mut declared = target_options(1.0);
    // A spread floor no healthy constellation reaches, so the gauge freeze refuses at the
    // boundary - a data-dependent refusal admission cannot see.
    declared.gauge_spread_factor = Some(positive!(1e6));

    let outcome = fit(
        model(),
        &target_inputs(&corpus, &draws, declared),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("a refusal is an outcome, and only a diverged run errors");
    let FitOutcome::TargetRefused(refusal) = outcome else {
        panic!("expected the target refusal, got a trained run");
    };

    assert_eq!(refusal.step, 6);
    assert_matches!(
        refusal.cause,
        TargetRefusalCause::Gauge(GaugeRefusal::SpreadBelowFloor { .. })
    );

    let record = refusal.evidence;
    let boundary = record
        .boundary
        .as_ref()
        .expect("the radius freeze completed before the refusal");
    assert_eq!(boundary.step, 6);
    assert_matches!(boundary.radius, FrozenRadius::Measured { .. });
    // The phase never froze, so no target record exists - absent structurally, never
    // dropped.
    assert!(record.target.is_none());
    // The opening segment's record as accumulated. Losses reach through step 5 and ticks
    // ran at steps 0 and 4 (the boundary step's own tick follows the boundary and never
    // ran); no drift reading exists, because the first belongs to that unrun tick.
    assert_eq!(record.losses.len(), 6);
    assert_eq!(record.telemetry.len(), 2);
    assert!(record.fractions.is_empty());
}

/// The frozen ruler re-freezes bit-identically from the recorded boundary field, and the
/// recorded tables equal the re-freeze's own - the reading no field alone determines, since
/// one `Z_K` admits many neighbour tables. The freeze is bit-deterministic from its inputs,
/// so the recorded trio suffices to reconstruct the exact ruler every reading divided by.
#[test]
fn the_ruler_re_freezes_from_the_recorded_boundary_field() {
    let corpus = target_corpus();
    let draws = target_draws();
    let options = options(schedule(nz!(12), 6, nz!(4)));
    let declared = target_options(1.0);

    let fitted = fit(
        model(),
        &target_inputs(&corpus, &draws, declared),
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the target fixture trains")
    .trained();

    let target = fitted
        .evidence
        .target
        .as_ref()
        .expect("a target-configured ladder records its evidence");
    let identity = target.identity;

    let ruler = FrozenRuler::freeze(
        &target.boundary_field,
        &corpus.knn.view(),
        RulerParameters {
            epsilon_rel: identity.epsilon_rel,
            scale_quantile: declared.scale_quantile,
            floor: None,
        },
    )
    .expect("the recorded boundary field re-freezes");

    assert_eq!(ruler.len(), ROWS);
    assert_eq!(ruler.reference_spread(), identity.reference_spread);
    assert_eq!(ruler.epsilon().get(), identity.epsilon_abs.get());
    assert_eq!(
        ruler.scales().as_raw(),
        target.tables.scales().as_raw(),
        "the recorded scale table should equal the re-freeze's own"
    );

    for row in 0..ruler.len() {
        let row = NodeRowId::from_usize(row);
        assert_eq!(
            target.tables.neighbours().row(row).as_raw(),
            ruler.frozen_set(row).as_raw(),
            "the recorded neighbour sets should equal the re-freeze's own"
        );
    }
    assert_eq!(
        target.tables.width(),
        ruler.frozen_set(NodeRowId::from_usize(0)).len()
    );
}

/// The activation is a value, not structure. A zero-activation run reads the identical first
/// estimand the live run reads while contributing nothing to the composite loss, and its
/// trained model is bit-independent of the penalty - the whole target path ran and added
/// exactly zero force.
///
/// The bit-equality claims presume per-process test isolation. burn-autodiff draws node ids
/// from a process-global counter, so an autodiff test running concurrently in the same
/// process can reorder the gradient map's accumulation and move these bits. The repository's
/// nextest profile isolates every test in its own process, and single-threaded `cargo test`
/// also holds.
#[test]
fn zero_activation_reads_the_estimand_and_adds_no_force() {
    let corpus = target_corpus();
    let draws = target_draws();

    let run = |activation: f32, penalty: Penalty| {
        let options = options(schedule(nz!(12), 6, nz!(4)));
        let mut declared = target_options(activation);
        declared.penalty = penalty;
        fit(
            model(),
            &target_inputs(&corpus, &draws, declared),
            &options,
            &mut rng(17),
            &*DEVICE,
            &NoProgress,
        )
        .expect("the target fixture trains")
        .trained()
    };

    let inert = run(0.0, Penalty::QuadraticHinge);
    let live = run(2.0, Penalty::QuadraticHinge);

    // Identical streams and an identical boundary model: the first reading agrees bit for
    // bit, and only the live run descends it.
    let inert_target = inert.evidence.target.as_ref().expect("evidence exists");
    let live_target = live.evidence.target.as_ref().expect("evidence exists");
    assert_eq!(inert_target.estimands[0], live_target.estimands[0]);
    assert!(inert_target.estimands.iter().any(|&reading| reading != 0.0));
    assert!(inert.evidence.losses.iter().all(|loss| loss.target == 0.0));
    assert_eq!(
        live.evidence.losses[6].target,
        2.0 * live_target.estimands[0]
    );

    // Absent against inert, made concrete: at zero activation the penalty's value cannot
    // reach the model, so swapping it changes the readings and not one trained bit.
    let swapped = run(0.0, Penalty::Identity);
    assert_ne!(
        inert
            .evidence
            .target
            .as_ref()
            .expect("evidence exists")
            .estimands,
        swapped
            .evidence
            .target
            .as_ref()
            .expect("evidence exists")
            .estimands,
        "the two penalties should read different estimands"
    );
    assert_eq!(
        project(&inert.projector, &corpus, non_negative!(0.0)),
        project(&swapped.projector, &corpus, non_negative!(0.0)),
        "zero activation should train the identical model under either penalty"
    );
    assert_eq!(
        project(&inert.projector, &corpus, non_negative!(1.0)),
        project(&swapped.projector, &corpus, non_negative!(1.0)),
    );
}

/// Every target misconfiguration refuses at admission, before the opening segment trains a step.
#[test]
fn every_target_misconfiguration_refuses_at_admission() {
    let draws = target_draws();

    let refusal = |inputs: &TrainerInputs<'_, NodeRowId, EdgeRowId>, options: &TrainOptions| {
        fit(
            model(),
            inputs,
            options,
            &mut rng(17),
            &*DEVICE,
            &NoProgress,
        )
        .expect_err("the configuration should refuse")
    };

    // A forceless corpus declares no unit population.
    let vacuous = semantic_corpus();
    let options = options(schedule(nz!(12), 6, nz!(4)));
    assert_eq!(
        refusal(
            &target_inputs(&vacuous, &draws, target_options(1.0)),
            &options
        ),
        TrainError::EmptyTargetPopulation,
    );

    let corpus = target_corpus();
    let inputs = target_inputs(&corpus, &draws, target_options(1.0));

    // A plan without relation-type draws can never draw a unit.
    let mut no_draws = options;
    no_draws.plan.relation_types = 0;
    assert_eq!(
        refusal(&inputs, &no_draws),
        TrainError::TargetWithoutUnitDraws,
    );

    // A schedule whose boundary equals the run length never freezes a reference.
    let mut unopened = options;
    unopened.schedule = schedule(nz!(12), 12, nz!(4));
    assert_matches!(refusal(&inputs, &unopened), TrainError::Ruler(_));

    // A canonical step outside the curriculum names itself.
    let off_schedule = TargetOptions {
        canonical_step: nz!(3),
        ..target_options(1.0)
    };
    assert_eq!(
        refusal(&target_inputs(&corpus, &draws, off_schedule), &options),
        TrainError::CanonicalStepOutOfSchedule { step: 3 },
    );

    // A hinge-dead penalty with a zero margin would leave distance equality forceless.
    let forceless = TargetOptions {
        margin: non_negative!(0.0),
        ..target_options(1.0)
    };
    assert_eq!(
        refusal(&target_inputs(&corpus, &draws, forceless), &options),
        TrainError::PenaltyWithoutForceAtEquality,
    );

    // A gauge too small to carry every evaluation's affine reading refuses up front.
    let undersized = TargetDraws {
        gauge_rows: [3, 7].map(NodeRowId::new).to_vec(),
        gauge_classes: [0, 1].map(DuplicateClassId::new).to_vec(),
        ..target_draws()
    };
    assert_matches!(
        refusal(
            &target_inputs(&corpus, &undersized, target_options(1.0)),
            &options
        ),
        TrainError::Gauge(_)
    );
}

/// Every split-population overlap refuses at admission, naming the pair and the shared row.
#[test]
fn every_split_population_overlap_refuses_at_admission() {
    let corpus = target_corpus();
    let options = options(schedule(nz!(12), 6, nz!(4)));

    let refusal = |inputs: &TrainerInputs<'_, NodeRowId, EdgeRowId>| {
        fit(
            model(),
            inputs,
            &options,
            &mut rng(17),
            &*DEVICE,
            &NoProgress,
        )
        .expect_err("the configuration should refuse")
    };

    // A gauge anchor on a force-bearing endpoint would let the optimizer own its own ruler.
    let bearing = TargetDraws {
        gauge_rows: [0, 3, 6, 7].map(NodeRowId::new).to_vec(),
        ..target_draws()
    };
    assert_eq!(
        refusal(&target_inputs(&corpus, &bearing, target_options(1.0))),
        TrainError::SplitPopulationsOverlap {
            first: SplitPopulation::MovementParticipants,
            second: SplitPopulation::GaugeAnchors,
            row: NodeRowId::new(0)
        },
    );

    // A held-out endpoint inside the gauge would fit the frame on the measured population.
    let measured = TargetDraws {
        held_out: vec![NodeRowId::new(3)],
        ..target_draws()
    };
    assert_eq!(
        refusal(&target_inputs(&corpus, &measured, target_options(1.0))),
        TrainError::SplitPopulationsOverlap {
            first: SplitPopulation::GaugeAnchors,
            second: SplitPopulation::HeldOutEndpoints,
            row: NodeRowId::new(3)
        },
    );

    // A matched control bearing force would certify collateral with a moving reference.
    let moving = TargetDraws {
        matched_controls: vec![NodeRowId::new(4)],
        ..target_draws()
    };
    assert_eq!(
        refusal(&target_inputs(&corpus, &moving, target_options(1.0))),
        TrainError::SplitPopulationsOverlap {
            first: SplitPopulation::MovementParticipants,
            second: SplitPopulation::MatchedControls,
            row: NodeRowId::new(4)
        },
    );
}

/// A resumed target ladder freezes the bit-equal references and replays the straight run's
/// readings exactly, because the whole target machinery derives from the boundary model alone.
///
/// The bit-equality claims presume per-process test isolation. burn-autodiff draws node ids
/// from a process-global counter, so an autodiff test running concurrently in the same
/// process can reorder the gradient map's accumulation and move these bits. The repository's
/// nextest profile isolates every test in its own process, and single-threaded `cargo test`
/// also holds.
#[test]
fn resumed_target_ladder_freezes_the_bit_equal_references() {
    let corpus = target_corpus();
    let draws = target_draws();
    let inputs = target_inputs(&corpus, &draws, target_options(1.0));
    let options = options(schedule(nz!(12), 6, nz!(4)));

    let straight = fit(
        model(),
        &inputs,
        &options,
        &mut rng(17),
        &*DEVICE,
        &NoProgress,
    )
    .expect("the target fixture trains")
    .trained();

    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &inputs,
        &options,
        &mut stream,
        &*DEVICE,
        &NoProgress,
    )
    .expect("the opening segment trains");
    assert!(
        state.training.evidence.target.is_none(),
        "the opening segment never freezes a target phase"
    );
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");
    drop((state, stream));

    let (reopened, mut stream) =
        artifact::open_resume::<NodeRowId, Training>(bytes.as_slice(), architecture(), &*DEVICE)
            .expect("the resume checkpoint opens");
    let resumed = fit_from_boundary(
        reopened,
        &inputs,
        &options,
        &mut stream,
        &*DEVICE,
        &NoProgress,
    )
    .expect("the resumed ladder trains")
    .trained();

    let straight_target = straight.evidence.target.as_ref().expect("evidence exists");
    let resumed_target = resumed.evidence.target.as_ref().expect("evidence exists");
    assert_eq!(straight_target.identity, resumed_target.identity);
    assert_eq!(straight_target.unit_law, resumed_target.unit_law);
    assert_eq!(straight_target.split_digest, resumed_target.split_digest);
    assert_eq!(
        straight_target.boundary_field,
        resumed_target.boundary_field
    );
    assert_eq!(straight_target.tables, resumed_target.tables);
    assert_eq!(straight_target.estimands, resumed_target.estimands);
    assert_eq!(straight_target.evaluations, resumed_target.evaluations);
    assert_eq!(
        project(&resumed.projector, &corpus, non_negative!(1.0)),
        project(&straight.projector, &corpus, non_negative!(1.0)),
        "the straight and resumed target runs should train bit-equal frames"
    );
}
