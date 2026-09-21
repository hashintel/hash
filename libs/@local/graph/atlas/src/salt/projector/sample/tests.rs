//! Certificates for the minibatch samplers.
//!
//! Distribution laws, per-type limits under skew, veto admission, and seeded reproducibility.
use std::alloc::Global;

use hashql_core::id::Id as _;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{OrdinaryNegativeSampler, RelationEdgeSampler, SemanticEdgeSampler};
use crate::{
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{NonNegative, nz, unit_fraction},
    salt::{
        policy::ClassProbabilities,
        relation::{
            Policies, RelationConfidence, RelationIndexes, RelationInstance, RelationPolicy,
            attraction::AttractionOptions,
            protection::{ChannelConfig, NodePair, ProtectionConfig},
        },
        semantic::{SemanticGraph, SemanticMatrix},
    },
};

/// Seeds a [`Xoshiro256PlusPlus`] generator from `seed`.
fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

/// A node pair from two literal row numbers.
fn pair(one: u64, other: u64) -> NodePair<NodeRowId> {
    NodePair::new(NodeRowId::new(one), NodeRowId::new(other))
}

/// The `(lhs, rhs)` row numbers of `pairs`, for sorting and comparison.
fn keys(pairs: &[NodePair<NodeRowId>]) -> Vec<(u64, u64)> {
    pairs
        .iter()
        .map(|pair| (pair.lhs().as_u64(), pair.rhs().as_u64()))
        .collect()
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

/// Builds the relation indexes over `rows` from certified `policies` and instances.
///
/// The attraction options are the defaults.
fn relation_indexes(
    rows: usize,
    policies: &[RelationPolicy],
    mut instances: Vec<RelationInstance<NodeRowId, EdgeRowId>>,
) -> RelationIndexes<NodeRowId, EdgeRowId> {
    RelationIndexes::build(
        rows,
        Policies::new(policies).expect("the fixture policies are certified"),
        &mut instances,
        AttractionOptions::default(),
    )
    .expect("the fixture instances satisfy the input contract")
}

/// Sixty-four semantic draws from a three-edge graph are all graph edges.
#[test]
fn semantic_draws_are_graph_edges() {
    let graph = semantic_graph(4, &[(0, 1, 0.5), (1, 2, 0.25), (2, 3, 1.0)]);
    let sampler = SemanticEdgeSampler::new(graph.view()).expect("the graph has weight");

    let draws = sampler.sample_in(64, rng(3), Global);

    assert_eq!(draws.len(), 64);
    let edges = [pair(0, 1), pair(1, 2), pair(2, 3)];
    for drawn in draws {
        assert!(
            edges.contains(&drawn),
            "every drawn pair should be a graph edge"
        );
    }
}

/// Reads the semantic sampler's total weight as exactly `3.5` on the dyadic fixture.
///
/// The semantic sampler's total weight is the stored sum over both directions of each edge, exactly
/// `3.5` for the dyadic fixture.
#[test]
fn semantic_total_weight_sums_both_edge_directions() {
    // The symmetric graph stores each undirected edge twice, and the
    // estimator's total is the stored sum: exactly 3.5 over dyadic
    // weights.
    let graph = semantic_graph(4, &[(0, 1, 0.5), (1, 2, 0.25), (2, 3, 1.0)]);
    let sampler = SemanticEdgeSampler::new(graph.view()).expect("the graph has weight");

    assert_eq!(sampler.total_weight(), 3.5);
}

#[test]
fn semantic_draws_follow_the_weights() {
    // the weights contrast 1 with 1e-30 to check concentration on the unit-weight edge.
    let graph = semantic_graph(4, &[(0, 1, 1.0), (2, 3, 1.0e-30)]);
    let sampler = SemanticEdgeSampler::new(graph.view()).expect("the graph has weight");

    let draws = sampler.sample_in(128, rng(5), Global);

    assert!(
        draws.iter().all(|&drawn| drawn == pair(0, 1)),
        "weight-proportional draws should concentrate on the heavy edge"
    );
}

/// `SemanticEdgeSampler::new` returns `None` for a graph with no edge weight.
#[test]
fn semantic_sampler_rejects_an_edgeless_graph() {
    let graph = semantic_graph(3, &[]);
    assert!(
        SemanticEdgeSampler::new(graph.view()).is_none(),
        "a graph without edge weight cannot be sampled"
    );
}

/// Equal seeds reproduce a semantic batch and different seeds draw different batches.
#[test]
fn semantic_sampling_is_seeded() {
    let graph = semantic_graph(5, &[(0, 1, 0.5), (1, 2, 0.5), (2, 3, 0.5), (3, 4, 0.5)]);
    let sampler = SemanticEdgeSampler::new(graph.view()).expect("the graph has weight");

    assert_eq!(
        sampler.sample_in(32, rng(7), Global),
        sampler.sample_in(32, rng(7), Global),
        "equal seeds should reproduce a batch"
    );
    assert_ne!(
        sampler.sample_in(32, rng(7), Global),
        sampler.sample_in(32, rng(8), Global),
        "different seeds should draw different batches"
    );
}

/// Draws both relation types under a per-type cap with distinct edges per group.
///
/// With six instances of one relation and two of another, both types participate under a per-type
/// cap, each group draws at most the cap, and the drawn edges within a group are distinct.
#[test]
fn relation_caps_bind_per_type_under_skew() {
    let policies = [proximal_policy(3), proximal_policy(9)];
    let indexes = relation_indexes(
        8,
        &policies,
        vec![
            // The fixture lists six instances of relation 3 and two of relation 9.
            instance(0, 3, 0, 1),
            instance(1, 3, 0, 2),
            instance(2, 3, 0, 3),
            instance(3, 3, 1, 2),
            instance(4, 3, 1, 3),
            instance(5, 3, 2, 3),
            instance(6, 9, 4, 5),
            instance(7, 9, 4, 6),
        ],
    );
    let sampler = RelationEdgeSampler::new(&indexes.attraction);

    let cap = nz!(3);
    let draws = sampler.sample_in(2, cap, rng(11), Global);

    assert_eq!(draws.len(), 2, "both types should participate");
    for group in &draws {
        let expected = cap.get().min(group.group.edges().len());
        assert_eq!(
            group.edges.len(),
            expected,
            "each type should contribute min(cap, its edge count)"
        );
        let mut edge_rows: Vec<u64> = group.edges.iter().map(|edge| edge.edge.as_u64()).collect();
        edge_rows.sort_unstable();
        edge_rows.dedup();
        assert_eq!(edge_rows.len(), group.edges.len(), "draws are distinct");
        for edge in &group.edges {
            assert!(
                group.group.edges().contains(edge),
                "every drawn edge should belong to its group"
            );
        }
    }
}

/// Requesting more relation types than the index holds returns every group once, in group order.
#[test]
fn relation_type_requests_beyond_the_index_return_every_group() {
    let policies = [proximal_policy(3), proximal_policy(9)];
    let indexes = relation_indexes(
        8,
        &policies,
        vec![instance(0, 3, 0, 1), instance(1, 9, 4, 5)],
    );
    let sampler = RelationEdgeSampler::new(&indexes.attraction);

    let draws = sampler.sample_in(64, nz!(4), rng(13), Global);

    let relations: Vec<u64> = draws
        .iter()
        .map(|group| group.group.relation().as_u64())
        .collect();
    assert_eq!(relations, [3, 9], "all groups participate, in group order");
}

/// Equal seeds reproduce a relation batch and different seeds draw different edges.
#[test]
fn relation_sampling_is_seeded() {
    let policies = [proximal_policy(3)];
    let instances: Vec<_> = (0..7)
        .flat_map(|source| {
            ((source + 1)..8).map(move |target| instance(source * 8 + target, 3, source, target))
        })
        .collect();
    let indexes = relation_indexes(8, &policies, instances);
    let sampler = RelationEdgeSampler::new(&indexes.attraction);
    let cap = nz!(5);

    let draws = |seed: u64| {
        sampler
            .sample_in(1, cap, rng(seed), Global)
            .into_iter()
            .flat_map(|group| group.edges)
            .map(|edge| edge.edge.as_u64())
            .collect::<Vec<_>>()
    };

    assert_eq!(draws(17), draws(17), "equal seeds should reproduce a batch");
    assert_ne!(
        draws(17),
        draws(19),
        "different seeds should draw different batches"
    );
}

/// The negative sampler's fixture.
///
/// Four rows, a semantic edge `(0, 1)`, and a link `(2, 3)` whose evidence protects it from
/// ordinary repulsion under the default configuration.
fn negative_fixture() -> (
    SemanticGraph<NodeRowId>,
    RelationIndexes<NodeRowId, EdgeRowId>,
) {
    let graph = semantic_graph(4, &[(0, 1, 0.5)]);
    let policies = [proximal_policy(7)];
    let indexes = relation_indexes(4, &policies, vec![instance(0, 7, 2, 3)]);
    (graph, indexes)
}

/// Draws exactly the admissible negative pairs of the four-row fixture exhaustively.
///
/// An exhaustive negative draw from the four-row fixture yields exactly the pairs that are neither
/// self pairs, semantic edges nor protected.
#[test]
fn negatives_pass_every_veto() {
    let (graph, indexes) = negative_fixture();
    let sampler = OrdinaryNegativeSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
    );

    // A request for sixteen from an admissible pool of four is pool-limited and exhaustive: the
    // assertion pins the whole admissible set. The vetoes remove the self pairs, the semantic edge
    // (0, 1), and the protected pair (2, 3).
    let mut draws = keys(&sampler.sample_in(16, rng(23), Global));
    draws.sort_unstable();
    assert_eq!(draws, [(0, 2), (0, 3), (1, 2), (1, 3)]);
}

