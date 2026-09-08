use alloc::sync::Arc;

use arc_swap::Guard;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use uuid::Uuid;

use super::{
    Delta, DeltaRevision,
    epoch::Epoch,
    overlay::{DeltaIdentityProvider, NaiveIdentityProvider},
};
use crate::{
    dataset::auxiliary::{Label, OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{fit::prepare::IdentityProvider as _, lod::stage::WIRE_FRAME},
    serve2::{
        tests::fixture::{EDGES, ENDPOINTS, NODES, TYPES, TamperFixture, secret},
        world::World,
    },
};

fn fixture(name: &str) -> (TamperFixture, Delta) {
    let fixture = TamperFixture::publish(name);
    let world = World::open(fixture.generation().clone(), &secret())
        .expect("should open the synthetic world");
    let delta = Delta::new(Arc::new(world), StdRng::seed_from_u64(17))
        .expect("should allocate a delta identity");
    (fixture, delta)
}

fn entity(seed: u128) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_u128(1).into(),
        entity_uuid: Uuid::from_u128(seed).into(),
    }
}

fn legend(label: &str) -> OwnedLegend {
    OwnedLegend::new(OntologyRowId::MIN, Label::new(label))
}

fn epoch(delta: &Delta) -> Epoch {
    Epoch::from(Guard::from_inner(Arc::new(delta.clone())))
}

/// Repeated insertion and revival preserve the node row and its first coordinates.
#[test]
fn node_added_revival() {
    let (_fixture, mut delta) = fixture("delta-node-added-revival");
    let entity = entity(100);
    let position = Vec2::new(0.25, -0.5);
    delta.revision = DeltaRevision::new(1);
    assert_eq!(
        delta.update_node(entity, legend("first"), position),
        Some(true)
    );
    let row = delta.node_row(entity).expect("should allocate a node row");
    let first = epoch(&delta);
    assert_eq!(row, NodeRowId::new(NODES));
    assert_eq!(delta.world.layout.position(&first, row), Some(position));
    assert_eq!(delta.world.topology.node_count(&first), NODES as usize + 1);
    assert_eq!(delta.world.layout.node_count(&first), NODES as usize + 1);
    assert_eq!(
        delta.update_node(entity, legend("first"), Vec2::ZERO),
        Some(false)
    );

    delta.revision = DeltaRevision::new(2);
    assert!(delta.withdraw(entity), "should withdraw the placed node");
    assert!(
        !delta.withdraw(entity),
        "should leave a repeated withdrawal unchanged"
    );
    assert_eq!(delta.node_row(entity), Some(row));
    let withdrawn = epoch(&delta);
    assert_eq!(delta.world.layout.position(&withdrawn, row), None);

    delta.revision = DeltaRevision::new(3);
    assert_eq!(
        delta.update_node(entity, legend("latest"), Vec2::ZERO),
        Some(true)
    );
    let revived = epoch(&delta);
    assert_eq!(delta.world.layout.position(&revived, row), Some(position));
    assert_eq!(delta.world.layout.position(&withdrawn, row), None);
    assert_eq!(delta.world.layout.position(&first, row), Some(position));
    let identities = DeltaIdentityProvider::from_parts(
        &delta.node,
        NaiveIdentityProvider::from_ref(&delta.world.layout.index.identity),
    );
    assert_eq!(
        identities
            .payload_of_row(row)
            .expect("should retain the current legend")
            .label(),
        "latest"
    );
}

/// Full identities keep equal entity UUIDs in different webs independent.
#[test]
fn withdraw_other_web() {
    let (_fixture, mut delta) = fixture("delta-withdraw-other-web");
    let left = entity(101);
    let right = ArchivedEntityId {
        web_id: Uuid::from_u128(2).into(),
        ..left
    };
    assert_eq!(
        delta.update_node(left, legend("left"), Vec2::ZERO),
        Some(true)
    );
    assert_eq!(
        delta.update_node(right, legend("right"), Vec2::splat(0.5)),
        Some(true)
    );
    let left_row = delta.node_row(left).expect("should resolve the left node");
    let right_row = delta
        .node_row(right)
        .expect("should resolve the right node");
    delta.revision.increment_by(1);
    assert!(
        delta.withdraw(left),
        "should withdraw only the addressed identity"
    );
    assert!(
        !delta.withdraw(entity(999)),
        "should ignore an unknown identity"
    );
    let epoch = epoch(&delta);
    assert_eq!(delta.world.layout.position(&epoch, left_row), None);
    assert_eq!(
        delta.world.layout.position(&epoch, right_row),
        Some(Vec2::splat(0.5))
    );
}

