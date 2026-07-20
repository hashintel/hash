//! Certificates for the training-step machinery: deterministic seeded
//! draws, estimator scales, batch-local re-indexing, hand-computed
//! objective fields verified through autodiff, budget-clip wiring, and
//! the reporting buckets.

#![expect(
    clippy::float_cmp,
    reason = "dyadic fixture values compute exactly in f32 and bit-exact assertions are the \
              contract"
)]

use alloc::collections::BTreeMap;
use core::num::NonZero;

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    module::{Module as _, ModuleMapper, ModuleVisitor, Param, ParamId},
    tensor::{Tensor, TensorData, backend::AutodiffBackend},
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    BatchPlan, Coefficients, ObjectiveOptions, StepError,
    batch::{Batch, BatchSampler, NodeColumns, Populations, ROW_ALIGNMENT, SupportAnchor},
    metrics::{
        BudgetBreakdown, DegreeDeciles, DisplacementHistogram, DisplacementSummary,
        TypeParticipants,
    },
    step::evaluate,
};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId, PROJECTOR_DIMENSIONS},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, Vec2},
    salt::{
        policy::ClassProbabilities,
        projector::{
            budget::BudgetOptions,
            loss::{
                AffinityEnergy, BatchPair, BatchRowId, CoincidentEnergy, ProximalEnergy,
                RelationEnergy, SupportOptions,
            },
            miner::{HardNegativeMiner, MinerOptions, SpatialField},
            model::{Architecture, NodeRole, Projector},
            sample::SampledRelationEdges,
            scale::LocalScales,
        },
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::AttractionOptions,
            protection::{NodePair, ProtectionConfig},
        },
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

type TestBackend = Autodiff<NdArray>;

fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

fn pair(one: u64, other: u64) -> NodePair {
    NodePair::new(NodeRowId::new(one), NodeRowId::new(other))
}

/// A batch-local pair, for asserting re-indexed populations.
fn local(one: u32, other: u32) -> BatchPair {
    BatchPair::new(BatchRowId::new(one), BatchRowId::new(other))
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
    }
}

