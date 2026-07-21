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
    reason = "structurally-zero displacements and asserted radii are bit-exact contracts"
)]

use core::num::NonZero;

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    module::AutodiffModule as _,
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    FrozenRadius, RelationLens, TrainError, TrainOptions, TrainerInputs, TrainingSchedule, fit,
    fit_from_boundary, fit_to_boundary,
};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId, PROJECTOR_DIMENSIONS},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, Vec2},
    salt::{
        knn::table::{Knn, KnnMatrix},
        policy::ClassProbabilities,
        projector::{
            artifact,
            budget::BudgetOptions,
            loss::{AffinityEnergy, CoincidentEnergy, SupportOptions},
            miner::MinerOptions,
            model::{Architecture, NodeRole, Projector},
            train::{
                BatchPlan, Coefficients,
                batch::{NodeColumns, SupportAnchor},
                refresh,
            },
            verdict::{PlacementClass, ResolvedVerdict},
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
    graph: SemanticGraph,
    indexes: RelationIndexes,
    knn: Knn,
    storage: BoxedVecN<CAPACITY>,
    roles: Vec<NodeRole>,
    landmarks: Vec<SupportAnchor>,
    verdicts: Vec<ResolvedVerdict>,
}

impl Corpus {
    fn inputs(&self) -> TrainerInputs<'_> {
        TrainerInputs {
            semantic: self.graph.view(),
            protection: self.indexes.protection.view(),
            protection_config: ProtectionConfig::default(),
            attraction: &self.indexes.attraction,
            knn: self.knn.view(),
            columns: NodeColumns {
                representations: AlignedVecN::from_slice(&self.storage.as_array()[..CAPACITY])
                    .expect("boxed storage is aligned"),
                roles: &self.roles,
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
    instances: Vec<RelationInstance>,
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
                radius: 1.0,
                weight: 1.0,
            },
            SupportAnchor {
                row: NodeRowId::new(HALF as u64),
                target: Vec2::new(1.0, 0.0),
                radius: 1.0,
                weight: 1.0,
            },
        ],
        verdicts,
    }
}

/// The vacuous two-cluster corpus: no relation evidence at all.
fn semantic_corpus() -> Corpus {
    corpus_with(&[], Vec::new(), Vec::new(), AttractionOptions::default())
}

