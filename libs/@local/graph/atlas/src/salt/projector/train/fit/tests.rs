//! Certificates for the training run.
//!
//! End-to-end convergence, the phase boundary's radius policy, the lens schedule, and the refresh
//! telemetry.
//!
//! The corpus is two four-node semantic clusters whose representations share a cluster pattern, so
//! the model can learn the separation the semantic edges describe; landmarks on one row per cluster
//! keep the frame from collapsing or drifting.

#![expect(
    clippy::float_cmp,
    reason = "structurally-zero displacements and frozen radii are bit-exact contracts"
)]

use core::num::NonZero;
use std::sync::Mutex;

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    module::AutodiffModule as _,
};
use hashql_core::id::{Id, IdSlice, IdVec};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    FrozenRadius, LossBreakdown, RelationLens, TrainError, TrainOptions, TrainerInputs,
    TrainingSchedule, fit, fit_from_boundary, fit_to_boundary, session,
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{
        AffinityCurve, AlignedVecN, BoxedVecN, NonNegative, Positive, Vec2, d_non_negative,
        d_positive, non_negative, open_unit_fraction, positive, unit_fraction,
    },
    progress::{NoProgress, Progress},
    salt::{
        knn::table::{Knn, KnnMatrix},
        policy::ClassProbabilities,
        projector::{
            artifact,
            budget::Budget,
            loss::{AffinityEnergy, CoincidentEnergy, SupportOptions},
            miner::MinerOptions,
            model::{Architecture, NodeRole, Projector},
            train::{
                BatchPlan, Coefficients,
                batch::{NodeColumns, SupportAnchor},
                refresh,
            },
            verdict::{
                PlacementClass, ResolvedVerdict,
                calibrate::{
                    ProximalCalibration, TypeCalibration,
                    stability::{StabilityBound, StabilityCertificate},
                },
            },
        },
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::AttractionOptions, protection::ProtectionConfig,
        },
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

type TestBackend = Autodiff<NdArray>;

/// Rows per semantic cluster.
const HALF: usize = 4;
const ROWS: usize = 2 * HALF;
const CAPACITY: usize = ROWS * PROJECTOR_DIMENSIONS;

/// The reviewed relation type of the boundary fixtures.
const RELATION: u64 = 11;

fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

fn nonzero(value: usize) -> NonZero<usize> {
    NonZero::new(value).expect("fixture values are non-zero")
}

fn device() -> NdArrayDevice {
    NdArrayDevice::default()
}

/// Whether a row belongs to the first semantic cluster.
const fn first_cluster(row: usize) -> bool {
    row < HALF
}

/// One training corpus's owned artifacts.
struct Corpus {
    graph: SemanticGraph<NodeRowId>,
    indexes: RelationIndexes<NodeRowId, EdgeRowId>,
    knn: Knn<NodeRowId>,
    storage: BoxedVecN<CAPACITY>,
    roles: Vec<NodeRole>,
    landmarks: Vec<SupportAnchor<NodeRowId>>,
    verdicts: Vec<ResolvedVerdict>,
}

impl Corpus {
    fn inputs(&self) -> TrainerInputs<'_, NodeRowId, EdgeRowId> {
        TrainerInputs {
            semantic: self.graph.view(),
            protection: self.indexes.protection.view(),
            protection_config: ProtectionConfig::default(),
            attraction: &self.indexes.attraction,
            knn: self.knn.view(),
            columns: NodeColumns {
                representations: IdSlice::from_raw(
                    AlignedVecN::from_slice(&self.storage.as_array()[..CAPACITY])
                        .expect("boxed storage is aligned"),
                ),
                roles: IdSlice::from_raw(&self.roles),
            },
            landmarks: &self.landmarks,
            anchors: &[],
            verdicts: &self.verdicts,
        }
    }
}