fn relation_indexes(
    rows: usize,
    policies: &[RelationPolicy],
    mut instances: Vec<RelationInstance>,
) -> RelationIndexes {
    RelationIndexes::build(
        rows,
        Policies::new(policies).expect("the fixture policies are certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture instances satisfy the input contract")
}

/// The affinity energy of the dyadic fixtures: `a = 1, b = 1,
/// epsilon = 0.5`, so at squared distance one both logarithm arguments
/// are exactly one (zero value) and the derivative mass is exactly
/// `0.25`.
fn affinity() -> AffinityEnergy {
    AffinityEnergy::new(
        AffinityCurve::new(1.0, 1.0).expect("the fixture curve is valid"),
        0.5,
    )
    .expect("the fixture epsilon is valid")
}

/// The relation energy of the dyadic fixtures: Proximal radius one at
/// temperature one half, so `z = 1` sits exactly on the radius with
/// derivative `sigmoid(0) = 0.5`; the scale guard is `0.5` so unit
/// normalization comes from local scales of `0.5`.
fn relation_energy() -> RelationEnergy {
    RelationEnergy::new(
        CoincidentEnergy::new(0.25, 1.0).expect("the fixture coincident energy is valid"),
        ProximalEnergy::new(1.0, 0.5).expect("the fixture proximal energy is valid"),
        0.5,
    )
    .expect("the fixture radii are ordered")
}

fn support_options() -> SupportOptions {
    SupportOptions::new(1.0, 0.5).expect("the fixture support options are valid")
}

/// Coefficients used by the objective fixtures: `lambda_S = 0.5` pairs
/// with a semantic scale of two for a unit semantic factor, and
/// `lambda_N = 2` doubles the ordinary term so the two families are
/// distinguishable in the combined field.
fn coefficients() -> Coefficients {
    Coefficients::new(0.5, 2.0, 1.0, 1.0, 1.0, 1.0).expect("the fixture coefficients are valid")
}

fn options(relation: Option<RelationEnergy>, budget: BudgetOptions) -> ObjectiveOptions {
    ObjectiveOptions {
        affinity: affinity(),
        relation,
        support: support_options(),
        budget,
        coefficients: coefficients(),
    }
}

fn loose_budget() -> BudgetOptions {
    BudgetOptions::new(100.0, 100.0, 0.25, 1.0e-12).expect("the fixture budget is valid")
}

/// Empty populations to splice fixture families into.
fn empty_populations<'index>(eta: f32) -> Populations<'index> {
    Populations {
        semantic: Vec::new(),
        semantic_scale: 0.0,
        ordinary: Vec::new(),
        ordinary_scale: 0.0,
        hard: Vec::new(),
        hard_scale: 0.0,
        relation: Vec::new(),
        relation_scale: 0.0,
        landmarks: Vec::new(),
        landmark_scale: 0.0,
        anchors: Vec::new(),
        anchor_scale: 0.0,
        eta,
    }
}

/// A coordinate leaf on the autodiff test backend.
fn leaf(coordinates: &[f32], rows: usize) -> Tensor<TestBackend, 2> {
    Tensor::from_data(
        TensorData::new(coordinates.to_vec(), [rows, 2]),
        &NdArrayDevice::default(),
    )
    .require_grad()
}

/// Runs the objective on a leaf and returns its gradient, flattened.
fn leaf_gradient(
    coordinates: &[f32],
    batch: &Batch,
    options: &ObjectiveOptions,
    deciles: &DegreeDeciles,
    metrics: &mut BudgetBreakdown,
) -> Vec<f32> {
    let leaf = leaf(coordinates, batch.rows.len());
    let objective =
        evaluate(leaf.clone(), batch, options, deciles, metrics).expect("the fixture is finite");
    let gradients = objective.surrogate.backward();
    leaf.grad(&gradients)
        .expect("the surrogate reaches the coordinate leaf")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinate gradients are f32")
}

/// Deciles over an index that does not touch the objective fixtures.
fn unused_deciles() -> DegreeDeciles {
    let indexes = relation_indexes(2, &[proximal_policy(3)], vec![instance(0, 3, 0, 1)]);
    DegreeDeciles::new(&indexes.attraction, 2)
}

#[test]
fn coefficients_reject_invalid_values() {
    assert!(Coefficients::new(1.0, 0.0, 0.0, 0.0, 0.0, 0.0).is_some());
    assert!(
        Coefficients::new(0.0, 1.0, 1.0, 1.0, 1.0, 1.0).is_none(),
        "a zero semantic coefficient leaves nothing to budget against"
    );
    assert!(Coefficients::new(1.0, -0.5, 0.0, 0.0, 0.0, 0.0).is_none());
    assert!(Coefficients::new(1.0, f32::NAN, 0.0, 0.0, 0.0, 0.0).is_none());
    assert!(Coefficients::new(f32::INFINITY, 0.0, 0.0, 0.0, 0.0, 0.0).is_none());
}

#[test]
fn degree_deciles_rank_participating_rows() {
    // One relation with edges (0,1), (0,2), (0,3), (4,5) over seven
    // rows: row 0 has degree three, rows 1-5 degree one, row 6 none.
    // Participating degrees sorted: [1, 1, 1, 1, 1, 3], n = 6. Rank of
    // degree 1 is 5 (entries at or below), so its decile is
    // (5-1)*10/6 = 6; rank of degree 3 is 6, decile (6-1)*10/6 = 8.
    let indexes = relation_indexes(
        7,
        &[proximal_policy(11)],
        vec![
            instance(0, 11, 0, 1),
            instance(1, 11, 0, 2),
            instance(2, 11, 0, 3),
            instance(3, 11, 4, 5),
        ],
    );
    let deciles = DegreeDeciles::new(&indexes.attraction, 7);

    assert_eq!(deciles.decile(0), Some(8));
    for row in 1..=5 {
        assert_eq!(deciles.decile(row), Some(6), "row {row}");
    }
    assert_eq!(deciles.decile(6), None, "no attraction evidence");
}

#[test]
fn draws_are_deterministic_at_a_fixed_seed() {
    let graph = semantic_graph(6, &[(0, 1, 0.5), (1, 2, 0.25), (2, 3, 1.0)]);
    let indexes = relation_indexes(
        6,
        &[proximal_policy(7), proximal_policy(9)],
        vec![instance(0, 7, 0, 1), instance(1, 9, 4, 5)],
    );
    let plan = BatchPlan {
        semantic_pairs: NonZero::new(8).expect("eight is non-zero"),
        ordinary_pairs: 4,
        relation_types: 1,
        relation_cap: NonZero::new(4).expect("four is non-zero"),
        hard_queries: 0,
        landmark_anchors: 0,
        temporal_anchors: 0,
    };
    let sampler = BatchSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
        &indexes.attraction,
        plan,
    )
    .expect("the fixture graph has weight");

    let draw = |seed: u64| sampler.draw(1.0, None, &[], &[], &mut rng(seed));
    let (first, second) = (draw(17), draw(17));

    assert_eq!(first.semantic, second.semantic);
    assert_eq!(first.ordinary, second.ordinary);
    assert_eq!(
        first
            .relation
            .iter()
            .map(|sampled| (sampled.group.relation().get(), sampled.edges.clone()))
            .collect::<Vec<_>>(),
        second
            .relation
            .iter()
            .map(|sampled| (sampled.group.relation().get(), sampled.edges.clone()))
            .collect::<Vec<_>>(),
    );
    assert_ne!(
        draw(17).semantic,
        draw(19).semantic,
        "different seeds should draw different batches"
    );
}

#[test]
fn draw_skips_the_relation_family_at_a_zero_rung() {
    let graph = semantic_graph(4, &[(0, 1, 0.5)]);
    let indexes = relation_indexes(4, &[proximal_policy(7)], vec![instance(0, 7, 2, 3)]);
    let plan = BatchPlan {
        semantic_pairs: NonZero::new(4).expect("four is non-zero"),
        ordinary_pairs: 0,
        relation_types: 1,
        relation_cap: NonZero::new(4).expect("four is non-zero"),
        hard_queries: 0,
        landmark_anchors: 0,
        temporal_anchors: 0,
    };
    let sampler = BatchSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
        &indexes.attraction,
        plan,
    )
    .expect("the fixture graph has weight");

    let at_zero = sampler.draw(0.0, None, &[], &[], &mut rng(3));
    assert!(at_zero.relation.is_empty());
    assert_eq!(at_zero.relation_scale, 0.0);

    let at_one = sampler.draw(1.0, None, &[], &[], &mut rng(3));
    assert_eq!(at_one.relation.len(), 1);
}

