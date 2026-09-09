use alloc::sync::Arc;
use core::{iter, ptr};

use arc_swap::Guard;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{
    Delta, DeltaRevision,
    epoch::Epoch,
    overlay::{DeltaIdentityProvider, NaiveIdentityProvider},
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Label, OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{Bounds2, Log2, Vec2},
    morton::{Depth, MortonCell, Zoom},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{
        fit::prepare::IdentityProvider as _,
        lod::stage::{LodConfig, WIRE_FRAME},
    },
    serve2::{
        schedule::{BucketSchedule, DeliveredNodes, DeliverySchedule, ScopeSchedule, ViewSchedule},
        tests::fixture::{EDGES, ENDPOINTS, NODES, TYPES, TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask},
        walk::Walk,
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
    let world = Arc::clone(&delta.world);
    let before = epoch(&delta);
    let entity = entity(100);
    let position = Vec2::new(0.25, -0.5);
    delta.revision = DeltaRevision::new(1);
    assert_eq!(
        delta.update_node(entity, legend("first"), position),
        Some(true)
    );
    let row = delta.node_row(entity).expect("should allocate a node row");
    let first = epoch(&delta);
    let first_payload = world
        .layout
        .index
        .payload(&first, row)
        .expect("should borrow the added node legend");
    assert!(world.layout.index.payload(&before, row).is_none());
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
    assert_eq!(
        world
            .layout
            .index
            .payload(&revived, row)
            .expect("should borrow the revived node legend")
            .label(),
        "latest"
    );
    assert!(world.layout.index.payload(&withdrawn, row).is_none());
    assert_eq!(first_payload.label(), "first");
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
    let world = Arc::clone(&delta.world);
    let before = epoch(&delta);
    delta.revision.increment_by(1);
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

    let captured = epoch(&delta);
    let rows = [row, added_row];
    let held = rows.map(|row| {
        world
            .ontology
            .payload(&captured, row)
            .expect("should borrow the captured icon")
    });
    assert!(world.ontology.payload(&before, added_row).is_none());
    assert!(world.ontology.icon(&before, added_row).is_none());
    delta.revision.increment_by(1);
    for (key, row) in [fitted, added].into_iter().zip(rows) {
        assert_eq!(
            delta.register_ontology(key, OwnedIcon::from("latest")),
            Some((row, true))
        );
    }
    let replaced = epoch(&delta);
    drop(delta);
    for ((row, icon), expected) in rows.into_iter().zip(held).zip(["changed", "added"]) {
        assert_eq!(icon.as_ref(), expected);
        assert!(
            ptr::eq(
                icon,
                world
                    .ontology
                    .icon(&captured, row)
                    .expect("should borrow the captured icon")
            ),
            "should resolve the same captured payload"
        );
        assert_eq!(
            world
                .ontology
                .icon(&replaced, row)
                .expect("should borrow the replaced icon")
                .as_ref(),
            "latest"
        );
    }
    assert!(world.ontology.icon(&replaced, OntologyRowId::MAX).is_none());
}

#[test]
fn ontology_icon_inherited() {
    let (_fixture, mut delta) = fixture("delta-ontology-icon-inherited");
    let world = Arc::clone(&delta.world);
    let ancestor = OntologyRowId::MIN;
    let child = OntologyRowId::new(1);
    delta.revision.increment_by(1);
    for (row, label) in [(ancestor, "ancestor"), (child, "direct")] {
        let key = world
            .ontology
            .identity
            .key_of(row)
            .expect("should resolve the base type");
        assert_eq!(
            delta.register_ontology(key, OwnedIcon::from(label)),
            Some((row, true))
        );
    }
    let captured = epoch(&delta);
    let inherited = world
        .ontology
        .icon(&captured, child)
        .expect("should borrow the ancestor icon");
    assert_eq!(inherited.as_ref(), "ancestor");
    assert_eq!(
        world
            .ontology
            .payload(&captured, child)
            .expect("should retain the distinct direct icon")
            .as_ref(),
        "direct"
    );
    assert!(
        ptr::eq(
            inherited,
            world
                .ontology
                .payload(&captured, ancestor)
                .expect("should borrow the source payload")
        ),
        "should borrow the ancestor's captured payload"
    );

    delta.revision.increment_by(1);
    let key = world
        .ontology
        .identity
        .key_of(ancestor)
        .expect("should resolve the ancestor");
    assert_eq!(
        delta.register_ontology(key, OwnedIcon::from("latest")),
        Some((ancestor, true))
    );
    let replaced = epoch(&delta);
    drop(delta);
    assert_eq!(
        world
            .ontology
            .icon(&replaced, child)
            .expect("should borrow the replaced ancestor icon")
            .as_ref(),
        "latest"
    );
    assert_eq!(inherited.as_ref(), "ancestor");
}

#[test]
#[should_panic(expected = "ontology must belong to the epoch's world")]
fn ontology_icon_foreign_world() {
    let (_left_files, left) = fixture("delta-ontology-icon-foreign-left");
    let (_right_files, right) = fixture("delta-ontology-icon-foreign-right");
    let foreign = epoch(&right);
    let _icon = left.world.ontology.icon(&foreign, OntologyRowId::MIN);
}

/// Base payload queries borrow the mapped legend without copying it.
#[test]
fn payload_base() {
    let (_fixture, mut delta) = fixture("delta-payload-base");
    let world = Arc::clone(&delta.world);
    let captured = epoch(&delta);
    let mapped = world
        .topology
        .identity
        .payload_of_row(EdgeRowId::MIN)
        .expect("should read the base legend");
    let payload = world
        .topology
        .payload(&captured, EdgeRowId::MIN)
        .expect("should borrow the base legend");

    assert!(
        ptr::eq(mapped, payload),
        "should borrow the same mapped legend"
    );
    assert!(world.topology.payload(&captured, EdgeRowId::MAX).is_none());

    let node = NodeRowId::MIN;
    let mapped_node = world
        .layout
        .index
        .identity
        .payload_of_row(node)
        .expect("should read the base node legend");
    let node_payload = world
        .layout
        .index
        .payload(&captured, node)
        .expect("should borrow the base node legend");
    assert!(
        ptr::eq(mapped_node, node_payload),
        "should borrow the same mapped node legend"
    );
    assert!(
        world
            .layout
            .index
            .payload(&captured, NodeRowId::MAX)
            .is_none()
    );

    let ontology = OntologyRowId::MIN;
    let mapped_icon = world
        .ontology
        .identity
        .payload_of_row(ontology)
        .expect("should read the base icon");
    let icon = world
        .ontology
        .payload(&captured, ontology)
        .expect("should borrow the base icon");
    assert!(
        ptr::eq(mapped_icon, icon),
        "should borrow the same mapped icon"
    );
    assert!(
        world
            .ontology
            .payload(&captured, OntologyRowId::MAX)
            .is_none()
    );

    let key = world
        .layout
        .index
        .identity
        .key_of(node)
        .expect("should resolve the base node");
    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(key, legend("replacement"), Vec2::ZERO),
        Some(true)
    );
    let replaced = epoch(&delta);
    assert_eq!(
        world
            .layout
            .index
            .payload(&replaced, node)
            .expect("should borrow the replacement legend")
            .label(),
        "replacement"
    );
    drop(delta);
    assert_eq!(payload.label(), mapped.label());
    assert_eq!(node_payload.label(), mapped_node.label());
    assert_eq!(icon.as_ref(), mapped_icon.as_ref());
}

