use hashql_core::id::IdVec;

use super::{
    TopologyDelta,
    provider::{NaiveTopologyProvider, VersionedTopologyProvider},
};
use crate::{
    identity::{EdgeRowId, NodeRowId},
    serve::{
        delta::{DeltaRevision, history::CAPACITY},
        world::topology::TopologyProvider,
    },
};

/// A fixed base topology with a small fitted edge set.
struct Origin {
    edges: IdVec<EdgeRowId, [NodeRowId; 2]>,
}

impl Origin {
    /// Builds a fitted topology of three nodes and three edges, including a self-loop.
    fn new() -> Self {
        Self {
            edges: [[0, 1], [0, 1], [1, 1]]
                .map(|pair| pair.map(NodeRowId::new))
                .into_iter()
                .collect(),
        }
    }
}

impl TopologyProvider for Origin {
    fn provide_node_count(&self) -> usize {
        3
    }

    fn provide_edge_count(&self) -> usize {
        self.edges.len()
    }

    fn provide_endpoints(&self, edge: EdgeRowId) -> Option<[NodeRowId; 2]> {
        self.edges.get(edge).copied()
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.edges
            .iter_enumerated()
            .filter_map(move |(edge, &[_source, target])| (target == node).then_some(edge))
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.edges
            .iter_enumerated()
            .filter_map(move |(edge, &[source, _target])| (source == node).then_some(edge))
    }
}

/// Checks a node's ordered incoming and outgoing edge rows at `revision`.
///
/// # Panics
///
/// Panics if either ordered edge sequence differs from its expected rows.
#[track_caller]
fn assert_edges(
    provider: &impl VersionedTopologyProvider,
    node: u64,
    revision: u64,
    incoming: &[u64],
    outgoing: &[u64],
) {
    let node = NodeRowId::new(node);
    let revision = DeltaRevision::new(revision);
    assert_eq!(
        provider
            .provide_incoming_at(node, revision)
            .collect::<Vec<_>>(),
        incoming
            .iter()
            .copied()
            .map(EdgeRowId::new)
            .collect::<Vec<_>>(),
    );
    assert_eq!(
        provider
            .provide_outgoing_at(node, revision)
            .collect::<Vec<_>>(),
        outgoing
            .iter()
            .copied()
            .map(EdgeRowId::new)
            .collect::<Vec<_>>(),
    );
}

/// Delegates unchanged topology reads to the base.
///
/// An empty delta over the base forwards adjacency and endpoint lookups unchanged, including for
/// a node and an edge outside the base's domain.
#[test]
fn adjacency_origin() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let data = TopologyDelta::default();
    let provider = data.bind(base);
    assert_edges(&provider, 0, 0, &[], &[0, 1]);
    assert_edges(&provider, 1, 0, &[0, 1, 2], &[2]);
    assert_edges(&provider, 2, 0, &[], &[]);
    assert_edges(&provider, 99, 0, &[], &[]);
    assert_eq!(
        provider.provide_endpoints_at(EdgeRowId::new(3), DeltaRevision::new(0)),
        None
    );
}

/// Tracks inherited edge withdrawal and revival by revision.
///
/// Withdrawing an inherited edge hides it and its adjacency from the withdrawal revision onward,
/// while an earlier revision still resolves through the base. Re-insertion with new endpoints
/// restores adjacency from the new revision onward.
#[test]
fn inherited_withdrawal_revival() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    let edge = EdgeRowId::new(0);
    assert!(data.withdraw(base, edge, DeltaRevision::new(2)));
    {
        let provider = data.bind(base);
        assert_edges(&provider, 0, 1, &[], &[0, 1]);
        assert_edges(&provider, 0, 2, &[], &[1]);
        assert_edges(&provider, 1, 2, &[1, 2], &[2]);
        assert_eq!(
            provider.provide_endpoints_at(edge, DeltaRevision::new(2)),
            None
        );
    }
    assert!(data.insert(base, edge, [NodeRowId::new(2); 2], DeltaRevision::new(4)));
    let provider = data.bind(base);
    assert_edges(&provider, 0, 3, &[], &[1]);
    assert_edges(&provider, 0, 4, &[], &[0, 1]);
    assert_edges(&provider, 1, 4, &[0, 1, 2], &[2]);
    assert_edges(&provider, 2, 4, &[], &[]);
    assert_eq!(
        provider.provide_endpoints_at(edge, DeltaRevision::new(4)),
        base.provide_endpoints(edge)
    );
}