#[test]
fn draw_computes_the_estimator_scales() {
    // The symmetric graph stores each undirected edge twice: total
    // weight W = 2 * (0.5 + 0.25 + 1.0) = 3.5 exactly.
    let graph = semantic_graph(4, &[(0, 1, 0.5), (1, 2, 0.25), (2, 3, 1.0)]);
    let indexes = relation_indexes(
        4,
        &[proximal_policy(7), proximal_policy(9)],
        vec![instance(0, 7, 0, 1), instance(1, 9, 2, 3)],
    );
    let plan = BatchPlan {
        semantic_pairs: NonZero::new(8).expect("eight is non-zero"),
        ordinary_pairs: 4,
        relation_types: 1,
        relation_cap: NonZero::new(4).expect("four is non-zero"),
        hard_queries: 0,
        landmark_anchors: 2,
        temporal_anchors: 0,
    };
    let sampler = BatchSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
        &indexes.attraction,
        plan,
    )
    .expect("the fixture graph has weight");

    let landmarks = [
        SupportAnchor {
            row: NodeRowId::new(0),
            target: Vec2::new(0.0, 0.0),
            radius: 1.0,
            weight: 1.0,
        },
        SupportAnchor {
            row: NodeRowId::new(1),
            target: Vec2::new(1.0, 0.0),
            radius: 1.0,
            weight: 1.0,
        },
        SupportAnchor {
            row: NodeRowId::new(2),
            target: Vec2::new(2.0, 0.0),
            radius: 1.0,
            weight: 1.0,
        },
    ];
    let populations = sampler.draw(1.0, None, &landmarks, &[], &mut rng(5));

    // W / m = 3.5 / 8 exactly.
    assert_eq!(populations.semantic.len(), 8);
    assert_eq!(populations.semantic_scale, 0.4375);

    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture draw counts are tiny exact integers"
    )]
    let expected = 3.5 / populations.ordinary.len() as f32;
    assert!(!populations.ordinary.is_empty());
    assert_eq!(populations.ordinary_scale, expected);

    // One of two groups drawn: G / g = 2.
    assert_eq!(populations.relation.len(), 1);
    assert_eq!(populations.relation_scale, 2.0);

    // Two of three landmarks drawn: 3 / 2 = 1.5.
    assert_eq!(populations.landmarks.len(), 2);
    assert_eq!(populations.landmark_scale, 1.5);

    // No mined frame yet: the family is empty.
    assert!(populations.hard.is_empty());
    assert_eq!(populations.hard_scale, 0.0);
}

#[test]
fn draw_collects_pooled_mined_pairs() {
    let graph = semantic_graph(4, &[(0, 1, 0.5)]);
    let indexes = relation_indexes(4, &[proximal_policy(7)], vec![instance(0, 7, 2, 3)]);

    // A line frame mined exhaustively: with every row drawn as a
    // query, the drawn pairs are exactly the frame's and the
    // estimator scale is one.
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(2.0, 0.0),
        Vec2::new(3.0, 0.0),
    ];
    let field = SpatialField::new(&coordinates).expect("the fixture frame is finite");
    let miner = HardNegativeMiner::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
        MinerOptions::new(
            NonZero::new(2).expect("two is non-zero"),
            NonZero::new(2).expect("two is non-zero"),
            1.0,
            1.0,
        )
        .expect("the fixture miner options are valid"),
    );
    let frame = miner.mine(&field);

    let plan = BatchPlan {
        semantic_pairs: NonZero::new(4).expect("four is non-zero"),
        ordinary_pairs: 0,
        relation_types: 0,
        relation_cap: NonZero::new(1).expect("one is non-zero"),
        hard_queries: 4,
        landmark_anchors: 0,
        temporal_anchors: 0,
    };
    let sampler = BatchSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
        &indexes.attraction,
        plan,
    )
    .expect("the fixture graph has weight");

    let populations = sampler.draw(0.0, Some(&frame), &[], &[], &mut rng(11));

    let mut expected: Vec<(u64, u64, u32)> = (0..frame.rows())
        .flat_map(|row| frame.row(row))
        .map(|(pair, weight)| (pair.first().get(), pair.second().get(), weight.to_bits()))
        .collect();
    expected.sort_unstable();
    let mut drawn: Vec<(u64, u64, u32)> = populations
        .hard
        .iter()
        .map(|&(pair, weight)| (pair.first().get(), pair.second().get(), weight.to_bits()))
        .collect();
    drawn.sort_unstable();

    assert!(!drawn.is_empty(), "the exhaustive draw mines pairs");
    assert_eq!(drawn, expected);
    assert_eq!(populations.hard_scale, 1.0);
}

#[test]
fn assemble_reindexes_into_the_local_domain() {
    // Corpus rows {2, 5, 9} participate; ascending order maps them to
    // locals {0, 1, 2}.
    let mut populations = empty_populations(0.0);
    populations.semantic = vec![pair(5, 9)];
    populations.semantic_scale = 1.0;
    populations.ordinary = vec![pair(2, 9)];
    populations.ordinary_scale = 1.0;
    populations.landmarks = vec![SupportAnchor {
        row: NodeRowId::new(5),
        target: Vec2::new(0.25, -0.5),
        radius: 1.0,
        weight: 1.0,
    }];
    populations.landmark_scale = 1.0;

    // Scale table over ten corpus rows, row r holding r / 2.
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture rows are tiny exact integers"
    )]
    let table = LocalScales::new((0..10).map(|row| row as f32 * 0.5).collect())
        .expect("the fixture scales are finite");

    let batch = Batch::assemble(populations, Some(&table));

    let rows: Vec<u64> = batch.rows.iter().map(|row| row.get()).collect();
    assert_eq!(rows, [2, 5, 9]);
    assert_eq!(batch.semantic, [local(1, 2)]);
    assert_eq!(batch.ordinary, [local(0, 2)]);
    assert_eq!(batch.landmarks[0].row.get(), 1);
    let gathered = batch.scales.expect("the table was supplied");
    assert_eq!(gathered.as_slice(), [1.0, 2.5, 4.5]);
}

