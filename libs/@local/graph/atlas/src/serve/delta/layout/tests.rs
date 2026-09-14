use hashql_core::id::IdVec;

use super::{
    DeltaRowId, LayoutDelta,
    provider::{NaiveLayoutProvider, VersionedLayoutProvider as _},
};
use crate::{
    identity::NodeRowId,
    math::Vec2,
    serve::{
        delta::{DeltaRevision, history::CAPACITY},
        world::layout::LayoutProvider,
    },
};

/// A fixed base layout with two fitted node positions.
struct Origin {
    positions: IdVec<NodeRowId, Vec2>,
}

impl Origin {
    /// Builds a fitted layout with two node positions at rows 0 and 1.
    fn new() -> Self {
        Self {
            positions: [Vec2::new(2.0, 3.0), Vec2::new(-1.0, 4.0)]
                .into_iter()
                .collect(),
        }
    }
}

impl LayoutProvider for Origin {
    fn provide_node_count(&self) -> usize {
        self.positions.len()
    }

    fn provide_position(&self, node: NodeRowId) -> Option<Vec2> {
        self.positions.get(node).copied()
    }
}

/// Delegates unchanged layout reads to the base provider.
///
/// This holds at the current and base revisions, including for a row outside the base's domain.
#[test]
fn position_origin() {
    let origin = Origin::new();
    let base = NaiveLayoutProvider::new(&origin);
    let data = LayoutDelta::default();
    let provider = data.bind(&base);
    assert_eq!(provider.provide_node_domain().size(), 2);
    for node in [NodeRowId::new(0), NodeRowId::new(1), NodeRowId::new(99)] {
        assert_eq!(
            provider.provide_position(node),
            origin.provide_position(node)
        );
        assert_eq!(
            provider.provide_position_at(node, DeltaRevision::new(0)),
            origin.provide_position(node)
        );
    }
}

/// Tracks withdrawal and revival of an inherited node by revision.
///
/// Withdrawing an inherited node hides its position from the withdrawal revision onward while an
/// earlier revision still resolves through the base. A later re-insertion restores the base's
/// position from its own revision onward.
#[test]
fn inherited_withdrawal_revival() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let node = NodeRowId::new(0);
    assert!(data.withdraw(&base, node, DeltaRevision::new(2)));
    {
        let provider = data.bind(&base);
        assert_eq!(
            provider.provide_position_at(node, DeltaRevision::new(1)),
            base.provide_position(node)
        );
        assert_eq!(
            provider.provide_position_at(node, DeltaRevision::new(2)),
            None
        );
        assert_eq!(provider.provide_position(node), None);
    }
    assert!(data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(4)));
    let provider = data.bind(&base);
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(3)),
        None
    );
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(4)),
        base.provide_position(node)
    );
    assert_eq!(provider.provide_position(node), base.provide_position(node));
}

/// Tracks an added node across birth, withdrawal and revival.
///
/// An added node is absent before its birth revision and resolves to its placed position from
/// birth onward. It disappears again after a later withdrawal, and a re-insertion restores the
/// original position from the new revision onward.
#[test]
fn addition_birth_withdrawal_revival() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let node = NodeRowId::new(2);
    let position = Vec2::new(1.0, -2.0);
    assert!(data.insert(&base, node, position, DeltaRevision::new(2)));
    assert_eq!(
        data.bind(&base)
            .provide_position_at(node, DeltaRevision::new(1)),
        None
    );
    assert_eq!(
        data.bind(&base)
            .provide_position_at(node, DeltaRevision::new(2)),
        Some(position)
    );
    assert!(data.withdraw(&base, node, DeltaRevision::new(3)));
    assert_eq!(data.bind(&base).provide_position(node), None);
    assert!(data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(4)));
    let provider = data.bind(&base);
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(3)),
        None
    );
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(4)),
        Some(position)
    );
    assert_eq!(provider.provide_position(node), Some(position));
}