/// Captures retain base overrides and added legends through withdrawal and revival.
#[test]
fn payload_captures() {
    let (_fixture, mut delta) = fixture("delta-payload-captures");
    let world = Arc::clone(&delta.world);
    let rows = [EdgeRowId::MIN, EdgeRowId::new(EDGES)];
    let keys = [
        world
            .topology
            .identity
            .key_of(rows[0])
            .expect("should resolve the base edge"),
        entity(903),
    ];
    let before = epoch(&delta);
    assert!(world.topology.payload(&before, rows[1]).is_none());

    delta.revision.increment_by(1);
    for key in keys {
        assert_eq!(
            delta.update_edge(key, legend("first"), Some(ENDPOINTS[0])),
            Some(true)
        );
    }
    let captured = epoch(&delta);
    let held = rows.map(|row| {
        world
            .topology
            .payload(&captured, row)
            .expect("should borrow the captured legend")
    });

    delta.revision.increment_by(1);
    for key in keys {
        assert!(delta.withdraw(key), "should withdraw the edge");
    }
    let withdrawn = epoch(&delta);
    for row in rows {
        assert!(world.topology.payload(&withdrawn, row).is_none());
    }

    delta.revision.increment_by(1);
    for key in keys {
        assert_eq!(
            delta.update_edge(key, legend("revived"), Some(ENDPOINTS[0])),
            Some(true)
        );
    }
    let revived = epoch(&delta);
    drop(delta);
    for (row, payload) in rows.into_iter().zip(held) {
        assert_eq!(payload.label(), "first");
        assert_eq!(
            world
                .topology
                .payload(&revived, row)
                .expect("should borrow the revived legend")
                .label(),
            "revived"
        );
        assert!(world.topology.payload(&withdrawn, row).is_none());
    }
    assert!(world.topology.payload(&before, rows[1]).is_none());
}