#[test]
#[should_panic(expected = "relation edges need the rung's local scales")]
fn assemble_rejects_relation_edges_without_scales() {
    let indexes = relation_indexes(2, &[proximal_policy(7)], vec![instance(0, 7, 0, 1)]);
    let group = &indexes.attraction.groups()[0];

    let mut populations = empty_populations(1.0);
    populations.relation = vec![SampledRelationEdges {
        group,
        edges: group.edges().to_vec(),
    }];
    populations.relation_scale = 1.0;

    drop(Batch::assemble(populations, None));
}

#[test]
fn objective_matches_the_hand_computed_semantic_field() {
    // Rows {0..3}: a semantic pair (0, 1) and an ordinary pair (2, 3),
    // both at unit distance. With the dyadic affinity the values are
    // exactly zero and the derivative mass is exactly 0.25 per pair.
    //
    // Semantic factor: lambda_S * scale = 0.5 * 2 = 1, so the pair
    // gradient is difference * (2 * 1 * 0.25) = (-0.5, 0) at row 0.
    // Ordinary factor: lambda_N * scale = 2 * 1 = 2, so the pair
    // gradient is (0, -1) * (2 * 2 * -0.25) = (0, 1) at row 2.
    //
    // Surrogate: <y1, g1> + <y3, g3> = 0.5 - 1 = -0.5 exactly.
    let mut populations = empty_populations(0.0);
    populations.semantic = vec![pair(0, 1)];
    populations.semantic_scale = 2.0;
    populations.ordinary = vec![pair(2, 3)];
    populations.ordinary_scale = 1.0;
    let batch = Batch::assemble(populations, None);

    let coordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
    let deciles = unused_deciles();
    let mut metrics = BudgetBreakdown::new();
    let options = options(None, loose_budget());

    let objective = evaluate(
        leaf(&coordinates, 4),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    )
    .expect("the fixture is finite");
    assert_eq!(objective.loss.semantic, 0.0);
    assert_eq!(objective.loss.ordinary, 0.0);
    assert_eq!(objective.loss.total(), 0.0);
    assert_eq!(objective.surrogate.into_scalar(), -0.5);

    let gradient = leaf_gradient(&coordinates, &batch, &options, &deciles, &mut metrics);
    assert_eq!(gradient, [-0.5, 0.0, 0.5, 0.0, 0.0, 1.0, 0.0, -1.0]);

    // No relation edges: nothing is budgeted or recorded.
    assert_eq!(metrics.overall().nodes(), 0);
}

/// The relation fixture: rows {0, 1} at unit distance, one semantic
/// pair, and one single-edge Proximal group whose hand factors are
/// exactly `c = 1`, `nu = 0.5`, class weights `(0, 1)`, strength one.
fn relation_fixture() -> (RelationIndexes, LocalScales) {
    let indexes = relation_indexes(2, &[proximal_policy(7)], vec![instance(0, 7, 0, 1)]);
    let scales =
        LocalScales::new(vec![0.5, 0.5].into_boxed_slice()).expect("the fixture scales are finite");
    (indexes, scales)
}

fn relation_batch(indexes: &RelationIndexes, scales: &LocalScales, eta: f32) -> Batch {
    let group = &indexes.attraction.groups()[0];

    // Pin the hand-derivation's fixture facts before using them.
    let weights = group.weights();
    assert_eq!(weights.coincident, 0.0);
    assert_eq!(weights.proximal, 1.0);
    assert_eq!(weights.strength, 1.0);
    let edge = group.edges()[0];
    assert_eq!(edge.confidence.value(), 1.0);
    assert_eq!(edge.degree_normalization, 0.5);

    let mut populations = empty_populations(eta);
    populations.semantic = vec![pair(0, 1)];
    populations.semantic_scale = 2.0;
    populations.relation = vec![SampledRelationEdges {
        group,
        edges: group.edges().to_vec(),
    }];
    populations.relation_scale = 2.0;
    Batch::assemble(populations, Some(scales))
}

#[test]
fn objective_clips_the_relation_field_and_records_the_buckets() {
    // Coordinates (0,0), (1,0): d = 1, local scales 0.5 with guard 0.5
    // give unit normalization, z = 1 on the Proximal radius.
    //
    // Semantic gradient at row 0: (-0.5, 0), norm 0.5 = baseline.
    // Relation factor: eta * lambda_R * scale * c * nu * strength
    // = 1 * 1 * 2 * 1 * 0.5 * 1 = 1; gradient = difference *
    // (factor * sigmoid(0) / (d * norm)) = (-0.5, 0), norm 0.5.
    //
    // Budget beta_+ = beta_R = 0.5, floor 0.25: positive factor
    // = 0.5 * 0.5 / 0.5 = 0.5 exactly (the epsilon vanishes in f32),
    // clipped norm 0.25, total factor exactly 1. Applied relation
    // gradient (-0.25, 0); combined (-0.75, 0).
    let (indexes, scales) = relation_fixture();
    let batch = relation_batch(&indexes, &scales, 1.0);
    let coordinates = [0.0, 0.0, 1.0, 0.0];
    let deciles = DegreeDeciles::new(&indexes.attraction, 2);
    let mut metrics = BudgetBreakdown::new();
    let budget = BudgetOptions::new(0.5, 0.5, 0.25, 1.0e-12).expect("the budget is valid");
    let options = options(Some(relation_energy()), budget);

    let gradient = leaf_gradient(&coordinates, &batch, &options, &deciles, &mut metrics);
    assert_eq!(gradient, [-0.75, 0.0, 0.75, 0.0]);

    // Both endpoints were clipped by the positive branch and the
    // trailing cap stayed inactive.
    assert_eq!(metrics.overall().nodes(), 2);
    assert_eq!(metrics.overall().clipped_fraction(), Some(1.0));
    assert_eq!(metrics.overall().capped_fraction(), Some(0.0));
    assert_eq!(metrics.overall().mean_cap_factor(), Some(1.0));
    // Unclipped ratio 0.5 / 0.5 = 1; applied ratio 0.25 / 0.5 = 0.5.
    assert_eq!(metrics.overall().mean_unclipped_ratio(), Some(1.0));
    assert_eq!(metrics.overall().mean_clipped_ratio(), Some(0.5));

    // The single relation type owns both node contributions.
    let types: Vec<_> = metrics.types().collect();
    assert_eq!(types.len(), 1);
    assert_eq!(types[0].0.get(), 7);
    assert_eq!(types[0].1.nodes(), 2);
    assert_eq!(types[0].1.mean_unclipped_ratio(), Some(1.0));
    assert_eq!(types[0].1.mean_clipped_ratio(), Some(0.5));

    // Both endpoints have attraction degree one: rank 2 of 2
    // participating rows, decile (2-1)*10/2 = 5.
    assert_eq!(metrics.deciles()[5].nodes(), 2);
}