/// Keeps out-of-order row reservations independent.
///
/// Reserving a higher row before a lower one extends the domain immediately and leaves the
/// reserved row unplaced. It does not disturb the visibility or later placement of the lower row.
#[test]
fn placement_out_of_order() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let earlier = NodeRowId::new(2);
    let later = NodeRowId::new(3);
    let delta = DeltaRowId::derive(base.provide_node_domain(), later)
        .expect("later should exceed the base's node domain");
    data.positions.fill_until(delta, || None);
    assert_eq!(data.bind(&base).provide_node_count(), 4);
    assert_eq!(data.bind(&base).provide_position(later), None);
    assert!(!data.withdraw(&base, earlier, DeltaRevision::new(1)));
    assert!(data.insert(&base, later, Vec2::splat(3.0), DeltaRevision::new(2)));
    assert_eq!(data.bind(&base).provide_position(earlier), None);
    assert!(data.insert(&base, earlier, Vec2::splat(2.0), DeltaRevision::new(3)));
    let provider = data.bind(&base);
    assert_eq!(provider.provide_position(earlier), Some(Vec2::splat(2.0)));
    assert_eq!(provider.provide_position(later), Some(Vec2::splat(3.0)));
    assert_eq!(
        provider.provide_position_at(earlier, DeltaRevision::new(2)),
        None
    );
}

/// Leaves state unchanged when replay repeats a recorded decision.
///
/// Both insertion and withdrawal replays report no change.
#[test]
fn decisions_replay_same_revision() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    for node in [NodeRowId::new(0), NodeRowId::new(2)] {
        data.insert(&base, node, Vec2::splat(2.0), DeltaRevision::new(1));
        let position = data.bind(&base).provide_position(node);
        assert!(!data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(1)));
        assert!(data.withdraw(&base, node, DeltaRevision::new(2)));
        assert!(!data.withdraw(&base, node, DeltaRevision::new(2)));
        assert!(data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(2)));
        assert_eq!(
            data.bind(&base)
                .provide_position_at(node, DeltaRevision::new(2)),
            position
        );
        assert!(!data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(3)));
        assert_eq!(data.bind(&base).provide_position(node), position);
    }
}

/// Preserves the origin decision after retained history rolls over.
///
/// A node's earliest visibility decision survives past the retained revision history's capacity,
/// for both an inherited and an added node, while a query before the added node's birth still
/// correctly resolves to absent.
#[test]
fn decisions_eviction() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let inherited = NodeRowId::new(0);
    let added = NodeRowId::new(2);
    data.insert(&base, added, Vec2::ZERO, DeltaRevision::new(2));
    for node in [inherited, added] {
        assert!(data.withdraw(&base, node, DeltaRevision::new(3)));
    }
    let capacity = u64::try_from(CAPACITY).expect("should fit the retention capacity");
    for offset in 1..=capacity {
        let revision = 3 + 2 * offset;
        for node in [inherited, added] {
            assert!(data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(revision - 1)));
            assert!(data.withdraw(&base, node, DeltaRevision::new(revision)));
        }
    }
    let provider = data.bind(&base);
    assert_eq!(
        provider.provide_position_at(inherited, DeltaRevision::new(3)),
        base.provide_position(inherited)
    );
    assert_eq!(
        provider.provide_position_at(added, DeltaRevision::new(3)),
        Some(Vec2::ZERO)
    );
    assert_eq!(
        provider.provide_position_at(added, DeltaRevision::new(1)),
        None
    );
    assert_eq!(provider.provide_position(inherited), None);
    assert_eq!(provider.provide_position(added), None);
}