/// Builds the two-cluster corpus with the given relation evidence.
fn corpus_with(
    policies: &[RelationPolicy],
    instances: Vec<RelationInstance<NodeRowId, EdgeRowId>>,
    verdicts: Vec<ResolvedVerdict>,
    options: AttractionOptions,
) -> Corpus {
    // Within-cluster cliques: {0..4} and {4..8}, unit weight.
    let mut edges = Vec::new();
    for base in [0, HALF] {
        for one in 0..HALF {
            for other in (one + 1)..HALF {
                edges.push((base + one, base + other, 1.0));
            }
        }
    }
    let graph = semantic_graph(ROWS, &edges);

    let mut instances = instances;
    let indexes = RelationIndexes::build(
        ROWS,
        Policies::new(policies).expect("the fixture policies are certified"),
        &mut instances,
        options,
    )
    .expect("the fixture instances satisfy the input contract");

    // Cluster-patterned representations: a shared sign block plus one
    // row-distinct component, so cluster members map to similar inputs
    // while every row stays distinguishable.
    let mut storage = BoxedVecN::zero();
    let array = storage.as_array_mut();
    for row in 0..ROWS {
        let base = row * PROJECTOR_DIMENSIONS;
        let sign = if first_cluster(row) { 0.5 } else { -0.5 };
        for component in 0..8 {
            array[base + component] = sign;
        }
        array[base + 8 + row] = 0.25;
    }

    Corpus {
        graph,
        indexes,
        knn: knn_table(),
        storage,
        roles: vec![NodeRole::KnowledgeEntity; ROWS],
        landmarks: vec![
            SupportAnchor {
                row: NodeRowId::new(0),
                target: Vec2::new(-1.0, 0.0),
                radius: non_negative!(1.0),
                weight: 1.0,
            },
            SupportAnchor {
                row: NodeRowId::from_usize(HALF),
                target: Vec2::new(1.0, 0.0),
                radius: non_negative!(1.0),
                weight: 1.0,
            },
        ],
        verdicts,
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

fn proximal_verdict() -> ResolvedVerdict {
    ResolvedVerdict {
        relation: OntologyRowId::new(RELATION),
        placement: PlacementClass::Proximal,
    }
}

/// Builds a symmetric semantic graph from undirected weighted edges.
fn semantic_graph(rows: usize, edges: &[(usize, usize, f32)]) -> SemanticGraph<NodeRowId> {
    let mut adjacency = vec![Vec::new(); rows];
    for &(one, other, weight) in edges {
        adjacency[one].push((other, weight));
        adjacency[other].push((one, weight));
    }
    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut weights = Vec::new();
    for row in &mut adjacency {
        row.sort_unstable_by_key(|&(column, _)| column);
        for &(column, weight) in row.iter() {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            weights.push(weight);
        }
        indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
    }
    let matrix = SemanticMatrix::try_new((rows, rows), indptr, columns, weights)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is structurally valid");
    SemanticGraph::new(matrix).expect("the fixture graph is a valid semantic graph")
}

/// A complete-graph neighbour table that places cluster mates near and everything else far.
fn knn_table() -> Knn<NodeRowId> {
    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut values = Vec::new();
    for row in 0..ROWS {
        for column in (0..ROWS).filter(|&column| column != row) {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            values.push(if first_cluster(row) == first_cluster(column) {
                non_negative!(0.25)
            } else {
                non_negative!(1.75)
            });
        }
        indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
    }
    let matrix = KnnMatrix::try_new((ROWS, ROWS), indptr, columns, values)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is structurally valid");
    Knn::new(matrix).expect("the fixture table is a valid neighbour table")
}

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

fn schedule(steps: usize, boundary: usize, refresh_interval: usize) -> TrainingSchedule {
    TrainingSchedule::new(
        nonzero(steps),
        boundary,
        nonzero(refresh_interval),
        unit_fraction!(0.05),
        unit_fraction!(0.001),
    )
    .expect("the fixture schedule is valid")
}

fn options(schedule: TrainingSchedule) -> TrainOptions {
    TrainOptions {
        schedule,
        plan: BatchPlan {
            semantic_pairs: nonzero(8),
            ordinary_pairs: 4,
            relation_types: 1,
            relation_cap: nonzero(4),
            hard_queries: 2,
            landmark_anchors: 2,
            temporal_anchors: 0,
        },
        affinity: AffinityEnergy::new(
            AffinityCurve::new(1.0, 1.0).expect("the fixture curve is valid"),
            positive!(0.5),
        )
        .expect("the fixture exponent satisfies the objective bound"),
        support: SupportOptions::new(positive!(1.0), positive!(0.5)),
        budget: Budget {
            floor: positive!(0.25),
        },
        coefficients: Coefficients::new(
            Positive::ONE,
            non_negative!(0.5),
            non_negative!(0.5),
            NonNegative::ONE,
            NonNegative::ZERO,
            NonNegative::ONE,
        ),
        miner: MinerOptions::new(nonzero(2), nonzero(2), positive!(1.0), positive!(1.0)),
        lens: RelationLens::new(
            CoincidentEnergy::new(non_negative!(0.0), positive!(1.0)),
            positive!(0.25),
            positive!(0.5),
        ),
        forward_rows: nonzero(3),
    }
}

fn architecture() -> Architecture {
    Architecture {
        width: nonzero(8),
        residual_blocks: nonzero(1),
        representation_dimensions: nonzero(PROJECTOR_DIMENSIONS),
        role_dimensions: nonzero(4),
        condition_dimensions: nonzero(1),
    }
}

fn model() -> Projector<TestBackend> {
    Projector::new(architecture(), &device(), rng(7))
}

/// Forwards the trained corpus at a rung.
fn project(
    trained: &Projector<TestBackend>,
    corpus: &Corpus,
    eta: NonNegative,
) -> IdVec<NodeRowId, Vec2> {
    refresh::forward(
        &trained.valid(),
        corpus.inputs().columns,
        eta,
        nonzero(ROWS),
        &device(),
    )
    .expect("the trained fixture model is finite")
}

/// Mean pairwise distance over the given row pairs.
fn mean_distance<N>(layout: &IdSlice<N, Vec2>, pairs: impl Iterator<Item = (usize, usize)>) -> f32
where
    N: Id,
{
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
    let options = options(schedule(25, 25, 10));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(11),
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");

    assert_eq!(fitted.evidence.losses.len(), 25);
    assert!(fitted.evidence.boundary.is_none());

    let layout = project(&fitted.model, &corpus, non_negative!(0.0));
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
    let mut options = options(schedule(25, 25, 10));
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
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");

    let layout = project(&fitted.model, &corpus, non_negative!(0.0));
    for anchor in &corpus.landmarks {
        let distance = layout[anchor.row].distance(anchor.target);
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
    let mut options = options(schedule(10, 10, 2));
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
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");
    let after = project(&fitted.model, &corpus, non_negative!(0.0));

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
    let mut options = options(schedule(10, 10, 2));
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
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");
    let after = project(&fitted.model, &corpus, non_negative!(0.0));

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
    let options = options(schedule(24, 24, 8));
    let one = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(13),
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");
    let two = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(13),
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");

    assert_eq!(one.evidence.losses, two.evidence.losses);
    assert_eq!(
        project(&one.model, &corpus, non_negative!(0.0)),
        project(&two.model, &corpus, non_negative!(0.0)),
        "equal seeds should train bit-equal frames on the deterministic backend"
    );
}

#[test]
fn boundary_freezes_a_measured_radius_and_opens_the_ladder() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(12, 6, 4));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &device(),
        &NoProgress,
    )
    .expect("the boundary fixture trains");

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
    assert_eq!(boundary.calibration.radius, Some(radius));

    let entry = &boundary.calibration.types[0];
    assert_eq!(entry.relation, OntologyRowId::new(RELATION));
    assert_eq!(entry.pairs, 3);
    assert!(entry.mass > d_non_negative!(0.0));
    assert!(entry.quantiles.is_some());

    // Phase A is semantic-only; the ladder's zero rung stays so; and
    // every positive rung exerts relation force (the Proximal energy
    // is strictly positive).
    let losses = &fitted.evidence.losses;
    assert!(losses[..6].iter().all(|loss| loss.relation == 0.0));
    assert_eq!(losses[6].relation, 0.0, "the ladder opens at the zero rung");
    assert!(losses[7].relation > 0.0, "the half rung pulls");
    assert!(losses[8].relation > 0.0, "the full rung pulls");

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
        .stability
        .as_ref()
        .expect("a measured boundary carries its evaluated certificate");
    assert_eq!(certificate.quantile.get(), 0.25);
    assert!(certificate.effective_support.get() > 0.0);
    assert_eq!(certificate.pairs, 3);
    assert_eq!(
        certificate.pass,
        certificate.epsilon_zero.get() <= certificate.quantile.get()
            && certificate.gap.get() <= certificate.tau.get()
    );

    // The drift instrument reads at every scale-bearing tick: the boundary tick and the ones
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
    let options = options(schedule(12, 6, 4));
    let error = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &device(),
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
    let options = options(schedule(9, 3, 4));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(19),
        &device(),
        &NoProgress,
    )
    .expect("a forceless corpus trains vacuously");

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.radius, FrozenRadius::Vacuous);
    assert_eq!(boundary.calibration.radius, None);
    assert!(boundary.calibration.types.is_empty());
    assert_eq!(boundary.calibration.stability, None);
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
    // zero rung through it: the condition weights never receive
    // gradient, so every rung projects the identical map.
    let options = options(schedule(9, 3, 4));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(19),
        &device(),
        &NoProgress,
    )
    .expect("a forceless corpus trains vacuously");

    let low = project(&fitted.model, &corpus, non_negative!(0.0));
    assert_eq!(
        low,
        project(&fitted.model, &corpus, non_negative!(1.0)),
        "the lens extremes should project bit-identical maps"
    );
    assert_eq!(
        low,
        project(&fitted.model, &corpus, non_negative!(0.5)),
        "the middle rung should project the same map as the extremes"
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
        &options(schedule(8, 0, 4)),
        &mut rng(23),
        &device(),
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
        &options(schedule(8, 4, 4)),
        &mut rng(23),
        &device(),
        &NoProgress,
    )
    .expect_err("coincident force alone cannot set the Proximal radius");
    assert_eq!(error, TrainError::CoincidentWithoutProximal);
}