/// With the ordinary protection channel off, the protected linked pair joins the admissible pool.
#[test]
fn disabling_ordinary_protection_admits_linked_pairs() {
    let (graph, indexes) = negative_fixture();
    let config = ProtectionConfig::new(ChannelConfig::default(), ChannelConfig::default(), false)
        .expect("the fixture channels are ordered");
    let sampler = OrdinaryNegativeSampler::new(graph.view(), indexes.protection.view(), config);

    let mut draws = keys(&sampler.sample_in(16, rng(23), Global));
    draws.sort_unstable();
    assert_eq!(
        draws,
        [(0, 2), (0, 3), (1, 2), (1, 3), (2, 3)],
        "the linked pair joins the pool once its channel is off"
    );
}

/// Equal seeds reproduce a negative batch and different seeds draw different batches.
#[test]
fn negative_sampling_is_seeded() {
    let graph = semantic_graph(12, &[(0, 1, 0.5)]);
    let policies = [proximal_policy(7)];
    let indexes = relation_indexes(12, &policies, vec![instance(0, 7, 2, 3)]);
    let sampler = OrdinaryNegativeSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
    );

    assert_eq!(
        sampler.sample_in(8, rng(29), Global),
        sampler.sample_in(8, rng(29), Global),
        "equal seeds should reproduce a batch"
    );
    assert_ne!(
        keys(&sampler.sample_in(8, rng(29), Global)),
        keys(&sampler.sample_in(8, rng(31), Global)),
        "different seeds should draw different batches"
    );
}

/// Yields an empty batch from a two-row graph whose only pair is a semantic edge.
///
/// A two-row graph whose only pair is a semantic edge has an empty admissible pool and yields an
/// empty batch.
#[test]
fn tiny_domains_return_shorter_batches() {
    // With two rows and one semantic edge, the admissible pool is empty.
    let graph = semantic_graph(2, &[(0, 1, 0.5)]);
    let policies = [proximal_policy(7)];
    let indexes = relation_indexes(2, &policies, vec![]);
    let sampler = OrdinaryNegativeSampler::new(
        graph.view(),
        indexes.protection.view(),
        ProtectionConfig::default(),
    );

    assert!(
        sampler.sample_in(4, rng(37), Global).is_empty(),
        "an empty admissible pool should produce an empty batch"
    );
}