/// The boundary corpus: one Proximal relation spanning the clusters.
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
fn semantic_graph(rows: usize, edges: &[(usize, usize, f32)]) -> SemanticGraph {
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

/// A complete-graph neighbour table: cluster mates near, others far.
fn knn_table() -> Knn {
    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut values = Vec::new();
    for row in 0..ROWS {
        for column in (0..ROWS).filter(|&column| column != row) {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            values.push(if first_cluster(row) == first_cluster(column) {
                0.25
            } else {
                1.75
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

fn schedule(steps: usize, boundary: usize, refresh_interval: usize) -> TrainingSchedule {
    TrainingSchedule::new(
        nonzero(steps),
        boundary,
        nonzero(refresh_interval),
        0.05,
        0.001,
    )
    .expect("the fixture schedule is valid")
}

fn options(schedule: TrainingSchedule, asserted_radius: Option<f32>) -> TrainOptions {
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
            0.5,
        )
        .expect("the fixture epsilon is valid"),
        support: SupportOptions::new(1.0, 0.5).expect("the fixture support options are valid"),
        budget: BudgetOptions::new(100.0, 100.0, 0.25, 1.0e-12)
            .expect("the fixture budget is valid"),
        coefficients: Coefficients::new(1.0, 0.5, 0.5, 1.0, 0.0, 1.0)
            .expect("the fixture coefficients are valid"),
        miner: MinerOptions::new(nonzero(2), nonzero(2), 1.0, 1.0)
            .expect("the fixture miner options are valid"),
        lens: RelationLens::new(
            CoincidentEnergy::new(0.0, 1.0).expect("the fixture coincident energy is valid"),
            0.25,
            0.5,
            asserted_radius,
        )
        .expect("the fixture lens is valid"),
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
    Projector::new(architecture(), rng(7), &device())
}

/// Forwards the trained corpus at a rung.
fn project(trained: &Projector<TestBackend>, corpus: &Corpus, eta: f32) -> Vec<Vec2> {
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
fn mean_distance(layout: &[Vec2], pairs: impl Iterator<Item = (usize, usize)>) -> f32 {
    let mut total = 0.0;
    let mut count = 0.0;
    for (one, other) in pairs {
        total += layout[one].distance(layout[other]);
        count += 1.0;
    }
    total / count
}

#[test]
fn training_separates_the_semantic_clusters() {
    let corpus = semantic_corpus();
    // Boundary at the end: a pure semantic run records no boundary.
    let options = options(schedule(300, 300, 50), None);
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(11), &device())
        .expect("the semantic fixture trains");

    assert_eq!(fitted.evidence.losses.len(), 300);
    assert!(fitted.evidence.boundary.is_none());

    let layout = project(&fitted.model, &corpus, 0.0);
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
    let mut options = options(schedule(300, 300, 50), None);
    // A dominant landmark coefficient pins the anchored rows.
    options.coefficients = Coefficients::new(1.0, 0.5, 0.5, 1.0, 0.0, 8.0)
        .expect("the fixture coefficients are valid");
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(11), &device())
        .expect("the semantic fixture trains");

    let layout = project(&fitted.model, &corpus, 0.0);
    for anchor in &corpus.landmarks {
        let distance = layout[anchor.row.usize()].distance(anchor.target);
        assert!(
            distance < anchor.radius,
            "row {} should hold near its landmark: distance {distance}",
            anchor.row.get()
        );
    }
}

#[test]
fn equal_seeds_train_equal_frames() {
    let corpus = semantic_corpus();
    let options = options(schedule(24, 24, 8), None);
    let one = fit(model(), &corpus.inputs(), &options, &mut rng(13), &device())
        .expect("the semantic fixture trains");
    let two = fit(model(), &corpus.inputs(), &options, &mut rng(13), &device())
        .expect("the semantic fixture trains");

    assert_eq!(one.evidence.losses, two.evidence.losses);
    assert_eq!(
        project(&one.model, &corpus, 0.0),
        project(&two.model, &corpus, 0.0),
        "equal seeds should train bit-equal frames on the deterministic backend"
    );
}

#[test]
fn the_boundary_freezes_a_measured_radius_and_opens_the_ladder() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(12, 6, 4), None);
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(17), &device())
        .expect("the boundary fixture trains");

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.step, 6);
    let FrozenRadius::Measured { radius } = boundary.radius else {
        panic!("an unasserted boundary measures its radius");
    };
    assert!(radius.is_finite() && radius > 0.0);
    assert_eq!(boundary.calibration.radius, Some(radius));

    let entry = &boundary.calibration.types[0];
    assert_eq!(entry.relation, OntologyRowId::new(RELATION));
    assert_eq!(entry.pairs, 3);
    assert!(entry.mass > 0.0);
    assert!(entry.quantiles.is_some());

    // Phase A is semantic-only; the ladder's zero rung stays so; and
    // every positive rung exerts relation force (the Proximal energy
    // is strictly positive).
    let losses = &fitted.evidence.losses;
    assert!(losses[..6].iter().all(|loss| loss.relation == 0.0));
    assert_eq!(losses[6].relation, 0.0, "the ladder opens at the zero rung");
    assert!(losses[7].relation > 0.0, "the half rung pulls");
    assert!(losses[8].relation > 0.0, "the full rung pulls");

    // Relation-active nodes were budgeted and recorded.
    assert!(fitted.evidence.budget.overall().nodes() > 0);

    // Ticks at the cadence steps and the boundary.
    let ticks: Vec<usize> = fitted
        .evidence
        .telemetry
        .iter()
        .map(|tick| tick.step)
        .collect();
    assert_eq!(ticks, [0, 4, 6, 8]);
}

#[test]
fn a_missing_reviewed_radius_names_both_fixes() {
    let corpus = proximal_corpus(Vec::new());
    let options = options(schedule(12, 6, 4), None);
    let error = fit(model(), &corpus.inputs(), &options, &mut rng(17), &device())
        .expect_err("proximal force without reviews cannot freeze a radius");

    assert_eq!(error, TrainError::MissingProximalReviews);
    let message = error.to_string();
    assert!(message.contains("confirm Proximal types"));
    assert!(message.contains("assertion"));
}

#[test]
fn an_asserted_radius_supersedes_the_measurement() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(8, 4, 4), Some(1.5));
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(17), &device())
        .expect("the asserted fixture trains");

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.radius, FrozenRadius::Asserted { radius: 1.5 });
    assert!(
        boundary.calibration.radius.is_some(),
        "the measured quantiles still land in evidence for judging the assertion"
    );
}