#[test]
fn phase_a_ticks_measure_a_frozen_lens() {
    // Through the opening segment the FiLM condition weight is
    // zero-initialized and receives an exactly-zero gradient at the
    // zero rung, so Adam never moves it and the two lens extremes
    // produce bit-identical frames: the measured displacement is
    // exactly zero, not approximately.
    let corpus = semantic_corpus();
    let options = options(schedule(4, 4, 2));
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(29),
        &device(),
        &NoProgress,
    )
    .expect("the semantic fixture trains");

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
    let options = options(schedule(4, 4, 2));
    let error = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(31),
        &device(),
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
        nonzero(3),
        &device(),
    )
    .expect("the fixture model is finite");
    let whole = refresh::forward(
        &inference,
        corpus.inputs().columns,
        non_negative!(1.0),
        nonzero(ROWS),
        &device(),
    )
    .expect("the fixture model is finite");
    assert_eq!(
        chunked, whole,
        "rows project independently, so slicing cannot change the frame"
    );
}

#[test]
fn schedule_validates_its_domain() {
    // Out-of-range rates (negative, above one, non-finite) are unconstructible as `UnitFraction`s.
    // The residual domain here is positivity and ordering.
    let valid = TrainingSchedule::new(
        nonzero(10),
        5,
        nonzero(2),
        unit_fraction!(0.05),
        unit_fraction!(0.001),
    );
    assert!(valid.is_some());
    assert!(
        TrainingSchedule::new(
            nonzero(10),
            11,
            nonzero(2),
            unit_fraction!(0.05),
            unit_fraction!(0.001)
        )
        .is_none(),
        "the boundary lies within the run"
    );
    assert!(
        TrainingSchedule::new(
            nonzero(10),
            5,
            nonzero(2),
            unit_fraction!(0.0),
            unit_fraction!(0.0)
        )
        .is_none(),
        "the initial rate is strictly positive"
    );
    assert!(
        TrainingSchedule::new(
            nonzero(10),
            5,
            nonzero(2),
            unit_fraction!(0.05),
            unit_fraction!(0.1)
        )
        .is_none(),
        "the minimum does not exceed the initial rate"
    );
}