/// Node revival restores incident edges unless the edge has its own withdrawal.
#[test]
fn endpoints_node_and_edge_withdrawals() {
    let (_fixture, mut delta) = fixture("delta-endpoint-withdrawals");
    let node = ENDPOINTS[0][1];
    let entity = delta
        .world
        .layout
        .index
        .identity
        .key_of(node)
        .expect("should resolve the fitted node");
    let edge = EdgeRowId::MIN;
    let edge_entity = delta
        .world
        .topology
        .identity
        .key_of(edge)
        .expect("should resolve the fitted edge");
    let held_legend = delta
        .world
        .layout
        .index
        .identity
        .payload_of_row(node)
        .expect("should read the fitted legend")
        .to_owned();
    let before = epoch(&delta);
    assert_eq!(
        delta.world.topology.endpoints(&before, edge),
        Some(ENDPOINTS[0])
    );

    delta.revision.increment_by(1);
    assert!(
        delta.withdraw(entity),
        "should withdraw the fitted endpoint"
    );
    let hidden = epoch(&delta);
    assert_eq!(delta.world.topology.endpoints(&hidden, edge), None);
    assert_eq!(
        delta.world.topology.endpoints(&hidden, EdgeRowId::new(1)),
        None
    );
    assert_eq!(
        delta
            .world
            .topology
            .incoming(&hidden, node)
            .collect::<Vec<_>>(),
        []
    );
    assert_eq!(
        delta
            .world
            .topology
            .outgoing(&hidden, ENDPOINTS[0][0])
            .collect::<Vec<_>>(),
        []
    );
    assert_eq!(
        delta.world.topology.endpoints(&before, edge),
        Some(ENDPOINTS[0])
    );
    assert_eq!(delta.world.topology.edge_count(&hidden), EDGES as usize);

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(entity, held_legend.clone(), Vec2::ZERO),
        Some(true)
    );
    let revived = epoch(&delta);
    assert_eq!(
        delta.world.topology.endpoints(&revived, edge),
        Some(ENDPOINTS[0])
    );
    assert_eq!(
        delta.world.layout.position(&revived, node),
        delta.world.layout.position(&before, node)
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(entity), "should withdraw the endpoint again");
    assert!(
        delta.withdraw(edge_entity),
        "should record the edge's own withdrawal"
    );
    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(entity, held_legend, Vec2::ZERO),
        Some(true)
    );
    let independent = epoch(&delta);
    assert_eq!(delta.world.topology.endpoints(&independent, edge), None);
    assert_eq!(
        delta
            .world
            .topology
            .endpoints(&independent, EdgeRowId::new(1)),
        Some(ENDPOINTS[1])
    );
}

/// Added edges remain unbound until endpoint rows resolve and retain their first pair.
#[test]
fn edge_unbound_revival() {
    let (_fixture, mut delta) = fixture("delta-edge-unbound-revival");
    let entity = entity(102);
    let edge = EdgeRowId::new(EDGES);
    delta.revision.increment_by(1);
    assert_eq!(delta.update_edge(entity, legend("edge"), None), Some(true));
    let unbound = epoch(&delta);
    assert_eq!(
        delta.world.topology.edge_count(&unbound),
        EDGES as usize + 1
    );
    assert_eq!(delta.world.topology.endpoints(&unbound, edge), None);

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_edge(entity, legend("edge"), Some(ENDPOINTS[0])),
        Some(true)
    );
    let bound = epoch(&delta);
    assert_eq!(
        delta.world.topology.endpoints(&bound, edge),
        Some(ENDPOINTS[0])
    );
    assert_eq!(delta.world.topology.endpoints(&unbound, edge), None);
    assert_eq!(
        delta
            .world
            .topology
            .incoming(&bound, ENDPOINTS[0][1])
            .collect::<Vec<_>>(),
        [EdgeRowId::MIN, edge]
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(entity), "should withdraw the added edge");
    assert!(
        !delta.withdraw(entity),
        "should leave a repeated edge withdrawal unchanged"
    );
    let hidden = epoch(&delta);
    assert_eq!(delta.world.topology.endpoints(&hidden, edge), None);
    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_edge(entity, legend("edge"), Some(ENDPOINTS[1])),
        Some(true)
    );
    let revived = epoch(&delta);
    assert_eq!(
        delta.world.topology.endpoints(&revived, edge),
        Some(ENDPOINTS[0])
    );
    assert_eq!(
        delta.world.topology.edge_count(&revived),
        EDGES as usize + 1
    );
}

