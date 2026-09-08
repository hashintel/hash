use alloc::sync::Arc;

use arc_swap::Guard;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use uuid::Uuid;

use super::DeltaImportanceProvider;
use crate::{
    dataset::auxiliary::{Label, Legend, OwnedLegend},
    identity::{NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::ArchivedEntityId,
    salt::fit::prepare::IdentityProvider,
    serve2::{
        delta::{
            Delta, DeltaRevision,
            epoch::Epoch,
            overlay::{DeltaIdentityProvider, IdentityProviderResidual, NaiveIdentityProvider},
        },
        tests::fixture::{TamperFixture, secret},
        world::{
            World,
            node_importance::{ImportanceProvider, NodePriority},
        },
    },
};

fn fixture(name: &str) -> (TamperFixture, Delta) {
    let fixture = TamperFixture::publish(name);
    let world = World::open(fixture.generation().clone(), &secret())
        .expect("should open the synthetic world");
    let delta = Delta::new(Arc::new(world), StdRng::seed_from_u64(23))
        .expect("should allocate a delta identity");
    (fixture, delta)
}

fn entity(web: u128, id: u128) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_u128(web).into(),
        entity_uuid: Uuid::from_u128(id).into(),
    }
}

fn legend(label: &str) -> OwnedLegend {
    OwnedLegend::new(OntologyRowId::MIN, Label::new(label))
}

fn epoch(delta: &Delta) -> Epoch {
    Epoch::from(Guard::from_inner(Arc::new(delta.clone())))
}

/// Identity ordering ignores allocation order across webs.
#[test]
fn identity_allocation_order() {
    let (_fixture, mut delta) = fixture("importance-identity-orders-over-allocation");
    let first_web = entity(2, 1);
    let second_web = entity(1, 1);

    assert_eq!(
        delta.update_node(first_web, legend("first"), Vec2::ZERO),
        Some(true)
    );
    assert_eq!(
        delta.update_node(second_web, legend("second"), Vec2::ZERO),
        Some(true)
    );
    let first_row = delta
        .node_row(first_web)
        .expect("should allocate the first arrival row");
    let second_row = delta
        .node_row(second_web)
        .expect("should allocate the second arrival row");
    assert!(
        first_row < second_row,
        "should allocate rows in insertion order"
    );

    let epoch = epoch(&delta);
    let first_priority = delta.world.layout.priority(&epoch, first_row);
    let second_priority = delta.world.layout.priority(&epoch, second_row);
    assert_eq!(first_priority, Some(NodePriority::Identity(first_web)));
    assert_eq!(second_priority, Some(NodePriority::Identity(second_web)));
    assert!(
        second_priority < first_priority,
        "should order identity priority by identity bytes rather than allocation order"
    );
}

/// Unknown rows have no priority.
#[test]
fn priority_unknown() {
    let (_fixture, delta) = fixture("importance-unknown-row-no-priority");
    let epoch = epoch(&delta);
    assert_eq!(
        delta.world.layout.priority(&epoch, NodeRowId::MAX),
        None,
        "should carry no priority for a row outside every known domain"
    );
}