/// Tracks an added edge across birth, withdrawal and rebinding.
///
/// An added edge is absent from adjacency before its birth revision, appears at birth, disappears
/// again after a later withdrawal, and a re-insertion with different endpoints restores adjacency
/// under the new endpoints from that revision onward.
#[test]
fn addition_birth_withdrawal_revival() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    let edge = EdgeRowId::new(3);
    let endpoints = [NodeRowId::new(0), NodeRowId::new(3)];
    assert!(data.insert(base, edge, endpoints, DeltaRevision::new(2)));
    {
        let provider = data.bind(base);
        assert_edges(&provider, 0, 1, &[], &[0, 1]);
        assert_edges(&provider, 3, 1, &[], &[]);
        assert_edges(&provider, 0, 2, &[], &[0, 1, 3]);
        assert_edges(&provider, 3, 2, &[3], &[]);
        assert_eq!(
            provider.provide_endpoints_at(edge, DeltaRevision::new(1)),
            None
        );
        assert_eq!(
            provider.provide_endpoints_at(edge, DeltaRevision::new(2)),
            Some(endpoints)
        );
    }
    assert!(data.withdraw(base, edge, DeltaRevision::new(4)));
    assert!(data.insert(base, edge, [NodeRowId::new(1); 2], DeltaRevision::new(6)));
    let provider = data.bind(base);
    assert_edges(&provider, 0, 4, &[], &[0, 1]);
    assert_edges(&provider, 3, 4, &[], &[]);
    assert_eq!(
        provider.provide_endpoints_at(edge, DeltaRevision::new(4)),
        None
    );
    assert_edges(&provider, 0, 6, &[], &[0, 1, 3]);
    assert_edges(&provider, 1, 6, &[0, 1, 2], &[2]);
    assert_edges(&provider, 3, 6, &[3], &[]);
    assert_eq!(
        provider.provide_endpoints_at(edge, DeltaRevision::new(6)),
        Some(endpoints)
    );
}

/// Keeps out-of-order edge bindings independent.
///
/// Binding a higher-numbered edge before a lower one does not disturb the lower edge's later
/// binding or either edge's adjacency at its own revision.
#[test]
fn binding_out_of_order() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    let endpoints = [NodeRowId::new(0), NodeRowId::new(3)];
    assert!(data.insert(base, EdgeRowId::new(5), endpoints, DeltaRevision::new(2)));
    assert!(!data.withdraw(base, EdgeRowId::new(3), DeltaRevision::new(3)));
    assert!(data.insert(base, EdgeRowId::new(3), endpoints, DeltaRevision::new(4)));
    let provider = data.bind(base);
    assert_edges(&provider, 0, 2, &[], &[0, 1, 5]);
    assert_edges(&provider, 3, 2, &[5], &[]);
    assert_edges(&provider, 0, 4, &[], &[0, 1, 3, 5]);
    assert_edges(&provider, 3, 4, &[3, 5], &[]);
    assert_eq!(
        provider.provide_endpoints_at(EdgeRowId::new(3), DeltaRevision::new(3)),
        None
    );
    assert_eq!(
        provider.provide_endpoints_at(EdgeRowId::new(4), DeltaRevision::new(4)),
        None
    );
    assert_eq!(
        provider.provide_endpoints_at(EdgeRowId::new(5), DeltaRevision::new(4)),
        Some(endpoints)
    );
}

/// Maintains both adjacency directions for a self-loop across replay.
///
/// A self-loop edge appears in both a node's incoming and outgoing lists. Repeating its insertion
/// or withdrawal at the same revision reports no change, and it can be withdrawn and revived.
#[test]
fn self_loop_replay() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    let edge = EdgeRowId::new(3);
    let pair = [NodeRowId::new(3); 2];
    assert!(data.insert(base, edge, pair, DeltaRevision::new(1)));
    assert!(!data.insert(base, edge, pair, DeltaRevision::new(2)));
    assert_edges(&data.bind(base), 3, 2, &[3], &[3]);
    assert!(data.withdraw(base, edge, DeltaRevision::new(3)));
    assert!(!data.withdraw(base, edge, DeltaRevision::new(4)));
    assert_edges(&data.bind(base), 3, 4, &[], &[]);
    assert!(data.insert(base, edge, pair, DeltaRevision::new(5)));
    assert_edges(&data.bind(base), 3, 5, &[3], &[3]);
}