#[test]
fn a_forceless_corpus_trains_vacuously() {
    let corpus = semantic_corpus();
    let options = options(schedule(9, 3, 4), None);
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(19), &device())
        .expect("a forceless corpus trains vacuously");

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.radius, FrozenRadius::Vacuous);
    assert_eq!(boundary.calibration.radius, None);
    assert!(boundary.calibration.types.is_empty());
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
fn a_vacuous_run_trains_a_flat_ladder() {
    let corpus = semantic_corpus();
    // The ladder opens at step 3, but a forceless corpus pins the
    // zero rung through it: the condition weights never receive
    // gradient, so every rung projects the identical map.
    let options = options(schedule(9, 3, 4), None);
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(19), &device())
        .expect("a forceless corpus trains vacuously");

    let low = project(&fitted.model, &corpus, 0.0);
    assert_eq!(
        low,
        project(&fitted.model, &corpus, 1.0),
        "the lens extremes should project bit-identical maps"
    );
    assert_eq!(
        low,
        project(&fitted.model, &corpus, 0.5),
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
fn a_measured_radius_requires_an_opening_segment() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let error = fit(
        model(),
        &corpus.inputs(),
        &options(schedule(8, 0, 4), None),
        &mut rng(23),
        &device(),
    )
    .expect_err("a boundary at step zero cannot measure a radius");
    assert_eq!(error, TrainError::UnbaselinedRadius);
}

#[test]
fn an_asserted_radius_permits_a_zero_boundary() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options(schedule(8, 0, 4), Some(1.5)),
        &mut rng(23),
        &device(),
    )
    .expect("an asserted radius makes a zero boundary trainable");

    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran at step zero");
    assert_eq!(boundary.step, 0);
    assert_eq!(boundary.radius, FrozenRadius::Asserted { radius: 1.5 });
}

#[test]
fn coincident_only_force_requires_an_assertion() {
    let coincident_policy = RelationPolicy {
        relation: OntologyRowId::new(RELATION),
        attraction: ClassProbabilities {
            coincident: 1.0,
            proximal: 0.0,
        },
        selected: ClassProbabilities {
            coincident: 1.0,
            proximal: 0.0,
        },
        applicability: 1.0,
        strength: 1.0,
    };
    let build = || {
        corpus_with(
            &[coincident_policy],
            vec![instance(0, RELATION, 0, 4), instance(1, RELATION, 1, 5)],
            Vec::new(),
            AttractionOptions::new(2.0, 0.0).expect("the fixture options are valid"),
        )
    };

    let corpus = build();
    let error = fit(
        model(),
        &corpus.inputs(),
        &options(schedule(8, 4, 4), None),
        &mut rng(23),
        &device(),
    )
    .expect_err("coincident force alone cannot set the Proximal radius");
    assert_eq!(error, TrainError::CoincidentWithoutProximal);

    let corpus = build();
    let fitted = fit(
        model(),
        &corpus.inputs(),
        &options(schedule(8, 4, 4), Some(1.0)),
        &mut rng(23),
        &device(),
    )
    .expect("an asserted radius composes the energy");
    let boundary = fitted
        .evidence
        .boundary
        .as_ref()
        .expect("the boundary ran within the schedule");
    assert_eq!(boundary.radius, FrozenRadius::Asserted { radius: 1.0 });
}