#[test]
fn checkpointed_resume_matches_the_straight_run() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(12, 6, 4));

    let straight = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &device(),
        &NoProgress,
    )
    .expect("the boundary fixture trains");

    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &options,
        &mut stream,
        &device(),
        &NoProgress,
    )
    .expect("the opening segment trains");
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");
    drop((state, stream));

    let (reopened, mut stream) =
        artifact::open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device())
            .expect("the resume checkpoint opens");
    let resumed = fit_from_boundary(
        reopened,
        &corpus.inputs(),
        &options,
        &mut stream,
        &device(),
        &NoProgress,
    )
    .expect("the resumed ladder trains");

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
        project(&resumed.model, &corpus, non_negative!(0.0)),
        project(&straight.model, &corpus, non_negative!(0.0)),
    );
    assert_eq!(
        project(&resumed.model, &corpus, non_negative!(1.0)),
        project(&straight.model, &corpus, non_negative!(1.0)),
        "the straight and resumed runs should train bit-equal frames"
    );
}

#[test]
fn forked_ladders_share_the_frozen_radius() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let opening = options(schedule(12, 6, 4));

    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &opening,
        &mut stream,
        &device(),
        &NoProgress,
    )
    .expect("the opening segment trains");
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");

    let fork = |relation: NonNegative| {
        let (state, mut stream) =
            artifact::open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device())
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
            &device(),
            &NoProgress,
        )
        .expect("the forked ladder trains")
    };

    let one = fork(non_negative!(1.0));
    let two = fork(non_negative!(4.0));

    assert_eq!(
        one.evidence.boundary, two.evidence.boundary,
        "fork cells should freeze the bit-equal radius from the shared opening"
    );
    assert_ne!(
        project(&one.model, &corpus, non_negative!(1.0)),
        project(&two.model, &corpus, non_negative!(1.0)),
        "the forked relation coefficient should change the trained ladder"
    );
}