/// Preserves inherited and added edge origins through history rollover.
///
/// Both an inherited and an added edge's visibility decisions survive past the retention
/// capacity, keeping adjacency correct at revisions before, during, and after the rollover.
#[test]
fn history_origin_rollover() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    let added = EdgeRowId::new(3);
    let inherited = EdgeRowId::new(0);
    assert!(data.insert(base, added, [NodeRowId::new(3); 2], DeltaRevision::new(2)));
    for edge in [inherited, added] {
        assert!(data.withdraw(base, edge, DeltaRevision::new(3)));
    }
    let capacity = u64::try_from(CAPACITY).expect("should fit the retention capacity");
    let end = 3 + 2 * capacity;
    for offset in 1..=capacity {
        let revision = 3 + 2 * offset;
        for edge in [inherited, added] {
            assert!(data.insert(
                base,
                edge,
                [NodeRowId::new(3); 2],
                DeltaRevision::new(revision - 1)
            ));
            assert!(data.withdraw(base, edge, DeltaRevision::new(revision)));
        }
    }
    let provider = data.bind(base);
    assert_edges(&provider, 0, 3, &[], &[0, 1]);
    assert_edges(&provider, 0, end, &[], &[1]);
    assert_edges(&provider, 3, 1, &[], &[]);
    assert_edges(&provider, 3, 3, &[3], &[3]);
    assert_edges(&provider, 3, end, &[], &[]);
    assert_eq!(
        provider.provide_endpoints_at(added, DeltaRevision::new(1)),
        None
    );
}

/// Keeps only the last edge decision at one revision.
///
/// Repeated insert-then-withdraw decisions never affect earlier adjacency.
#[test]
fn history_same_revision() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    let edge = EdgeRowId::new(3);
    let pair = [NodeRowId::new(3); 2];
    assert!(data.insert(base, edge, pair, DeltaRevision::new(2)));
    assert!(data.withdraw(base, edge, DeltaRevision::new(2)));
    assert_edges(&data.bind(base), 3, 2, &[], &[]);
    assert!(data.insert(base, edge, pair, DeltaRevision::new(2)));
    assert_edges(&data.bind(base), 3, 1, &[], &[]);
    assert_edges(&data.bind(base), 3, 2, &[3], &[3]);
}

/// Replaces all target topology state from the source.
///
/// `clone_from` discards the target's own prior changes.
#[test]
fn clone_from_replacement() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut source = TopologyDelta::default();
    source.insert(
        base,
        EdgeRowId::new(3),
        [NodeRowId::new(3); 2],
        DeltaRevision::new(2),
    );
    source.withdraw(base, EdgeRowId::new(0), DeltaRevision::new(4));
    let mut target = source.clone();
    target.insert(
        base,
        EdgeRowId::new(5),
        [NodeRowId::new(4); 2],
        DeltaRevision::new(5),
    );
    assert_edges(&target.bind(base), 4, 5, &[5], &[5]);
    target.clone_from(&source);
    let provider = target.bind(base);
    assert_edges(&provider, 4, 5, &[], &[]);
    assert_edges(&provider, 3, 2, &[3], &[3]);
    assert_edges(&provider, 0, 3, &[], &[0, 1]);
    assert_edges(&provider, 0, 4, &[], &[1]);
    assert_eq!(
        provider.provide_endpoints_at(EdgeRowId::new(5), DeltaRevision::new(5)),
        None
    );
}