/// An added self-loop follows the visibility of its one endpoint node.
#[test]
fn endpoints_added_self_loop() {
    let (_fixture, mut delta) = fixture("delta-added-self-loop");
    let node_entity = entity(103);
    let edge_entity = entity(104);
    assert_eq!(
        delta.update_node(node_entity, legend("node"), Vec2::ZERO),
        Some(true)
    );
    let row = delta
        .node_row(node_entity)
        .expect("should resolve the node");
    assert_eq!(
        delta.update_edge(edge_entity, legend("edge"), Some([row, row])),
        Some(true)
    );
    let edge = EdgeRowId::new(EDGES);
    let live = epoch(&delta);
    assert_eq!(
        delta
            .world
            .topology
            .incoming(&live, row)
            .collect::<Vec<_>>(),
        [edge]
    );
    assert_eq!(
        delta
            .world
            .topology
            .outgoing(&live, row)
            .collect::<Vec<_>>(),
        [edge]
    );
    delta.revision.increment_by(1);
    assert!(
        delta.withdraw(node_entity),
        "should hide the self-loop's endpoint"
    );
    let hidden = epoch(&delta);
    assert_eq!(delta.world.topology.endpoints(&hidden, edge), None);
    assert_eq!(
        delta
            .world
            .topology
            .incoming(&hidden, row)
            .collect::<Vec<_>>(),
        []
    );
    assert_eq!(
        delta
            .world
            .topology
            .outgoing(&hidden, row)
            .collect::<Vec<_>>(),
        []
    );
}

/// Fitted and added ontology rows keep their identities across icon replacement.
#[test]
fn ontology_icon_replacement() {
    let (_fixture, mut delta) = fixture("delta-ontology-icon-replacement");
    let row = OntologyRowId::MIN;
    let fitted = delta
        .world
        .ontology
        .identity
        .key_of(row)
        .expect("should resolve the fitted type");
    let icon = delta
        .world
        .ontology
        .identity
        .payload_of_row(row)
        .expect("should read the fitted icon")
        .to_owned();
    assert_eq!(delta.register_ontology(fitted, icon), Some((row, false)));
    assert_eq!(
        delta.register_ontology(fitted, OwnedIcon::from("changed")),
        Some((row, true))
    );
    let added: ArchivedOntologyTypeUuid = Uuid::from_u128(101).into();
    let added_row = OntologyRowId::new(TYPES);
    assert_eq!(
        delta.register_ontology(added, OwnedIcon::from("added")),
        Some((added_row, true))
    );
    assert_eq!(
        delta.register_ontology(added, OwnedIcon::from("added")),
        Some((added_row, false))
    );
    let identities = DeltaIdentityProvider::from_parts(
        &delta.ontology,
        NaiveIdentityProvider::from_ref(&delta.world.ontology.identity),
    );
    assert_eq!(
        identities
            .payload_of_row(row)
            .expect("should read the replacement")
            .as_ref(),
        "changed"
    );
    assert_eq!(identities.count(), TYPES as usize + 1);
}

/// Reusing a delta allocation copies component state without mutating a held publication.
#[test]
fn clone_from_publication() {
    let (_fixture, mut source) = fixture("delta-clone-from-publication");
    let mut reusable = source.clone();
    let entity = entity(105);
    assert_eq!(
        source.update_node(entity, legend("added"), Vec2::ZERO),
        Some(true)
    );
    reusable.clone_from(&source);
    let row = source
        .node_row(entity)
        .expect("should resolve the added node");
    let publication = epoch(&reusable);
    source.revision.increment_by(1);
    assert!(source.withdraw(entity), "should withdraw the mutable copy");
    reusable.clone_from(&source);
    let current = epoch(&reusable);
    assert_eq!(reusable.world.layout.position(&current, row), None);
    assert_eq!(
        reusable.world.layout.position(&publication, row),
        Some(Vec2::ZERO)
    );
    assert_eq!(current.revision(), source.revision);
}

/// Normalization uses the fitted bounds rather than the already-normalized geometry bounds.
#[test]
fn normalize_fitted_frame() {
    let (fixture, delta) = fixture("delta-normalize-fitted-frame");
    let bounds = fixture
        .generation()
        .repository()
        .metadata
        .evidence
        .lod
        .world;
    let positions = [bounds.min(), bounds.centre(), bounds.max()];
    let normalized = delta
        .world
        .fitted_bounds()
        .normalize_into(WIRE_FRAME, &positions);
    assert_eq!(
        normalized,
        [Vec2::splat(-1.0), Vec2::ZERO, Vec2::splat(1.0)]
    );
}