/// Resolves visibility through both layers of a composed delta.
///
/// A lower-layer withdrawal hides an inherited node at the current revision but not before it, an
/// upper-layer re-insertion after a lower withdrawal still resolves absent, and an upper-only
/// addition is visible independent of the lower layer.
#[test]
fn nested_visibility() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut lower = LayoutDelta::default();
    let inherited = NodeRowId::new(0);
    let lower_node = NodeRowId::new(2);
    lower.insert(&base, lower_node, Vec2::splat(2.0), DeltaRevision::new(2));
    lower.withdraw(&base, inherited, DeltaRevision::new(3));
    lower.withdraw(&base, lower_node, DeltaRevision::new(4));
    let lower = lower.bind(&base);
    let mut upper = LayoutDelta::default();
    upper.withdraw(&lower, lower_node, DeltaRevision::new(3));
    upper.insert(&lower, lower_node, Vec2::ZERO, DeltaRevision::new(5));
    upper.insert(
        &lower,
        NodeRowId::new(3),
        Vec2::splat(3.0),
        DeltaRevision::new(6),
    );
    let provider = upper.bind(&lower);
    assert_eq!(provider.provide_node_domain().size(), 4);
    assert_eq!(
        provider.provide_position_at(inherited, DeltaRevision::new(2)),
        base.provide_position(inherited)
    );
    assert_eq!(provider.provide_position(inherited), None);
    assert_eq!(
        provider.provide_position_at(lower_node, DeltaRevision::new(1)),
        None
    );
    assert_eq!(
        provider.provide_position_at(lower_node, DeltaRevision::new(2)),
        Some(Vec2::splat(2.0))
    );
    assert_eq!(
        provider.provide_position_at(lower_node, DeltaRevision::new(3)),
        None
    );
    assert_eq!(
        provider.provide_position_at(lower_node, DeltaRevision::new(5)),
        None
    );
    assert_eq!(provider.provide_position(lower_node), None);
    assert_eq!(
        provider.provide_position(NodeRowId::new(3)),
        Some(Vec2::splat(3.0))
    );
}

/// Composes rolled-over visibility with a lower delta's history.
///
/// An upper delta's decisions for a lower-layer node survive past the retention capacity, keeping
/// the base position resolvable at the lower layer's own revisions while the upper layer's current
/// state remains withdrawn.
#[test]
fn nested_eviction() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut lower = LayoutDelta::default();
    let node = NodeRowId::new(0);
    lower.withdraw(&base, node, DeltaRevision::new(2));
    lower.insert(&base, node, Vec2::ZERO, DeltaRevision::new(4));
    let lower = lower.bind(&base);
    let mut upper = LayoutDelta::default();
    assert!(upper.withdraw(&lower, node, DeltaRevision::new(5)));
    let capacity = u64::try_from(CAPACITY).expect("should fit the retention capacity");
    for offset in 1..=capacity {
        let revision = 5 + 2 * offset;
        assert!(upper.insert(&lower, node, Vec2::ZERO, DeltaRevision::new(revision - 1)));
        assert!(upper.withdraw(&lower, node, DeltaRevision::new(revision)));
    }
    let provider = upper.bind(&lower);
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(3)),
        None
    );
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(4)),
        base.provide_position(node)
    );
    assert_eq!(
        provider.provide_position_at(node, DeltaRevision::new(5)),
        base.provide_position(node)
    );
    assert_eq!(provider.provide_position(node), None);
}

/// Replaces all target state while keeping the resulting clone independent.
///
/// `clone_from` discards the target's history. Every resulting copy ignores later source changes,
/// including the one produced by `clone`.
#[test]
fn clone_replacement() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut source = LayoutDelta::default();
    let added = NodeRowId::new(2);
    source.insert(&base, added, Vec2::splat(2.0), DeltaRevision::new(1));
    source.withdraw(&base, NodeRowId::new(0), DeltaRevision::new(2));
    let mut target = LayoutDelta::default();
    target.insert(&base, NodeRowId::new(5), Vec2::ZERO, DeltaRevision::new(3));
    target.withdraw(&base, NodeRowId::new(1), DeltaRevision::new(3));
    target.clone_from(&source);
    source.withdraw(&base, added, DeltaRevision::new(4));
    let cloned = target.clone();
    for data in [&target, &cloned] {
        let provider = data.bind(&base);
        assert_eq!(provider.provide_node_count(), 3);
        assert_eq!(provider.provide_position(added), Some(Vec2::splat(2.0)));
        assert_eq!(provider.provide_position(NodeRowId::new(0)), None);
        assert_eq!(
            provider.provide_position(NodeRowId::new(1)),
            base.provide_position(NodeRowId::new(1))
        );
        assert_eq!(provider.provide_position(NodeRowId::new(5)), None);
        assert_eq!(
            provider.provide_position_at(added, DeltaRevision::new(0)),
            None
        );
    }
}

/// Panics when a withdrawal revision precedes the node's insertion.
#[test]
#[should_panic(expected = "history revisions must be nondecreasing")]
fn decisions_decreasing_revision() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let node = NodeRowId::new(2);
    data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(2));
    data.withdraw(&base, node, DeltaRevision::new(1));
}
