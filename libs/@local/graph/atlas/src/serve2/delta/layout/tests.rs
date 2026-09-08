use hashql_core::id::IdVec;

use super::{
    LayoutDelta,
    provider::{NaiveLayoutProvider, VersionedLayoutProvider as _},
};
use crate::{
    identity::NodeRowId,
    math::Vec2,
    serve2::{
        delta::{DeltaRevision, history::CAPACITY},
        world::layout::LayoutProvider,
    },
};

struct Origin {
    positions: IdVec<NodeRowId, Vec2>,
}

impl Origin {
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

#[test]
fn position_origin() {
    let origin = Origin::new();
    let base = NaiveLayoutProvider::new(&origin);
    let data = LayoutDelta::default();
    let provider = data.bind(&base);
    assert_eq!(provider.provide_node_universe().size(), 2);
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

#[test]
fn placement_out_of_order() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let earlier = NodeRowId::new(2);
    let later = NodeRowId::new(3);
    data.reserve_node(&base, later);
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
    assert_eq!(provider.provide_node_universe().size(), 4);
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

#[test]
#[should_panic(expected = "history revisions must be nondecreasing")]
fn decisions_decreasing_revision() {
    let base = NaiveLayoutProvider::new(Origin::new());
    let mut data = LayoutDelta::default();
    let node = NodeRowId::new(2);
    data.insert(&base, node, Vec2::ZERO, DeltaRevision::new(2));
    data.withdraw(&base, node, DeltaRevision::new(1));
}