/// Withdrawal and revival preserve a rank across captured publications.
#[test]
fn rank_withdrawal() {
    let (_fixture, mut delta) = fixture("importance-fitted-priority-survives-withdrawal");
    let row = NodeRowId::new(0);
    let fitted = delta
        .world
        .layout
        .index
        .identity
        .key_of(row)
        .expect("should resolve the fitted node's identity");

    let published = epoch(&delta);
    let before = delta
        .world
        .layout
        .priority(&published, row)
        .expect("should resolve a fitted row's rank priority");
    assert!(
        matches!(before, NodePriority::Rank(_)),
        "should give a fitted row a rank priority"
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(fitted), "should withdraw the fitted node");
    let hidden = epoch(&delta);
    assert_eq!(delta.world.layout.priority(&hidden, row), Some(before));
    assert_eq!(
        delta.world.layout.position(&hidden, row),
        None,
        "should hide the withdrawn node's position while its priority persists"
    );

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(fitted, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    let revived = epoch(&delta);
    assert_eq!(delta.world.layout.priority(&revived, row), Some(before));
    assert_eq!(
        delta.world.layout.priority(&published, row),
        Some(before),
        "should keep an old publication's priority reading unaffected by later revisions"
    );
}

/// Withdrawal and revival preserve identity priority without exposing future allocations.
#[test]
fn identity_withdrawal() {
    let (_fixture, mut delta) = fixture("importance-arrival-priority-survives-withdrawal");
    let before_allocation = epoch(&delta);
    let added = entity(3, 1);
    assert_eq!(
        delta.update_node(added, legend("first"), Vec2::ZERO),
        Some(true)
    );
    let row = delta
        .node_row(added)
        .expect("should allocate the arrival row");
    assert_eq!(
        delta.world.layout.priority(&before_allocation, row),
        None,
        "should exclude rows allocated after a publication"
    );

    let published = epoch(&delta);
    assert_eq!(
        delta.world.layout.priority(&published, row),
        Some(NodePriority::Identity(added))
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(added), "should withdraw the arrival node");
    let hidden = epoch(&delta);
    assert_eq!(
        delta.world.layout.priority(&hidden, row),
        Some(NodePriority::Identity(added))
    );
    assert_eq!(delta.world.layout.position(&hidden, row), None);

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(added, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    let revived = epoch(&delta);
    assert_eq!(
        delta.world.layout.priority(&revived, row),
        Some(NodePriority::Identity(added))
    );
    assert_eq!(
        delta.world.layout.priority(&published, row),
        Some(NodePriority::Identity(added)),
        "should keep an old publication's priority reading unaffected by later revisions"
    );
}

/// An empty priority source.
struct NoRank;

impl ImportanceProvider for NoRank {
    fn provide_priority(&self, _node: NodeRowId) -> Option<NodePriority> {
        None
    }
}

/// An empty identity source.
struct NoIdentities;

impl IdentityProvider<ArchivedEntityId, NodeRowId> for NoIdentities {
    fn count(&self) -> usize {
        0
    }

    fn key_of(&self, _row: NodeRowId) -> Option<ArchivedEntityId> {
        None
    }

    fn row_of(&self, _key: ArchivedEntityId) -> Option<NodeRowId> {
        None
    }

    fn payload_of_key(&self, _key: ArchivedEntityId) -> Option<&Legend> {
        None
    }
}

/// Nested priority and identity providers retain a hidden lower row's identity.
#[test]
fn identity_nested() {
    let base = NaiveIdentityProvider::new(NoIdentities);
    let mut lower_data = IdentityProviderResidual::new(&base);
    let key = entity(4, 1);
    let (row, _) = lower_data
        .insert(&base, DeltaRevision::new(1), key, legend("lower"))
        .expect("should allocate the lower arrival row");
    assert!(
        lower_data.withdraw(&base, DeltaRevision::new(2), key),
        "should withdraw the lower identity"
    );
    let lower = DeltaIdentityProvider::from_parts(&lower_data, &base);
    let upper_data = IdentityProviderResidual::new(&lower);
    let upper = DeltaIdentityProvider::from_parts(&upper_data, &lower);
    assert_eq!(upper.key_of(row), None, "should hide the lower identity");

    let from_identities = DeltaImportanceProvider::from_parts(NoRank, &upper);
    assert_eq!(
        from_identities.provide_priority(row),
        Some(NodePriority::Identity(key)),
        "should resolve the allocated key recursively without visibility filtering"
    );

    let lower_importance = DeltaImportanceProvider::from_parts(NoRank, &lower);
    let upper_importance = DeltaImportanceProvider::from_parts(&lower_importance, &upper);
    assert_eq!(
        upper_importance.provide_priority(row),
        Some(NodePriority::Identity(key)),
        "should preserve the lower layer's identity priority"
    );
}

/// Priority lookup rejects an epoch from another world.
#[test]
#[should_panic(expected = "layout must belong to the epoch's world")]
fn priority_foreign_world() {
    let (_fixture, delta) = fixture("importance-epoch-world");
    let (_other_fixture, other) = fixture("importance-foreign-world");
    other.world.layout.priority(&epoch(&delta), NodeRowId::MIN);
}