#[test]
fn objective_reports_the_relation_loss_value() {
    // The relation value is factor * proximal weight * temperature *
    // softplus(0) = 1 * 1 * 0.5 * ln 2.
    let (indexes, scales) = relation_fixture();
    let batch = relation_batch(&indexes, &scales, 1.0);
    let deciles = DegreeDeciles::new(&indexes.attraction, 2);
    let mut metrics = BudgetBreakdown::new();
    let options = options(Some(relation_energy()), loose_budget());

    let objective = evaluate(
        leaf(&[0.0, 0.0, 1.0, 0.0], 2),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    )
    .expect("the fixture is finite");

    let expected = 0.5 * core::f32::consts::LN_2;
    assert!(
        (objective.loss.relation - expected).abs() < 1.0e-6,
        "relation loss {} against {expected}",
        objective.loss.relation
    );
    assert_eq!(objective.loss.semantic, 0.0);
}

#[test]
fn relation_gradients_are_linear_in_the_lens() {
    // With the clip inactive, the relation share of the combined field
    // is eta * (-0.5, 0) at row 0: exactly (-0.5 - eta/2, 0) combined.
    let (indexes, scales) = relation_fixture();
    let coordinates = [0.0, 0.0, 1.0, 0.0];
    let deciles = DegreeDeciles::new(&indexes.attraction, 2);
    let options = options(Some(relation_energy()), loose_budget());

    let gradient_at = |eta: f32| {
        let batch = relation_batch(&indexes, &scales, eta);
        let mut metrics = BudgetBreakdown::new();
        leaf_gradient(&coordinates, &batch, &options, &deciles, &mut metrics)
    };

    assert_eq!(gradient_at(0.0), [-0.5, 0.0, 0.5, 0.0]);
    assert_eq!(gradient_at(0.5), [-0.75, 0.0, 0.75, 0.0]);
    assert_eq!(gradient_at(1.0), [-1.0, 0.0, 1.0, 0.0]);
}

#[test]
fn support_terms_ride_autodiff_outside_the_budget() {
    // One landmark holding row 1 at (2, 0) while it sits at (1, 0):
    // residual d = 1 smoothed to sqrt(1.25) - 0.5, normalized by
    // radius 0.5 + epsilon 0.5 = 1, inside the unit Huber threshold.
    // Its gradient flows through autodiff; row 0 keeps exactly its
    // semantic gradient, certifying the seam separation.
    let mut populations = empty_populations(0.0);
    populations.semantic = vec![pair(0, 1)];
    populations.semantic_scale = 2.0;
    populations.landmarks = vec![SupportAnchor {
        row: NodeRowId::new(1),
        target: Vec2::new(2.0, 0.0),
        radius: 0.5,
        weight: 1.0,
    }];
    populations.landmark_scale = 1.0;
    let batch = Batch::assemble(populations, None);

    let coordinates = [0.0, 0.0, 1.0, 0.0];
    let deciles = unused_deciles();
    let mut metrics = BudgetBreakdown::new();
    let options = options(None, loose_budget());

    let objective = evaluate(
        leaf(&coordinates, 2),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    )
    .expect("the fixture is finite");
    assert!(
        objective.loss.landmark > 0.0,
        "the displaced landmark pays a positive support loss"
    );

    let gradient = leaf_gradient(&coordinates, &batch, &options, &deciles, &mut metrics);
    assert_eq!(
        &gradient[0..2],
        [-0.5, 0.0],
        "the un-anchored row keeps its exact semantic gradient"
    );
    assert!(
        gradient[2] < 0.5,
        "the anchor pulls row 1 toward its target against the semantic push"
    );
}

#[test]
fn evaluate_rejects_non_finite_coordinates() {
    let mut populations = empty_populations(0.0);
    populations.semantic = vec![pair(0, 1)];
    populations.semantic_scale = 1.0;
    let batch = Batch::assemble(populations, None);

    let deciles = unused_deciles();
    let mut metrics = BudgetBreakdown::new();
    let options = options(None, loose_budget());

    let result = evaluate(
        leaf(&[0.0, 0.0, f32::NAN, 0.0], 2),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    );
    assert_eq!(
        result.err().map(|error| match error {
            StepError::Diverged { row } => row.get(),
        }),
        Some(1)
    );
}

