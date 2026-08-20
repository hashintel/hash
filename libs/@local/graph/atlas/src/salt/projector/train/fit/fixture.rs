//! The shared two-cluster training fixture.
//!
//! The corpus, its relation evidence, the training options, and the target objective's declared
//! inputs live here once, and construction is deterministic: equal calls read back bit-identical
//! fixtures, so runs meant to share an input share it exactly.

use core::num::NonZero;

use hashql_core::id::{Id as _, IdSlice};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    RelationLens, TrainOptions, TrainerInputs, TrainingSchedule,
    objective::{GaugeDraw, TargetInputs, TargetOptions, TargetSplit},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    integrity::Sha256Digest,
    math::{
        AffinityCurve, AlignedVecN, BoxedVecN, NonNegative, Positive, PositiveUnitFraction, Vec2,
        non_negative, nz, positive, positive_unit_fraction, unit_fraction,
    },
    salt::{
        knn::table::{Knn, KnnMatrix},
        policy::ClassProbabilities,
        projector::{
            budget::Budget,
            evidence::StratumId,
            gauge::DuplicateClassId,
            loss::{AffinityEnergy, CoincidentEnergy, Penalty, SupportOptions, UnitLaw},
            miner::MinerOptions,
            model::NodeRole,
            train::{
                BatchPlan, Coefficients,
                batch::{NodeColumns, SupportAnchor},
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

/// Rows per semantic cluster.
pub(super) const HALF: usize = 4;

pub(super) const ROWS: usize = 2 * HALF;

pub(super) const CAPACITY: usize = ROWS * PROJECTOR_DIMENSIONS;

/// The reviewed relation type of the boundary fixtures.
pub(super) const RELATION: u64 = 11;

pub(super) fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

pub(super) const fn nonzero(value: usize) -> NonZero<usize> {
    NonZero::new(value).expect("fixture values are non-zero")
}

/// Whether a row belongs to the first semantic cluster.
pub(super) const fn first_cluster(row: usize) -> bool {
    row < HALF
}

/// Builds a symmetric semantic graph from undirected weighted edges.
pub(super) fn semantic_graph(
    rows: usize,
    edges: &[(usize, usize, f32)],
) -> SemanticGraph<NodeRowId> {
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
pub(super) fn knn_table() -> Knn<NodeRowId> {
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
pub(super) const fn proximal_policy(relation: u64) -> RelationPolicy {
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
pub(super) fn instance(
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

pub(super) const fn proximal_verdict() -> ResolvedVerdict {
    ResolvedVerdict {
        relation: OntologyRowId::new(RELATION),
        placement: PlacementClass::Proximal,
    }
}

/// One training corpus's owned artifacts.
pub(super) struct Corpus {
    pub graph: SemanticGraph<NodeRowId>,
    pub indexes: RelationIndexes<NodeRowId, EdgeRowId>,
    pub knn: Knn<NodeRowId>,
    pub storage: BoxedVecN<CAPACITY>,
    pub roles: Vec<NodeRole>,
    pub landmarks: Vec<SupportAnchor<NodeRowId>>,
    pub verdicts: Vec<ResolvedVerdict>,
}

impl Corpus {
    pub(super) fn inputs(&self) -> TrainerInputs<'_, NodeRowId, EdgeRowId> {
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
            target: None,
        }
    }
}

/// Builds the two-cluster corpus with the given relation evidence.
pub(super) fn corpus_with(
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

pub(super) const fn schedule(
    steps: NonZero<usize>,
    boundary: usize,
    refresh_interval: NonZero<usize>,
) -> TrainingSchedule {
    TrainingSchedule::new(
        steps,
        boundary,
        refresh_interval,
        positive_unit_fraction!(0.05),
        unit_fraction!(0.001),
    )
    .expect("the fixture schedule is valid")
}

pub(super) fn options(schedule: TrainingSchedule) -> TrainOptions {
    TrainOptions {
        schedule,
        plan: BatchPlan {
            semantic_pairs: nz!(8),
            ordinary_pairs: 4,
            relation_types: 1,
            relation_cap: nz!(4),
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
        miner: MinerOptions::new(nz!(2), nz!(2), positive!(1.0), positive!(1.0)),
        lens: RelationLens::new(
            CoincidentEnergy::new(non_negative!(0.0), positive!(1.0)),
            positive!(0.25),
            positive!(0.5),
        ),
        forward_rows: nz!(3),
    }
}

/// A target corpus carrying one Proximal relation with two instances, so rows {2, 3, 6, 7}
/// stay force-free for the gauge draw.
pub(super) fn target_corpus() -> Corpus {
    corpus_with(
        &[proximal_policy(RELATION)],
        vec![instance(0, RELATION, 0, 4), instance(1, RELATION, 1, 5)],
        vec![proximal_verdict()],
        AttractionOptions::default(),
    )
}

/// The target objective's draw-side fixtures, owned so the trainer inputs can borrow them.
pub(super) struct TargetDraws {
    pub gauge_rows: Vec<NodeRowId>,
    pub gauge_classes: Vec<DuplicateClassId>,
    pub strata: Vec<StratumId>,
    pub held_out: Vec<NodeRowId>,
    pub matched_controls: Vec<NodeRowId>,
}

/// The fixture split rule's content digest.
pub(super) fn split_digest() -> Sha256Digest {
    Sha256Digest::of(b"fixture split rule")
}

pub(super) fn target_draws() -> TargetDraws {
    TargetDraws {
        gauge_rows: [2, 3, 6, 7].map(NodeRowId::new).to_vec(),
        gauge_classes: [0, 1, 2, 3].map(DuplicateClassId::new).to_vec(),
        // One covariate stratum per semantic cluster.
        strata: (0..ROWS)
            .map(|row| StratumId::new(u32::from(!first_cluster(row))))
            .collect(),
        // Force and gauge claim every fixture row, so the fixture split declares empty
        // reference populations.
        held_out: Vec::new(),
        matched_controls: Vec::new(),
    }
}

pub(super) fn target_inputs<'run>(
    corpus: &'run Corpus,
    draws: &'run TargetDraws,
    declared: TargetOptions,
) -> TrainerInputs<'run, NodeRowId, EdgeRowId> {
    TrainerInputs {
        target: Some(TargetInputs {
            options: declared,
            gauge: GaugeDraw::new(&draws.gauge_rows, &draws.gauge_classes),
            strata: IdSlice::from_raw(&draws.strata),
            split: TargetSplit {
                digest: split_digest(),
                held_out: &draws.held_out,
                matched_controls: &draws.matched_controls,
            },
        }),
        ..corpus.inputs()
    }
}

pub(super) const fn target_options(activation: f32) -> TargetOptions {
    TargetOptions {
        canonical_step: nz!(2),
        activation: NonNegative::new(activation).expect("fixture activations are non-negative"),
        dimensionless_radius: positive!(0.5),
        epsilon_rel: positive!(0.001),
        scale_quantile: PositiveUnitFraction::new(0.25)
            .expect("the fixture quantile is a positive unit fraction"),
        epsilon_floor: None,
        margin: non_negative!(0.25),
        gauge_spread_factor: None,
        minimum_effective_count: None,
        residual_bar: None,
        penalty: Penalty::QuadraticHinge,
        unit_law: UnitLaw::PerLinkInstance,
    }
}