#[test]
fn resumed_ladder_rejects_a_changed_schedule() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let opening = options(schedule(12, 6, 4));
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &opening,
        &mut rng(17),
        &device(),
        &NoProgress,
    )
    .expect("the opening segment trains");

    let changed = options(schedule(16, 6, 4));
    let error = fit_from_boundary(
        state,
        &corpus.inputs(),
        &changed,
        &mut rng(17),
        &device(),
        &NoProgress,
    )
    .expect_err("a changed schedule should be rejected");
    assert_eq!(
        error,
        TrainError::ScheduleChanged {
            opening: schedule(12, 6, 4),
            resumed: schedule(16, 6, 4),
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
    let options = options(schedule(12, 6, 4));
    let progress = RecordingProgress::default();

    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &device(),
        &progress,
    )
    .expect("the boundary fixture trains");

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
    let options = options(schedule(12, 6, 4));

    let forked = RecordingProgress::default();
    let mut stream = rng(17);
    let state = fit_to_boundary(
        model(),
        &corpus.inputs(),
        &options,
        &mut stream,
        &device(),
        &forked,
    )
    .expect("the opening segment trains");
    fit_from_boundary(
        state,
        &corpus.inputs(),
        &options,
        &mut stream,
        &device(),
        &forked,
    )
    .expect("the resumed ladder trains");

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
    let options = options(schedule(12, 6, 4));

    let observer = RecordingProgress::watching(4);
    let watched = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &device(),
        &observer,
    )
    .expect("the boundary fixture trains");
    let unwatched = fit(
        model(),
        &corpus.inputs(),
        &options,
        &mut rng(17),
        &device(),
        &NoProgress,
    )
    .expect("the boundary fixture trains");

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
    ProximalCalibration {
        radius: Some(non_negative!(1.0)),
        types: vec![TypeCalibration {
            relation: OntologyRowId::new(5),
            pairs: 4,
            mass: d_non_negative!(2.0),
            quantiles: Some([non_negative!(1.0), non_negative!(2.0), non_negative!(3.0)]),
            radius_without: Some(
                NonNegative::new(1.0 + spread)
                    .expect("the fixture spread keeps the radius non-negative"),
            ),
        }],
        stability: Some(certificate(pass)),
    }
}

#[test]
fn a_failing_certificate_warns_with_its_finding_id() {
    let calibration = spread_calibration(0.25, false);
    let output =
        captured_warnings(|| session::warn_boundary_findings(&calibration, positive!(0.5)));

    assert!(output.contains("RFC-0006 entry 7"), "{output}");
    assert!(
        output.contains("fails its evaluated stability bound"),
        "{output}"
    );
    // The leave-one-type-out spread rides beside the warning.
    assert!(output.contains("leave_one_out_spread"), "{output}");
    // The tight spread crossed no successor trigger.
    assert!(!output.contains("RFC-0006 entry 1"), "{output}");
}

#[test]
fn a_spread_beyond_one_temperature_warns_with_its_finding_id() {
    let calibration = spread_calibration(4.0, true);
    let output =
        captured_warnings(|| session::warn_boundary_findings(&calibration, positive!(0.5)));

    assert!(output.contains("RFC-0006 entry 1"), "{output}");
    assert!(
        output.contains("more than one transition width"),
        "{output}"
    );
    assert!(!output.contains("RFC-0006 entry 7"), "{output}");
}

#[test]
fn a_passing_certificate_with_a_tight_spread_warns_nothing() {
    let calibration = spread_calibration(0.25, true);
    let output =
        captured_warnings(|| session::warn_boundary_findings(&calibration, positive!(0.5)));

    assert_eq!(output, "");
}