#[test]
fn displacement_histogram_buckets_by_exponent() {
    // Buckets are f32 biased exponents: 0.5 -> 126, 1.0 and 1.5 ->
    // 127, 2.0 -> 128, exact zero -> 0. The moments are dyadic sums:
    // 0.25 + 1 + 2.25 + 4 = 7.5 for the squares.
    let mut histogram = DisplacementHistogram::default();
    for displacement in [0.0, 0.5, 1.0, 1.5, 2.0] {
        histogram.record(displacement);
    }

    assert_eq!(histogram.counts()[0], 1);
    assert_eq!(histogram.counts()[126], 1);
    assert_eq!(histogram.counts()[127], 2);
    assert_eq!(histogram.counts()[128], 1);
    assert_eq!(histogram.counts().iter().sum::<u64>(), 5);

    let moments = histogram.moments();
    assert_eq!(moments.count(), 5);
    assert_eq!(moments.sum(), 5.0);
    assert_eq!(moments.sum_squares(), 7.5);
    assert_eq!(moments.maximum(), 2.0);
}

#[test]
fn type_participants_deduplicate_and_order_rows() {
    let indexes = relation_indexes(
        4,
        &[proximal_policy(7), proximal_policy(9)],
        vec![
            instance(0, 9, 2, 3),
            instance(1, 7, 0, 1),
            instance(2, 7, 0, 2),
            instance(3, 7, 1, 2),
        ],
    );

    let participants = TypeParticipants::new(&indexes.attraction);
    let collected: Vec<(u64, Vec<usize>)> = participants
        .iter()
        .map(|(relation, rows)| (relation.get(), rows.to_vec()))
        .collect();
    assert_eq!(
        collected,
        [(7, vec![0, 1, 2]), (9, vec![2, 3])],
        "rows deduplicate within a type and types ascend by ontology row"
    );
}

#[test]
fn displacement_summary_reports_every_axis() {
    // Rows 0 and 1 participate in relation 11 (degree one each, upper
    // rank two of two participants: decile (2-1)*10/2 = 5); row 2 has
    // no attraction evidence and lands in the overall bucket only.
    // Displacements: row 0 moves by exactly 1, row 1 not at all, and
    // row 2 by exactly 5 (a 3-4-5 triangle).
    let indexes = relation_indexes(3, &[proximal_policy(11)], vec![instance(0, 11, 0, 1)]);
    let deciles = DegreeDeciles::new(&indexes.attraction, 3);
    let participants = TypeParticipants::new(&indexes.attraction);

    let low = [Vec2::splat(0.0), Vec2::splat(0.0), Vec2::splat(0.0)];
    let high = [Vec2::new(1.0, 0.0), Vec2::splat(0.0), Vec2::new(3.0, 4.0)];
    let summary = DisplacementSummary::measure(&low, &high, &participants, &deciles);

    let overall = summary.overall();
    assert_eq!(overall.moments().count(), 3);
    assert_eq!(overall.moments().sum(), 6.0);
    assert_eq!(overall.moments().maximum(), 5.0);
    assert_eq!(overall.counts()[0], 1, "the still row");
    assert_eq!(overall.counts()[127], 1, "the unit displacement");
    assert_eq!(overall.counts()[129], 1, "five lies in [4, 8)");

    let decile = &summary.deciles()[5];
    assert_eq!(
        decile.moments().count(),
        2,
        "only participating rows carry a decile"
    );
    assert_eq!(decile.moments().maximum(), 1.0);

    let types: Vec<(u64, u64, f64, f32)> = summary
        .types()
        .map(|(relation, moments)| {
            (
                relation.get(),
                moments.count(),
                moments.sum(),
                moments.maximum(),
            )
        })
        .collect();
    assert_eq!(
        types,
        [(11, 2, 1.0, 1.0)],
        "the type bucket covers its participants' displacements"
    );
}

/// Corpus rows of the padding fixtures.
///
/// Exactly 32 rows participate in the gradient certificate's batch:
/// at 32 every tensor of both the padded and the unpadded graph
/// reaches the CPU backend's SIMD dispatch threshold, so both graphs
/// compute with the same element-wise kernels. Below it the dispatch
/// is mixed and the comparison measures the backend's reciprocal
/// estimate (the SIMD reciprocal is a hardware approximation that the
/// autodiff division backward consumes), not the padding.
const PADDING_ROWS: usize = 32;
const PADDING_CAPACITY: usize = PADDING_ROWS * PROJECTOR_DIMENSIONS;

/// Builds the padding fixtures' input columns: distinct dyadic
/// representations and cycled roles over [`PADDING_ROWS`] corpus rows.
fn padding_columns() -> (BoxedVecN<PADDING_CAPACITY>, Vec<NodeRole>) {
    let mut storage = BoxedVecN::zero();
    let array = storage.as_array_mut();
    for row in 0..PADDING_ROWS {
        let value = f32::from(u8::try_from(row).expect("fixture rows fit u8")).mul_add(0.25, 0.25);
        let base = row * PROJECTOR_DIMENSIONS;
        array[base] = value;
        array[base + 1] = -0.5 * value;
        array[base + 8 + row] = 0.125;
    }
    let roles = [
        NodeRole::KnowledgeEntity,
        NodeRole::OntologyType,
        NodeRole::Other,
    ]
    .into_iter()
    .cycle()
    .take(PADDING_ROWS)
    .collect();
    (storage, roles)
}

/// Borrows the padding fixtures' columns.
fn padding_column_view<'corpus>(
    storage: &'corpus BoxedVecN<PADDING_CAPACITY>,
    roles: &'corpus [NodeRole],
) -> NodeColumns<'corpus> {
    NodeColumns {
        representations: AlignedVecN::from_slice(&storage.as_array()[..PADDING_CAPACITY])
            .expect("boxed storage is aligned"),
        roles,
    }
}