/// Composes current and historical topology across nested deltas.
///
/// A delta composed over another delta resolves node and edge counts, adjacency, and endpoint
/// lookups through both layers, at both the current state and a historical revision that predates
/// the upper layer's own changes.
#[test]
fn nested_provider_revisions() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut lower_data = TopologyDelta::default();
    let edge = EdgeRowId::new(3);
    let pair = [NodeRowId::new(3); 2];
    lower_data.insert(base, edge, pair, DeltaRevision::new(2));
    lower_data.withdraw(base, edge, DeltaRevision::new(4));
    let lower = lower_data.bind(base);
    let mut upper_data = TopologyDelta::default();
    upper_data.withdraw(&lower, EdgeRowId::new(0), DeltaRevision::new(3));
    upper_data.insert(
        &lower,
        EdgeRowId::new(4),
        [NodeRowId::new(3), NodeRowId::new(4)],
        DeltaRevision::new(5),
    );
    let upper = upper_data.bind(&lower);

    assert_eq!(upper.provide_node_count(), 5);
    assert_eq!(upper.provide_edge_count(), 5);
    assert_edges(&upper, 0, 2, &[], &[0, 1]);
    assert_edges(&upper, 0, 3, &[], &[1]);
    assert_edges(&upper, 3, 1, &[], &[]);
    assert_edges(&upper, 3, 2, &[3], &[3]);
    assert_edges(&upper, 3, 4, &[], &[]);
    assert_edges(&upper, 3, 5, &[], &[4]);
    assert_edges(&upper, 4, 5, &[4], &[]);
    assert_eq!(
        upper.provide_endpoints_at(edge, DeltaRevision::new(2)),
        Some(pair)
    );
    assert_eq!(upper.provide_endpoints(edge), None);
    assert_eq!(upper.provide_incoming(NodeRowId::new(3)).count(), 0);
    assert_eq!(
        upper
            .provide_outgoing(NodeRowId::new(3))
            .collect::<Vec<_>>(),
        [EdgeRowId::new(4)]
    );
}

/// Preserves lower-layer history after upper-layer rollover.
///
/// An upper delta's decisions for a lower-layer edge survive past the retention capacity, keeping
/// the lower layer's own historical adjacency resolvable while the upper layer's current state
/// remains withdrawn.
#[test]
fn nested_history_rollover() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut lower_data = TopologyDelta::default();
    let edge = EdgeRowId::new(3);
    let pair = [NodeRowId::new(3); 2];
    lower_data.insert(base, edge, pair, DeltaRevision::new(2));
    lower_data.withdraw(base, edge, DeltaRevision::new(4));
    let lower = lower_data.bind(base);
    let mut upper_data = TopologyDelta::default();
    assert!(upper_data.withdraw(&lower, edge, DeltaRevision::new(3)));
    let capacity = u64::try_from(CAPACITY).expect("should fit the retention capacity");
    for offset in 1..=capacity {
        let revision = 3 + 2 * offset;
        assert!(upper_data.insert(&lower, edge, pair, DeltaRevision::new(revision - 1)));
        assert!(upper_data.withdraw(&lower, edge, DeltaRevision::new(revision)));
    }
    let upper = upper_data.bind(&lower);
    assert_edges(&upper, 3, 1, &[], &[]);
    assert_edges(&upper, 3, 2, &[3], &[3]);
    assert_edges(&upper, 3, 3, &[3], &[3]);
    assert_edges(&upper, 3, 4, &[], &[]);
    assert_eq!(
        upper.provide_endpoints_at(edge, DeltaRevision::new(1)),
        None
    );
    assert_eq!(
        upper.provide_endpoints_at(edge, DeltaRevision::new(2)),
        Some(pair)
    );
    assert_eq!(upper.provide_endpoints(edge), None);
}

/// Extends row domains without fabricating topology for reserved rows.
///
/// Reserving a node and an edge extends both domains immediately while leaving the reserved rows
/// unbound: no adjacency and no endpoints, at the current state and at an earlier revision.
#[test]
fn reserved_rows_unbound() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    data.reserve_node(base, NodeRowId::new(5));
    data.reserve_edge(base, EdgeRowId::new(6));
    let provider = data.bind(base);
    assert_eq!(provider.provide_node_count(), 6);
    assert_eq!(provider.provide_edge_count(), 7);
    assert_edges(&provider, 5, 0, &[], &[]);
    assert_eq!(provider.provide_endpoints(EdgeRowId::new(6)), None);
    assert_eq!(
        provider.provide_endpoints_at(EdgeRowId::new(6), DeltaRevision::new(0)),
        None
    );
}

/// Panics when an insertion revision precedes a prior withdrawal.
#[test]
#[should_panic(expected = "history revisions must be nondecreasing")]
fn history_decreasing_revision() {
    let origin = Origin::new();
    let base = NaiveTopologyProvider::from_ref(&origin);
    let mut data = TopologyDelta::default();
    data.withdraw(base, EdgeRowId::new(0), DeltaRevision::new(4));
    data.insert(
        base,
        EdgeRowId::new(0),
        [NodeRowId::new(2); 2],
        DeltaRevision::new(3),
    );
}