#[test]
fn phase_a_ticks_measure_a_frozen_lens() {
    // Through the opening segment the FiLM condition weight is
    // zero-initialized and receives an exactly-zero gradient at the
    // zero rung, so Adam never moves it and the two lens extremes
    // produce bit-identical frames: the measured displacement is
    // exactly zero, not approximately.
    let corpus = semantic_corpus();
    let options = options(schedule(4, 4, 2), None);
    let fitted = fit(model(), &corpus.inputs(), &options, &mut rng(29), &device())
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
fn a_non_finite_representation_fails_the_first_tick() {
    let mut corpus = semantic_corpus();
    corpus.storage.as_array_mut()[3 * PROJECTOR_DIMENSIONS + 9] = f32::INFINITY;
    let options = options(schedule(4, 4, 2), None);
    let error = fit(model(), &corpus.inputs(), &options, &mut rng(31), &device())
        .expect_err("an infinite representation diverges the forward pass");

    let TrainError::Refresh(refresh::RefreshError::Diverged { row, .. }) = error else {
        panic!("divergence surfaces as a refresh error, got {error:?}");
    };
    assert_eq!(row.get(), 3, "the error names the diverged corpus row");
}

#[test]
fn chunked_forwards_match_the_whole_corpus_pass() {
    let corpus = semantic_corpus();
    let projector = model();
    let inference = projector.valid();
    let chunked = refresh::forward(
        &inference,
        corpus.inputs().columns,
        1.0,
        nonzero(3),
        &device(),
    )
    .expect("the fixture model is finite");
    let whole = refresh::forward(
        &inference,
        corpus.inputs().columns,
        1.0,
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
fn the_schedule_validates_its_domain() {
    let valid = TrainingSchedule::new(nonzero(10), 5, nonzero(2), 0.05, 0.001);
    assert!(valid.is_some());
    assert!(
        TrainingSchedule::new(nonzero(10), 11, nonzero(2), 0.05, 0.001).is_none(),
        "the boundary lies within the run"
    );
    assert!(TrainingSchedule::new(nonzero(10), 5, nonzero(2), 0.0, 0.0).is_none());
    assert!(TrainingSchedule::new(nonzero(10), 5, nonzero(2), 1.5, 0.0).is_none());
    assert!(TrainingSchedule::new(nonzero(10), 5, nonzero(2), 0.05, 0.1).is_none());
    assert!(TrainingSchedule::new(nonzero(10), 5, nonzero(2), f64::NAN, 0.0).is_none());
}

#[test]
fn the_lens_validates_its_domain() {
    let coincident = CoincidentEnergy::new(0.25, 1.0).expect("the fixture energy is valid");
    assert!(RelationLens::new(coincident, 0.25, 0.5, None).is_some());
    assert!(RelationLens::new(coincident, 0.0, 0.5, None).is_none());
    assert!(RelationLens::new(coincident, 0.25, -1.0, None).is_none());
    assert!(
        RelationLens::new(coincident, 0.25, 0.5, Some(0.25)).is_none(),
        "an asserted radius must exceed the Coincident radius"
    );
    assert!(RelationLens::new(coincident, 0.25, 0.5, Some(0.5)).is_some());
    assert!(RelationLens::new(coincident, 0.25, 0.5, Some(f32::NAN)).is_none());
}

#[test]
fn a_checkpointed_resume_matches_the_straight_run() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let options = options(schedule(12, 6, 4), None);

    let straight = fit(model(), &corpus.inputs(), &options, &mut rng(17), &device())
        .expect("the boundary fixture trains");

    let mut stream = rng(17);
    let state = fit_to_boundary(model(), &corpus.inputs(), &options, &mut stream, &device())
        .expect("the opening segment trains");
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");
    drop((state, stream));

    let (reopened, mut stream) =
        artifact::open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device())
            .expect("the resume checkpoint opens");
    let resumed = fit_from_boundary(reopened, &corpus.inputs(), &options, &mut stream, &device())
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
        project(&resumed.model, &corpus, 0.0),
        project(&straight.model, &corpus, 0.0),
    );
    assert_eq!(
        project(&resumed.model, &corpus, 1.0),
        project(&straight.model, &corpus, 1.0),
        "the straight and resumed runs should train bit-equal frames"
    );
}

#[test]
fn forked_ladders_share_the_frozen_radius() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let opening = options(schedule(12, 6, 4), None);

    let mut stream = rng(17);
    let state = fit_to_boundary(model(), &corpus.inputs(), &opening, &mut stream, &device())
        .expect("the opening segment trains");
    let mut bytes = Vec::new();
    artifact::write_resume(&state, &stream, &mut bytes).expect("the resume checkpoint writes");

    let fork = |relation: f32| {
        let (state, mut stream) =
            artifact::open_resume::<TestBackend>(bytes.as_slice(), architecture(), &device())
                .expect("the resume checkpoint opens");
        let mut cell = opening;
        cell.coefficients = Coefficients::new(1.0, 0.5, 0.5, relation, 0.0, 1.0)
            .expect("the fork coefficients are valid");
        fit_from_boundary(state, &corpus.inputs(), &cell, &mut stream, &device())
            .expect("the forked ladder trains")
    };

    let one = fork(1.0);
    let two = fork(4.0);

    assert_eq!(
        one.evidence.boundary, two.evidence.boundary,
        "fork cells should freeze the bit-equal radius from the shared opening"
    );
    assert_ne!(
        project(&one.model, &corpus, 1.0),
        project(&two.model, &corpus, 1.0),
        "the forked relation coefficient should change the trained ladder"
    );
}

#[test]
fn a_resumed_ladder_rejects_a_changed_schedule() {
    let corpus = proximal_corpus(vec![proximal_verdict()]);
    let opening = options(schedule(12, 6, 4), None);
    let state = fit_to_boundary(model(), &corpus.inputs(), &opening, &mut rng(17), &device())
        .expect("the opening segment trains");

    let changed = options(schedule(16, 6, 4), None);
    let error = fit_from_boundary(state, &corpus.inputs(), &changed, &mut rng(17), &device())
        .expect_err("a changed schedule should be rejected");
    assert_eq!(
        error,
        TrainError::ScheduleChanged {
            opening: schedule(12, 6, 4),
            resumed: schedule(16, 6, 4),
        }
    );
}