/// Nudges every parameter off its initialization.
///
/// The identity-contract layers initialize to zero and would block
/// gradient flow into the deep block parameters, leaving the padding
/// certificate comparing zeros with zeros; a deterministic ramp makes
/// every parameter's gradient generically nonzero.
struct Perturb;

impl ModuleMapper<TestBackend> for Perturb {
    fn map_float<const D: usize>(
        &mut self,
        param: Param<Tensor<TestBackend, D>>,
    ) -> Param<Tensor<TestBackend, D>> {
        let (id, tensor, mapper) = param.consume();
        let elements = tensor.shape().num_elements();
        let ramp = (0..elements)
            .map(|index| {
                #[expect(
                    clippy::cast_precision_loss,
                    reason = "test parameter counts are tiny and exactly representable"
                )]
                let index = index as f32;
                index.mul_add(0.03125, 0.0625)
            })
            .collect::<Vec<_>>();
        let shape = tensor.shape();
        let device = tensor.device();
        let ramp = Tensor::from_data(TensorData::new(ramp, shape), &device);
        // The sum is an interior autodiff node; re-rooting it as a
        // required-gradient leaf is what lets gradients accumulate at
        // the perturbed parameter.
        Param::from_mapped_value(id, (tensor + ramp).detach().require_grad(), mapper)
    }
}

/// Collects every parameter gradient a backward pass produced.
struct GradientCollector<'graph> {
    gradients: &'graph <TestBackend as AutodiffBackend>::Gradients,
    collected: BTreeMap<ParamId, Vec<f32>>,
}

impl ModuleVisitor<TestBackend> for GradientCollector<'_> {
    fn visit_float<const D: usize>(&mut self, param: &Param<Tensor<TestBackend, D>>) {
        if let Some(gradient) = param.val().grad(self.gradients) {
            self.collected.insert(
                param.id,
                gradient
                    .into_data()
                    .to_vec()
                    .expect("gradients should convert to f32 values"),
            );
        }
    }
}

fn parameter_gradients(
    model: &Projector<TestBackend>,
    gradients: &<TestBackend as AutodiffBackend>::Gradients,
) -> BTreeMap<ParamId, Vec<f32>> {
    let mut collector = GradientCollector {
        gradients,
        collected: BTreeMap::new(),
    };
    model.visit(&mut collector);
    collector.collected
}

#[test]
fn input_pads_the_gathered_rows_to_the_alignment() {
    // Rows {0, 1, 2, 5} participate: four rows pad to the alignment,
    // and the padded tail replicates corpus row 5 - representation,
    // role, and rung alike. Alignment one is the unpadded frame.
    let mut populations = empty_populations(0.5);
    populations.semantic = vec![pair(0, 2)];
    populations.semantic_scale = 2.0;
    populations.ordinary = vec![pair(1, 5)];
    populations.ordinary_scale = 1.0;
    let batch = Batch::assemble(populations, None);
    assert_eq!(batch.rows.len(), 4);

    let (storage, roles) = padding_columns();
    let columns = padding_column_view(&storage, &roles);
    let device = NdArrayDevice::default();

    let plain = batch.input_aligned::<TestBackend>(
        columns,
        &device,
        NonZero::new(1).expect("one is non-zero"),
    );
    assert_eq!(plain.representation.dims(), [4, PROJECTOR_DIMENSIONS]);
    assert_eq!(plain.roles.dims(), [4]);
    assert_eq!(plain.condition.dims(), [4, 1]);

    let input = batch.input::<TestBackend>(columns, &device);
    let padded = 4_usize.next_multiple_of(ROW_ALIGNMENT.get());
    assert_eq!(input.representation.dims(), [padded, PROJECTOR_DIMENSIONS]);
    assert_eq!(input.roles.dims(), [padded]);
    assert_eq!(input.condition.dims(), [padded, 1]);

    let representation = input
        .representation
        .into_data()
        .to_vec::<f32>()
        .expect("the representation is an f32 tensor");
    let last = representation[3 * PROJECTOR_DIMENSIONS..4 * PROJECTOR_DIMENSIONS].to_vec();
    for row in 4..padded {
        assert_eq!(
            representation[row * PROJECTOR_DIMENSIONS..(row + 1) * PROJECTOR_DIMENSIONS],
            last[..],
            "padded row {row} should replicate the last participating row"
        );
    }
    let role_values = input
        .roles
        .into_data()
        .to_vec::<i64>()
        .expect("the roles are an integer tensor");
    assert!(role_values[4..].iter().all(|&role| role == role_values[3]));
    let condition = input
        .condition
        .into_data()
        .to_vec::<f32>()
        .expect("the condition is an f32 tensor");
    assert!(condition.iter().all(|&eta| eta == 0.5));
}

#[test]
fn a_padded_frame_adds_zero_force() {
    // The two-row semantic batch against a four-row frame whose tail
    // twins the last row: the loss matches the exact-cover frame and
    // the padded rows receive exactly zero coordinate gradient.
    let mut populations = empty_populations(0.0);
    populations.semantic = vec![pair(0, 1)];
    populations.semantic_scale = 2.0;
    let batch = Batch::assemble(populations, None);

    let deciles = unused_deciles();
    let options = options(None, loose_budget());

    let mut metrics = BudgetBreakdown::new();
    let exact = evaluate(
        leaf(&[0.0, 0.0, 1.0, 0.0], 2),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    )
    .expect("the fixture is finite");

    let mut metrics = BudgetBreakdown::new();
    let padded_leaf = leaf(&[0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0], 4);
    let padded = evaluate(
        padded_leaf.clone(),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    )
    .expect("the fixture is finite");

    assert_eq!(padded.loss, exact.loss);
    let gradient = padded_leaf
        .grad(&padded.surrogate.backward())
        .expect("the surrogate reaches the coordinate leaf")
        .into_data()
        .to_vec::<f32>()
        .expect("coordinate gradients are f32");
    assert_eq!(gradient, [-0.5, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0]);
}