/// Captured ontology keys exclude later registrations and unknown rows.
#[test]
fn ontology_keys_captured() {
    let (_fixture, mut delta) = fixture("delta-ontology-keys-captured");
    let world = Arc::clone(&delta.world);
    let base = OntologyRowId::MIN;
    let base_key = world
        .ontology
        .identity
        .key_of(base)
        .expect("should resolve the base type");
    let before = epoch(&delta);
    assert_eq!(world.ontology.key_of(&before, base), Some(base_key));
    assert_eq!(world.ontology.key_of(&before, OntologyRowId::MAX), None);

    let added: ArchivedOntologyTypeUuid = Uuid::from_u128(904).into();
    let row = OntologyRowId::new(TYPES);
    delta.revision.increment_by(1);
    assert_eq!(
        delta.register_ontology(added, OwnedIcon::from("added")),
        Some((row, true))
    );
    let captured = epoch(&delta);
    drop(delta);

    assert_eq!(world.ontology.key_of(&captured, base), Some(base_key));
    assert_eq!(world.ontology.key_of(&captured, row), Some(added));
    assert_eq!(world.ontology.key_of(&before, row), None);
    assert_eq!(world.ontology.key_of(&captured, OntologyRowId::MAX), None);
}

#[test]
#[should_panic(expected = "topology must belong to the epoch's world")]
fn payload_foreign_world() {
    let (_left_files, left) = fixture("delta-payload-foreign-left");
    let (_right_files, right) = fixture("delta-payload-foreign-right");
    let _payload = left.world.topology.payload(&epoch(&right), EdgeRowId::MIN);
}

#[test]
#[should_panic(expected = "ontology must belong to the epoch's world")]
fn ontology_keys_foreign_world() {
    let (_left_files, left) = fixture("delta-ontology-foreign-left");
    let (_right_files, right) = fixture("delta-ontology-foreign-right");
    let _key = left
        .world
        .ontology
        .key_of(&epoch(&right), OntologyRowId::MIN);
}

#[test]
#[should_panic(expected = "index must belong to the epoch's world")]
fn node_payload_foreign_world() {
    let (_left_files, left) = fixture("delta-node-payload-foreign-left");
    let (_right_files, right) = fixture("delta-node-payload-foreign-right");
    let foreign = epoch(&right);
    let _payload = left.world.layout.index.payload(&foreign, NodeRowId::MIN);
}