#[test]
#[should_panic(expected = "cover the batch rows")]
fn evaluate_rejects_a_frame_smaller_than_the_batch() {
    let mut populations = empty_populations(0.0);
    populations.semantic = vec![pair(0, 1)];
    populations.semantic_scale = 2.0;
    let batch = Batch::assemble(populations, None);

    let deciles = unused_deciles();
    let options = options(None, loose_budget());
    let mut metrics = BudgetBreakdown::new();
    let _objective = evaluate(
        leaf(&[0.0, 0.0], 1),
        &batch,
        &options,
        &deciles,
        &mut metrics,
    );
}

#[test]
fn padding_leaves_losses_and_parameter_gradients_bit_equal() {
    // Semantic, ordinary, relation, and landmark families all
    // participate, so every loss path crosses the padded frame. The
    // padded and unpadded materializations of the same batch project
    // bit-equal coordinates for the participating rows, evaluate to
    // bit-equal loss values, and deposit bit-equal parameter
    // gradients: the padded rows carry exactly zero force, appended
    // after every real contribution in the backward reductions.
    //
    // The batch covers all [`PADDING_ROWS`] corpus rows so both
    // graphs' tensors clear the CPU backend's SIMD dispatch threshold
    // (see the constant's documentation) - the certificate compares
    // the padding, not the backend's kernel election.
    let device = NdArrayDevice::default();
    let indexes = relation_indexes(
        PADDING_ROWS,
        &[proximal_policy(7)],
        vec![instance(0, 7, 0, 1)],
    );
    let scales = LocalScales::new(vec![0.5; PADDING_ROWS].into_boxed_slice())
        .expect("the fixture scales are finite");
    let group = &indexes.attraction.groups()[0];

    let mut populations = empty_populations(1.0);
    let semantic_pairs = u64::try_from(PADDING_ROWS).expect("fixture rows fit u64") >> 1_u32;
    populations.semantic = (0..semantic_pairs)
        .map(|index| pair(2 * index, 2 * index + 1))
        .collect();
    populations.semantic_scale = 2.0;
    populations.ordinary = vec![pair(0, 2), pair(1, 3)];
    populations.ordinary_scale = 1.0;
    populations.relation = vec![SampledRelationEdges {
        group,
        edges: group.edges().to_vec(),
    }];
    populations.relation_scale = 2.0;
    populations.landmarks = vec![SupportAnchor {
        row: NodeRowId::new(4),
        target: Vec2::new(1.0, 0.0),
        radius: 1.0,
        weight: 1.0,
    }];
    populations.landmark_scale = 1.0;
    let batch = Batch::assemble(populations, Some(&scales));
    assert_eq!(batch.rows.len(), PADDING_ROWS);

    let (storage, roles) = padding_columns();
    let columns = padding_column_view(&storage, &roles);
    let architecture = Architecture {
        width: NonZero::new(8).expect("the width is non-zero"),
        residual_blocks: NonZero::new(1).expect("the block count is non-zero"),
        representation_dimensions: NonZero::new(PROJECTOR_DIMENSIONS)
            .expect("the representation width is non-zero"),
        role_dimensions: NonZero::new(4).expect("the role width is non-zero"),
        condition_dimensions: NonZero::new(1).expect("the condition width is non-zero"),
    };
    let model = Projector::<TestBackend>::new(architecture, rng(7), &device).map(&mut Perturb);

    let deciles = DegreeDeciles::new(&indexes.attraction, PADDING_ROWS);
    let options = options(Some(relation_energy()), loose_budget());

    let padded = model.forward(batch.input(columns, &device));
    let plain = model.forward(batch.input_aligned(
        columns,
        &device,
        NonZero::new(1).expect("one is non-zero"),
    ));
    assert_eq!(
        padded.dims()[0],
        PADDING_ROWS.next_multiple_of(ROW_ALIGNMENT.get())
    );
    assert_eq!(plain.dims()[0], PADDING_ROWS);

    let padded_values = padded
        .clone()
        .inner()
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates are f32");
    let plain_values = plain
        .clone()
        .inner()
        .into_data()
        .to_vec::<f32>()
        .expect("coordinates are f32");
    assert_eq!(
        padded_values[..plain_values.len()],
        plain_values[..],
        "participating rows should project bit-equal coordinates"
    );

    let mut padded_metrics = BudgetBreakdown::new();
    let padded_objective = evaluate(padded, &batch, &options, &deciles, &mut padded_metrics)
        .expect("the fixture is finite");
    let mut plain_metrics = BudgetBreakdown::new();
    let plain_objective = evaluate(plain, &batch, &options, &deciles, &mut plain_metrics)
        .expect("the fixture is finite");

    // Non-vacuous: every family contributes a nonzero loss.
    assert_ne!(padded_objective.loss.semantic, 0.0);
    assert_ne!(padded_objective.loss.ordinary, 0.0);
    assert_ne!(padded_objective.loss.relation, 0.0);
    assert_ne!(padded_objective.loss.landmark, 0.0);
    assert_eq!(padded_objective.loss, plain_objective.loss);
    assert_eq!(
        padded_metrics.overall().nodes(),
        plain_metrics.overall().nodes()
    );

    let padded_gradients = parameter_gradients(&model, &padded_objective.surrogate.backward());
    let plain_gradients = parameter_gradients(&model, &plain_objective.surrogate.backward());
    assert!(!padded_gradients.is_empty());
    assert_eq!(padded_gradients, plain_gradients);
}