#[test]
#[should_panic(expected = "ontology must belong to the epoch's world")]
fn ontology_payload_foreign_world() {
    let (_left_files, left) = fixture("delta-ontology-payload-foreign-left");
    let (_right_files, right) = fixture("delta-ontology-payload-foreign-right");
    let foreign = epoch(&right);
    let _payload = left.world.ontology.payload(&foreign, OntologyRowId::MIN);
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

/// Schedule construction composes the mask with captured placement visibility.
#[test]
fn schedule_captured_visibility() {
    let (_fixture, mut delta) = fixture("delta-schedule-captured");
    let fitted = NodeRowId::MIN;
    let fitted_id = delta
        .world
        .layout
        .index
        .identity
        .key_of(fitted)
        .expect("should resolve the fitted identity");
    let position = delta
        .world
        .layout
        .position(&epoch(&delta), fitted)
        .expect("should resolve the fitted placement");
    let higher = entity(200);
    let lower = entity(100);
    assert_eq!(
        delta.update_node(higher, legend("higher"), position),
        Some(true)
    );
    assert_eq!(
        delta.update_node(lower, legend("lower"), position),
        Some(true)
    );
    let higher_row = delta
        .node_row(higher)
        .expect("should resolve the added row");
    let lower_row = delta.node_row(lower).expect("should resolve the added row");
    let mut nodes = CompressedBitSet::default();
    for row in [fitted, higher_row, lower_row] {
        nodes.insert(row);
    }
    let captured = epoch(&delta);
    let mask = VisibilityMask::partial(
        &captured,
        VisibilityActor {
            id: ActorId::new(Uuid::nil(), ActorType::Machine),
            instance_admin: false,
        },
        nodes,
        CompressedBitSet::default(),
    );
    let buckets = BucketSchedule::new(LodConfig {
        span: Log2::new(0).expect("should fit the exponent domain"),
        max_tile_depth: Zoom::new(1).expect("should fit the zoom domain"),
    })
    .expect("should fit the key width");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let leaf_zoom = Zoom::new(1).expect("should fit the zoom domain");
    let (before, _) = ScopeSchedule::of(&delta.world.layout, &captured, &mask);
    let before_cut = before.cut(buckets, Zoom::MIN).expect("should bind the cut");
    assert_eq!(before_cut.total(Zoom::MIN, root).rows, [fitted]);
    assert_eq!(
        before_cut.total(leaf_zoom, root).rows,
        [fitted, lower_row, higher_row]
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(fitted_id), "should withdraw the fitted row");
    assert!(
        delta.withdraw(lower),
        "should withdraw the better added priority"
    );
    let hidden = epoch(&delta);
    let (after, _) = ScopeSchedule::of(&delta.world.layout, &hidden, &mask);
    let after_cut = after.cut(buckets, Zoom::MIN).expect("should bind the cut");
    assert_eq!(after_cut.total(Zoom::MIN, root).rows, [higher_row]);
    assert_eq!(after_cut.root_delivered(), 1);
    assert_eq!(after_cut.min_resolution(), Depth::MIN);
    assert_eq!(after_cut.children(Zoom::MIN, root), 0);
    assert_eq!(after_cut.first_zoom(fitted), None);
    assert_eq!(after_cut.first_zoom(lower_row), None);
    let (rebuilt, _) = ScopeSchedule::of(&delta.world.layout, &captured, &mask);
    assert_eq!(
        rebuilt
            .cut(buckets, Zoom::MIN)
            .expect("should bind the cut")
            .total(leaf_zoom, root),
        before_cut.total(leaf_zoom, root)
    );

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(fitted_id, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    let (revived, _) = ScopeSchedule::of(&delta.world.layout, &epoch(&delta), &mask);
    assert_eq!(
        revived
            .cut(buckets, Zoom::MIN)
            .expect("should bind the cut")
            .total(leaf_zoom, root)
            .rows,
        [fitted, higher_row]
    );
}

#[test]
fn schedule_corpus_withdrawal() {
    let (_fixture, mut delta) = fixture("schedule-corpus-withdrawal");
    let world = Arc::clone(&delta.world);
    let schedule = DeliverySchedule::corpus(&world);
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let zoom = world.schedule().max_tile_depth();
    let baseline = schedule.total(zoom, root);
    let root_count = schedule.root_delivered();
    let resolution = schedule.min_resolution();
    let node = NodeRowId::MIN;
    let identity = world
        .layout
        .index
        .identity
        .key_of(node)
        .expect("should resolve the fitted identity");
    let captured = epoch(&delta);

    delta.revision.increment_by(1);
    assert!(delta.withdraw(identity), "should withdraw the fitted row");
    let withdrawn = epoch(&delta);
    assert!(world.layout.position(&captured, node).is_some());
    assert_eq!(world.layout.position(&withdrawn, node), None);
    assert_eq!(schedule.total(zoom, root), baseline);
    assert_eq!(schedule.root_delivered(), root_count);
    assert_eq!(schedule.min_resolution(), resolution);
    assert!(schedule.bucket_of(node).is_some());

    let mut nodes = CompressedBitSet::default();
    for row in 0..NODES {
        nodes.insert(NodeRowId::new(row));
    }
    let mask = VisibilityMask::partial(
        &withdrawn,
        VisibilityActor {
            id: ActorId::new(Uuid::nil(), ActorType::Machine),
            instance_admin: false,
        },
        nodes,
        CompressedBitSet::default(),
    );
    let (scope, _) = ScopeSchedule::of(&world.layout, &withdrawn, &mask);
    let cut = scope
        .cut(world.schedule(), Zoom::MIN)
        .expect("should bind the scoped schedule");
    assert_eq!(cut.bucket_of(node), None);
    assert_eq!(cut.total(zoom, root).rows.len() + 1, baseline.rows.len());
}

fn schedule_mask(epoch: &Epoch, nodes: impl IntoIterator<Item = NodeRowId>) -> VisibilityMask {
    let mut mask = CompressedBitSet::default();
    for node in nodes {
        mask.insert(node);
    }
    VisibilityMask::partial(
        epoch,
        VisibilityActor {
            id: ActorId::new(Uuid::nil(), ActorType::Machine),
            instance_admin: false,
        },
        mask,
        CompressedBitSet::default(),
    )
}

#[test]
fn bounds_extension() {
    let (_fixture, mut delta) = fixture("view-bounds-extension");
    let world = Arc::clone(&delta.world);
    let visible = entity(100);
    let hidden = entity(200);
    let position = Vec2::new(-2.0, 3.0);
    assert_eq!(
        delta.update_node(visible, legend("visible"), position),
        Some(true)
    );
    assert_eq!(
        delta.update_node(hidden, legend("hidden"), Vec2::new(4.0, -5.0)),
        Some(true)
    );
    let row = delta
        .node_row(visible)
        .expect("should allocate the visible row");
    let captured = epoch(&delta);
    let admitted = schedule_mask(&captured, (0..NODES).map(NodeRowId::new).chain([row]));
    let saturated = ViewSchedule::of(Arc::clone(&world), &captured, &admitted);
    let point = Bounds2::new(position, position).expect("should bound the finite point");
    let base = world.layout.base_bounds().expect("should have base points");
    assert_eq!(saturated.bounds(), Some(base.union(point)));

    let narrow = ViewSchedule::of(
        Arc::clone(&world),
        &captured,
        &schedule_mask(&captured, [row]),
    );
    assert_eq!(narrow.bounds(), Some(point));
    let occupancy = narrow
        .occupancy()
        .expect("a scope should have an occupancy profile");
    assert_eq!(occupancy.distinct_keys(), 1);
    let full = VisibilityMask::full(
        &captured,
        VisibilityActor {
            id: ActorId::new(Uuid::nil(), ActorType::Machine),
            instance_admin: false,
        },
    );
    let corpus = ViewSchedule::of(Arc::clone(&world), &captured, &full);
    assert_eq!(
        corpus.bounds(),
        Bounds2::new(Vec2::new(-2.0, -5.0), Vec2::new(4.0, 3.0))
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(visible));
    let withdrawn = epoch(&delta);
    let current = ViewSchedule::of(
        Arc::clone(&world),
        &withdrawn,
        &schedule_mask(&withdrawn, [row]),
    );
    assert_eq!(current.bounds(), None);
    assert!(
        current
            .occupancy()
            .expect("an empty scope should have a profile")
            .is_empty()
    );
    assert_eq!(narrow.occupancy(), Some(occupancy));
    let current = ViewSchedule::of(Arc::clone(&world), &withdrawn, &admitted);
    assert_eq!(current.bounds(), Some(base));
    assert_eq!(narrow.bounds(), Some(point));
    assert_eq!(saturated.bounds(), Some(base.union(point)));

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(visible, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    let revived = epoch(&delta);
    let current = ViewSchedule::of(
        Arc::clone(&world),
        &revived,
        &schedule_mask(&revived, [row]),
    );
    assert_eq!(current.bounds(), Some(point));
}

#[test]
fn bounds_base_withdrawal() {
    let (_fixture, mut delta) = fixture("view-bounds-base-withdrawal");
    let world = Arc::clone(&delta.world);
    let recorded = world.layout.base_bounds();
    let initial = epoch(&delta);
    let mask = schedule_mask(&initial, (0..NODES).map(NodeRowId::new));
    let captured = ViewSchedule::of(Arc::clone(&world), &initial, &mask);

    delta.revision.increment_by(1);
    for index in 0..NODES {
        let identity = world
            .layout
            .index
            .identity
            .key_of(NodeRowId::new(index))
            .expect("should resolve the base identity");
        assert!(delta.withdraw(identity));
    }
    let withdrawn = epoch(&delta);
    let scoped = ViewSchedule::of(Arc::clone(&world), &withdrawn, &mask);
    assert_eq!(scoped.bounds(), None);
    assert_eq!(captured.bounds(), recorded);
    let full = VisibilityMask::full(
        &withdrawn,
        VisibilityActor {
            id: ActorId::new(Uuid::nil(), ActorType::Machine),
            instance_admin: false,
        },
    );
    let corpus = ViewSchedule::of(Arc::clone(&world), &withdrawn, &full);
    assert_eq!(corpus.bounds(), recorded);
}

#[test]
#[should_panic(expected = "visible placements must have finite coordinates")]
fn bounds_nonfinite_placement() {
    let (_fixture, mut delta) = fixture("view-bounds-nonfinite");
    let identity = entity(100);
    assert_eq!(
        delta.update_node(identity, legend("nonfinite"), Vec2::new(f32::NAN, 0.0)),
        Some(true)
    );
    let row = delta.node_row(identity).expect("should allocate the row");
    let captured = epoch(&delta);
    let base = ViewSchedule::of(
        Arc::clone(&delta.world),
        &captured,
        &schedule_mask(&captured, (0..NODES).map(NodeRowId::new)),
    );
    assert_eq!(base.bounds(), delta.world.layout.base_bounds());
    ViewSchedule::of(
        Arc::clone(&delta.world),
        &captured,
        &schedule_mask(&captured, [row]),
    );
}

#[track_caller]
fn assert_scoped_delivery(world: &Arc<World>, epoch: &Epoch, mask: &VisibilityMask) {
    let view = ViewSchedule::of(Arc::clone(world), epoch, mask);
    let (combined, bounds) = ScopeSchedule::of(&world.layout, epoch, mask);
    assert_eq!(view.bounds(), bounds);
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    for offset in [0, 1, 5] {
        let offset = Zoom::new(offset).expect("should fit the offset");
        let actual = view.cut(offset).expect("should bind the view");
        let expected = combined
            .cut(world.schedule(), offset)
            .expect("should bind the combined cascade");
        assert_eq!(actual.root_delivered(), expected.root_delivered());
        assert_eq!(actual.min_resolution(), expected.min_resolution());
        for index in 0..=world.layout.node_count(epoch) {
            let node = NodeRowId::from_usize(index);
            assert_eq!(actual.bucket_of(node), expected.bucket_of(node));
            assert_eq!(actual.first_zoom(node), expected.first_zoom(node));
        }
        for zoom in 0..=world.schedule().max_tile_depth().get() {
            let zoom = Zoom::new(zoom).expect("should fit the served zoom");
            for cell in iter::once(root).chain(root.children().expect("should have root children"))
            {
                assert_eq!(actual.total(zoom, cell), expected.total(zoom, cell));
                assert_eq!(actual.delta(zoom, cell), expected.delta(zoom, cell));
                assert_eq!(actual.children(zoom, cell), expected.children(zoom, cell));
            }
        }
    }
}

#[test]
fn schedule_extension_visibility() {
    let (_fixture, mut delta) = fixture("schedule-extension-visibility");
    let world = Arc::clone(&delta.world);
    let base = NodeRowId::MIN;
    let position = world
        .layout
        .position(&epoch(&delta), base)
        .expect("should resolve the base position");
    let higher = entity(300);
    let lower = entity(200);
    let hidden = entity(100);
    for identity in [higher, lower, hidden] {
        assert_eq!(
            delta.update_node(identity, legend("extension"), position),
            Some(true)
        );
    }
    let higher_row = delta
        .node_row(higher)
        .expect("should allocate the higher row");
    let lower_row = delta
        .node_row(lower)
        .expect("should allocate the lower row");
    let hidden_row = delta
        .node_row(hidden)
        .expect("should allocate the hidden row");
    let captured = epoch(&delta);
    let mask = schedule_mask(
        &captured,
        (0..NODES)
            .map(NodeRowId::new)
            .chain([higher_row, lower_row]),
    );
    assert_scoped_delivery(&world, &captured, &mask);
    let before = ViewSchedule::of(Arc::clone(&world), &captured, &mask);
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let zoom = world.schedule().max_tile_depth();
    let cut = before.cut(Zoom::MIN).expect("should bind the view");
    let baseline = cut.total(zoom, root);
    assert_eq!(cut.bucket_of(hidden_row), None);
    assert_eq!(
        baseline.rows.len(),
        usize::try_from(NODES).expect("should fit the fixture count") + 2
    );
    let at = |node| {
        baseline
            .rows
            .iter()
            .position(|&row| row == node)
            .expect("should deliver the row")
    };
    assert!(at(base) < at(lower_row));
    assert!(at(lower_row) < at(higher_row));
    let base_only = ViewSchedule::of(
        Arc::clone(&world),
        &captured,
        &schedule_mask(&captured, (0..NODES).map(NodeRowId::new)),
    );
    assert_eq!(before.occupancy(), base_only.occupancy());

    delta.revision.increment_by(1);
    assert!(delta.withdraw(lower), "should withdraw the extension row");
    let withdrawn = epoch(&delta);
    assert_scoped_delivery(&world, &withdrawn, &mask);
    let after = ViewSchedule::of(Arc::clone(&world), &withdrawn, &mask);
    assert_eq!(
        after
            .cut(Zoom::MIN)
            .expect("should bind the view")
            .bucket_of(lower_row),
        None
    );
    assert_eq!(
        before
            .cut(Zoom::MIN)
            .expect("should bind the captured view")
            .total(zoom, root),
        baseline
    );
    assert_scoped_delivery(&world, &captured, &mask);

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(lower, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    let revived = ViewSchedule::of(Arc::clone(&world), &epoch(&delta), &mask);
    assert_eq!(
        revived
            .cut(Zoom::MIN)
            .expect("should bind the revived view")
            .total(zoom, root),
        baseline
    );
}

#[test]
fn schedule_base_withdrawal_dispatch() {
    let (_fixture, mut delta) = fixture("schedule-base-withdrawal-dispatch");
    let world = Arc::clone(&delta.world);
    let base = NodeRowId::MIN;
    let base_identity = world
        .layout
        .index
        .identity
        .key_of(base)
        .expect("should resolve the base identity");
    let position = world
        .layout
        .position(&epoch(&delta), base)
        .expect("should resolve the base position");
    let extension = entity(100);
    assert_eq!(
        delta.update_node(extension, legend("extension"), position),
        Some(true)
    );
    let extension_row = delta
        .node_row(extension)
        .expect("should allocate the extension row");
    let captured = epoch(&delta);
    let partial = schedule_mask(&captured, (0..=NODES).map(NodeRowId::new));
    let full = VisibilityMask::full(
        &captured,
        VisibilityActor {
            id: ActorId::new(Uuid::nil(), ActorType::Machine),
            instance_admin: false,
        },
    );
    let corpus = ViewSchedule::of(Arc::clone(&world), &captured, &full);
    let baseline = corpus.cut(Zoom::MIN).expect("should bind the corpus");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let zoom = world.schedule().max_tile_depth();
    assert_eq!(baseline.bucket_of(extension_row), Some(baseline.deepest()));
    assert_eq!(
        baseline.total(zoom, root).rows.len(),
        usize::try_from(NODES).expect("should fit the fixture count") + 1
    );
    assert_scoped_delivery(&world, &captured, &partial);

    delta.revision.increment_by(1);
    assert!(
        delta.withdraw(base_identity),
        "should withdraw the base row"
    );
    let withdrawn = epoch(&delta);
    assert_scoped_delivery(&world, &withdrawn, &partial);
    let scoped = ViewSchedule::of(Arc::clone(&world), &withdrawn, &partial);
    assert_eq!(
        scoped
            .cut(Zoom::MIN)
            .expect("should bind the scoped view")
            .bucket_of(base),
        None
    );
    let corpus_after = ViewSchedule::of(Arc::clone(&world), &withdrawn, &full);
    let recorded = corpus_after
        .cut(Zoom::MIN)
        .expect("should bind the recorded view");
    assert_eq!(recorded.total(zoom, root), baseline.total(zoom, root));
    assert_eq!(recorded.root_delivered(), baseline.root_delivered());
    assert_eq!(recorded.min_resolution(), baseline.min_resolution());
    assert_eq!(
        recorded.first_zoom(extension_row),
        baseline.first_zoom(extension_row)
    );
    assert_eq!(
        recorded.children(Zoom::MIN, root),
        baseline.children(Zoom::MIN, root)
    );

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(base_identity, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    assert_scoped_delivery(&world, &epoch(&delta), &partial);
}

#[track_caller]
fn assert_partitioned(delivered: &DeliveredNodes) {
    assert_eq!(
        delivered.runs.iter().sum::<usize>(),
        delivered.rows.len(),
        "the runs should re-sum to the delivered count"
    );
}

/// A corpus walk subtracts the publication's current withdrawals that the recorded schedule
/// preserves, and a revival restores the recorded delivery.
#[test]
fn walk_corpus_withdrawal() {
    let (_fixture, mut delta) = fixture("walk-corpus-withdrawal");
    let world = Arc::clone(&delta.world);
    let walk = Walk {
        schedule: DeliverySchedule::corpus(&world),
        index: &world.layout.index,
    };
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let zoom = world.schedule().max_tile_depth();
    let node = NodeRowId::MIN;
    let identity = world
        .layout
        .index
        .identity
        .key_of(node)
        .expect("should resolve the fitted identity");

    let captured = epoch(&delta);
    let recorded = walk.schedule.total(zoom, root);
    assert_eq!(walk.total(&captured, zoom, root), recorded);
    assert_eq!(
        walk.delta(&captured, Zoom::MIN, root),
        walk.schedule.delta(Zoom::MIN, root)
    );

    delta.revision.increment_by(1);
    assert!(delta.withdraw(identity), "should withdraw the fitted row");
    let withdrawn = epoch(&delta);
    assert_eq!(
        walk.schedule.total(zoom, root),
        recorded,
        "the recorded schedule should preserve the withdrawn row"
    );

    let subtracted = walk.total(&withdrawn, zoom, root);
    assert!(
        !subtracted.rows.contains(&node),
        "the withdrawn row should leave the delivery"
    );
    assert_eq!(subtracted.rows.len() + 1, recorded.rows.len());
    assert_eq!(subtracted.first_bucket, recorded.first_bucket);
    assert_eq!(subtracted.runs.len(), recorded.runs.len());
    assert_partitioned(&subtracted);
    assert_eq!(
        walk.total(&captured, zoom, root),
        recorded,
        "the earlier epoch should preserve its delivery"
    );

    let bucket = walk
        .schedule
        .bucket_of(node)
        .expect("the recorded schedule should keep the withdrawn row");
    let index = usize::from(bucket.get() - recorded.first_bucket.get());
    assert_eq!(
        subtracted.runs[index] + 1,
        recorded.runs[index],
        "the withdrawal should debit the row's own bucket"
    );

    delta.revision.increment_by(1);
    assert_eq!(
        delta.update_node(identity, legend("revived"), Vec2::ZERO),
        Some(true)
    );
    assert_eq!(
        walk.total(&epoch(&delta), zoom, root),
        recorded,
        "a revival should restore the recorded delivery"
    );
}

/// A scoped walk subtracts a withdrawal newer than the schedule it reads.
#[test]
fn walk_scope_withdrawal() {
    let (_fixture, mut delta) = fixture("walk-scope-withdrawal");
    let world = Arc::clone(&delta.world);
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("should construct the root");
    let zoom = world.schedule().max_tile_depth();
    let node = NodeRowId::MIN;
    let identity = world
        .layout
        .index
        .identity
        .key_of(node)
        .expect("should resolve the fitted identity");

    let captured = epoch(&delta);
    let mask = schedule_mask(&captured, (0..NODES).map(NodeRowId::new));
    let view = ViewSchedule::of(Arc::clone(&world), &captured, &mask);
    let walk = Walk {
        schedule: view.cut(Zoom::MIN).expect("should bind the view"),
        index: &world.layout.index,
    };
    let recorded = walk.schedule.total(zoom, root);
    assert!(
        recorded.rows.contains(&node),
        "the captured schedule should deliver the row"
    );
    assert_eq!(walk.total(&captured, zoom, root), recorded);

    delta.revision.increment_by(1);
    assert!(delta.withdraw(identity), "should withdraw the fitted row");
    let subtracted = walk.total(&epoch(&delta), zoom, root);
    assert!(
        !subtracted.rows.contains(&node),
        "the withdrawn row should leave the captured delivery"
    );
    assert_eq!(subtracted.rows.len() + 1, recorded.rows.len());
    assert_partitioned(&subtracted);
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
    let normalized = delta.world.bounds().normalize_into(WIRE_FRAME, &positions);
    assert_eq!(
        normalized,
        [Vec2::splat(-1.0), Vec2::ZERO, Vec2::splat(1.0)]
    );
}
