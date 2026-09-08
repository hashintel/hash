use alloc::sync::Arc;

use arc_swap::Guard;
use error_stack::Report;
use hash_graph_postgres_store::store::{EntityDeletion, EntityEnd, EntityEvent};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::{collections::FastHashMap, id::Id as _};
use rand::{SeedableRng as _, rngs::StdRng};
use tokio::sync::mpsc;
use type_system::{
    knowledge::entity::{EntityId, id::EntityEditionId, provenance::EntityDeletionProvenance},
    principal::actor::ActorEntityUuid,
};
use uuid::Uuid;

use super::{DeltaAction, Geometry, Pending, Stage};
use crate::{
    dataset::{
        PROJECTOR_DIMENSIONS,
        auxiliary::{Label, OwnedIcon, OwnedLabel, OwnedLegend},
    },
    identity::{NodeRowId, OntologyRowId},
    math::{Bounds2, BoxedVecN, Vec2},
    postgres::{Classification, edition_display::DisplayParts, id::ArchivedEntityId},
    salt::{fit::prepare::IdentityProvider as _, lod::stage::WIRE_FRAME},
    serve2::{
        delta::{
            Delta,
            epoch::Epoch,
            feed::{
                pump,
                tests::{entity, update},
            },
            overlay::{DeltaIdentityProvider, NaiveIdentityProvider},
            placement::{Completed, PendingEntry, PlacementError},
            projector::{Position, projector},
        },
        tests::fixture::{TamperFixture, secret},
        world::World,
    },
};

struct Fixture {
    _generation: TamperFixture,
    delta: Delta,
}

fn fixture(name: &str) -> Fixture {
    let generation = TamperFixture::publish(name);
    let world = World::open(generation.generation().clone(), &secret())
        .expect("should open the synthetic world");
    let delta =
        Delta::new(Arc::new(world), StdRng::seed_from_u64(12)).expect("should create a delta");
    Fixture {
        _generation: generation,
        delta,
    }
}

fn queue_node(pending: &mut Pending, delta: &Delta, seed: u128, seconds: i64) {
    pending.observe(update(seed, seconds, false));
    pending.classify(
        delta,
        [(ArchivedEntityId::from(entity(seed)), Classification::Node)],
    );
}

fn display(label: &str) -> DisplayParts {
    DisplayParts {
        label: OwnedLabel::from(label),
        icon: OwnedIcon::from("icon"),
        representative: Uuid::from_u128(1000).into(),
    }
}

fn projected() -> Position {
    projector(None)
        .project([&BoxedVecN::zero()])
        .next()
        .expect("should return a projection")
        .expect("should project a finite position")
}

fn epoch(delta: &Delta) -> Epoch {
    Epoch::from(Guard::from_inner(Arc::new(delta.clone())))
}

fn displays(
    pairs: impl IntoIterator<Item = (EntityEditionId, Option<DisplayParts>)>,
) -> FastHashMap<EntityEditionId, Option<DisplayParts>> {
    let mut map = FastHashMap::default();
    map.extend(pairs);
    map
}

/// Overlap retains the pending phase and edition until a strictly newer event replaces them.
#[test]
fn observe_overlap() {
    let mut pending = Pending::default();
    let entity = ArchivedEntityId::from(entity(1));
    assert!(matches!(
        pending.observe(update(1, 10, false)),
        DeltaAction::None
    ));
    let first = pending.updates[&entity].id;
    pending
        .updates
        .get_mut(&entity)
        .expect("should retain the update")
        .stage = Stage::Place;
    assert!(matches!(
        pending.observe(update(1, 10, false)),
        DeltaAction::None
    ));
    assert!(matches!(
        pending.observe(update(1, 9, true)),
        DeltaAction::None
    ));
    assert_eq!(pending.updates[&entity].id, first);
    assert!(matches!(pending.updates[&entity].stage, Stage::Place));
    assert_eq!(pending.updates.len(), 1);
    assert!(matches!(
        pending.observe(update(1, 11, false)),
        DeltaAction::None
    ));
    assert_ne!(pending.updates[&entity].id, first);
    assert!(matches!(pending.updates[&entity].stage, Stage::Classify));
    assert_eq!(pending.updates.len(), 1);
}

/// A replacement waits for the previous request, whose completion cannot apply to it.
#[test]
fn receive_superseded() {
    let mut pending = Pending::default();
    let raw = entity(1);
    let entity = ArchivedEntityId::from(raw);

    pending.observe(update(1, 1, false));
    pending
        .updates
        .get_mut(&entity)
        .expect("should retain the node")
        .stage = Stage::Place;
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let first = requests
        .try_recv()
        .expect("should submit the first update")
        .event;

    pending.observe(update(1, 2, false));
    let second = pending.updates[&entity].id;
    pending
        .updates
        .get_mut(&entity)
        .expect("should retain the replacement")
        .stage = Stage::Place;
    assert!(
        !pending.has_placements(),
        "should wait for the outstanding request"
    );
    assert!(pump(&mut pending, &tx, None).is_continue());
    assert!(requests.try_recv().is_err());

    pending.receive(PendingEntry {
        event: second,
        entity: raw,
        phase: Completed(Ok(projected())),
    });
    assert!(
        pending.placements.contains_key(&entity),
        "should ignore an unsubmitted ID"
    );
    assert!(!pending.has_placements());

    pending.receive(PendingEntry {
        event: first,
        entity: raw,
        phase: Completed(Ok(projected())),
    });
    assert!(
        !pending.placements.contains_key(&entity),
        "should discard the superseded result, but still free the outstanding slot"
    );
    assert!(matches!(pending.updates[&entity].stage, Stage::Place));
    assert!(
        pending.has_placements(),
        "should release the waiting replacement"
    );

    assert!(pump(&mut pending, &tx, None).is_continue());
    assert_eq!(
        requests
            .try_recv()
            .expect("should submit the replacement")
            .event,
        second
    );
    pending.receive(PendingEntry {
        event: first,
        entity: raw,
        phase: Completed(Ok(projected())),
    });
    assert!(
        pending.placements.contains_key(&entity),
        "should ignore a repeated old completion"
    );

    pending.receive(PendingEntry {
        event: second,
        entity: raw,
        phase: Completed(Ok(projected())),
    });
    assert!(!pending.placements.contains_key(&entity));
    assert!(matches!(
        pending.updates[&entity].stage,
        Stage::Normalize(_)
    ));
}

/// Every removal cancels its update while retaining the outstanding placement until completion.
#[test]
fn observe_removals() {
    let id = entity(1);
    let entity = ArchivedEntityId::from(id);
    let removals = [
        update(1, 2, true),
        EntityEvent::Ended(EntityEnd {
            entity: id,
            ended_at: Timestamp::from_unix_timestamp(2),
        }),
        EntityEvent::Deleted(EntityDeletion {
            entity: id,
            provenance: EntityDeletionProvenance {
                deleted_by_id: ActorEntityUuid::new(Uuid::from_u128(4)),
                deleted_at_transaction_time: Timestamp::from_unix_timestamp(2),
                deleted_at_decision_time: Timestamp::from_unix_timestamp(2),
            },
        }),
    ];
    for removal in removals {
        let mut pending = Pending::default();
        pending.observe(update(1, 1, false));
        pending
            .updates
            .get_mut(&entity)
            .expect("should retain the node")
            .stage = Stage::Place;
        let (tx, mut requests) = mpsc::channel(1);
        assert!(pump(&mut pending, &tx, None).is_continue());
        let first = requests.try_recv().expect("should submit the node").event;

        assert!(
            matches!(pending.observe(removal), DeltaAction::Withdraw(withdrawn) if withdrawn == entity)
        );
        assert!(pending.updates.is_empty());
        assert!(
            pending.placements.contains_key(&entity),
            "should retain the outstanding request after withdrawal"
        );

        pending.observe(update(1, 1, false));
        assert!(pending.updates.is_empty(), "should reject the stale repeat");

        pending.receive(PendingEntry {
            event: first,
            entity: id,
            phase: Completed(Ok(projected())),
        });
        assert!(
            pending.updates.is_empty(),
            "should leave removed work absent"
        );
        assert!(pending.placements.is_empty());
    }
}

/// Equal entity UUIDs in different webs have independent versions and outstanding requests.
#[test]
fn observe_other_web() {
    let mut pending = Pending::default();
    let first_id = entity(1);
    let mut second_id = first_id;
    second_id.web_id = type_system::principal::actor_group::WebId::new(Uuid::from_u128(2));

    pending.observe(update(1, 10, false));
    let EntityEvent::Updated(mut other) = update(1, 1, false) else {
        unreachable!()
    };
    other.entity = second_id;
    pending.observe(EntityEvent::Updated(other));
    assert_eq!(pending.updates.len(), 2);

    let first = ArchivedEntityId::from(first_id);
    let second = ArchivedEntityId::from(second_id);
    pending
        .updates
        .get_mut(&first)
        .expect("should retain the node")
        .stage = Stage::Place;
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let request = requests
        .try_recv()
        .expect("should submit the first web's update")
        .event;

    pending.receive(PendingEntry {
        event: request,
        entity: second_id,
        phase: Completed(Ok(projected())),
    });
    assert!(
        pending.placements.contains_key(&first),
        "should leave the other web's request outstanding"
    );

    pending.receive(PendingEntry {
        event: request,
        entity: first_id,
        phase: Completed(Ok(projected())),
    });
    assert!(pending.placements.is_empty());
    assert_eq!(pending.updates[&second].event, other);
}

/// Fitted nodes reuse their retained coordinates for metadata updates and revival.
#[test]
fn classify_fitted_revival() {
    let mut fixture = fixture("pending-fitted-revival");
    let mut pending = Pending::default();

    let row = NodeRowId::MIN;
    let entity = fixture
        .delta
        .world
        .layout
        .index
        .identity
        .key_of(row)
        .expect("should resolve the fitted identity");
    let position = fixture
        .delta
        .node_position(entity)
        .expect("should retain fitted coordinates");
    assert!(fixture.delta.withdraw(entity));

    let mut event = match update(100, 1, false) {
        EntityEvent::Updated(event) => event,
        _ => unreachable!(),
    };
    event.entity = EntityId::from(entity);
    pending.observe(EntityEvent::Updated(event));
    pending.classify(&fixture.delta, [(entity, Classification::Node)]);

    assert!(!pending.has_placements());
    assert!(matches!(
        pending.updates[&entity].stage,
        Stage::Capture(Geometry::Node(held)) if held == position
    ));

    let mut answers = displays([(event.edition, Some(display("revived")))]);
    assert!(pending.capture(&mut fixture.delta, &mut answers));
    assert!(pending.apply(&mut fixture.delta));
    assert!(pending.updates.is_empty());

    let epoch = epoch(&fixture.delta);
    assert_eq!(
        fixture.delta.world.layout.position(&epoch, row),
        Some(position)
    );
}

/// A full input retains unsent nodes and drains all admitted requests without duplication.
#[test]
fn pump_backpressure() {
    let fixture = fixture("pending-pump-backpressure");
    let mut pending = Pending::default();
    for seed in 100..103 {
        queue_node(&mut pending, &fixture.delta, seed, 1);
    }
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    assert!(pump(&mut pending, &tx, None).is_continue());
    let mut admitted = Vec::new();
    for _ in 0..3 {
        admitted.push(
            requests
                .try_recv()
                .expect("should admit one request at capacity")
                .entity,
        );
        assert!(pump(&mut pending, &tx, None).is_continue());
    }
    admitted.sort_unstable_by_key(|entity| Uuid::from(entity.entity_uuid));
    assert_eq!(admitted, [entity(100), entity(101), entity(102)]);
    assert!(requests.try_recv().is_err());
    assert!(!pending.has_placements());
}

/// Input closure ends admission without marking an unsent update as running.
#[test]
fn pump_closed() {
    let fixture = fixture("pending-pump-closed");
    let mut pending = Pending::default();
    queue_node(&mut pending, &fixture.delta, 100, 1);
    let (tx, mut requests) = mpsc::channel(1);
    requests.close();
    assert!(pump(&mut pending, &tx, None).is_break());
    assert!(pending.has_placements());
}

/// An archive cancels a queued placement result before it can allocate or revive a node.
#[test]
fn receive_archived() {
    let fixture = fixture("pending-receive-archived");
    let mut pending = Pending::default();
    queue_node(&mut pending, &fixture.delta, 100, 1);
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let request = requests.try_recv().expect("should submit the node");

    assert!(matches!(
        pending.observe(update(100, 2, true)),
        DeltaAction::Withdraw(withdrawn) if withdrawn == ArchivedEntityId::from(entity(100))
    ));
    pending.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Ok(projected())),
    });

    assert!(pending.updates.is_empty());
    assert_eq!(
        fixture.delta.node_row(ArchivedEntityId::from(entity(100))),
        None
    );
}

/// Placement failure removes pending work, and an overlapping read does not restart its budget.
#[test]
fn receive_failed() {
    let fixture = fixture("pending-receive-failed");
    let mut pending = Pending::default();
    queue_node(&mut pending, &fixture.delta, 100, 1);
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let request = requests.try_recv().expect("should submit the node");

    pending.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Err(Report::new(PlacementError::Exhaustion))),
    });
    assert!(pending.updates.is_empty());

    pending.observe(update(100, 1, false));
    assert!(pending.updates.is_empty(), "should reject the stale repeat");

    queue_node(&mut pending, &fixture.delta, 100, 2);
    assert!(pending.has_placements());
}

/// Successful placement applies fitted-frame normalization before the edition's display.
#[test]
fn receive_wire_coordinates() {
    let mut fixture = fixture("pending-receive-wire-coordinates");
    let mut pending = Pending::default();
    queue_node(&mut pending, &fixture.delta, 100, 1);
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let request = requests.try_recv().expect("should submit the node");

    let position = projected();
    let expected = fixture
        .delta
        .world
        .fitted_bounds()
        .normalize_into(WIRE_FRAME, &[position.get()])[0];
    assert_ne!(
        expected,
        position.get(),
        "should use a non-identity normalization case"
    );

    pending.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Ok(position)),
    });
    let mut scratch = Vec::new();
    pending.normalize(fixture.delta.world.fitted_bounds(), &mut scratch);
    assert!(scratch.is_empty());

    let entity = ArchivedEntityId::from(request.entity);
    let edition = pending.updates[&entity].event.edition;
    let mut answers = displays([(edition, Some(display("placed")))]);
    pending.capture(&mut fixture.delta, &mut answers);
    assert!(pending.apply(&mut fixture.delta));

    let node = fixture
        .delta
        .node_row(entity)
        .expect("should allocate the node");
    let epoch = epoch(&fixture.delta);
    assert_eq!(
        fixture.delta.world.layout.position(&epoch, node),
        Some(expected)
    );
}

/// Link updates require endpoint rows and never request an embedding.
#[test]
fn edge_missing_endpoint() {
    let mut fixture = fixture("pending-edge-missing-endpoint");
    let mut pending = Pending::default();
    let edge = ArchivedEntityId::from(entity(100));
    let node = ArchivedEntityId::from(entity(101));

    pending.observe(update(100, 1, false));
    pending.classify(
        &fixture.delta,
        [(
            edge,
            Classification::Edge {
                source: Some(node),
                target: Some(node),
            },
        )],
    );
    assert!(!pending.has_placements());

    let edition = pending.updates[&edge].event.edition;
    let mut answers = displays([(edition, Some(display("link")))]);
    pending.capture(&mut fixture.delta, &mut answers);
    assert!(!pending.apply(&mut fixture.delta));
    assert_eq!(pending.updates.len(), 1);

    fixture
        .delta
        .update_node(
            node,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("node")),
            Vec2::ZERO,
        )
        .expect("should allocate the endpoint");
    assert!(pending.apply(&mut fixture.delta));
    assert!(pending.updates.is_empty());
}

/// A replaced edition ignores an older display response and accepts only its own edition.
#[test]
fn display_replaced_edition() {
    let mut fixture = fixture("pending-display-replaced-edition");
    let mut pending = Pending::default();
    let entity = ArchivedEntityId::from(entity(100));
    fixture
        .delta
        .update_node(
            entity,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("initial")),
            Vec2::ZERO,
        )
        .expect("should allocate the node");

    queue_node(&mut pending, &fixture.delta, 100, 1);
    let old = pending.updates[&entity].event.edition;
    queue_node(&mut pending, &fixture.delta, 100, 2);
    let current = pending.updates[&entity].event.edition;

    let row = fixture
        .delta
        .node_row(entity)
        .expect("should retain the existing row");
    let mut answers = displays([(old, Some(display("old")))]);
    assert!(!pending.capture(&mut fixture.delta, &mut answers));
    assert!(answers.is_empty());
    assert!(
        matches!(pending.updates[&entity].stage, Stage::Capture(_)),
        "should keep the current request waiting after a stale answer"
    );

    let mut answers = displays([(current, None)]);
    assert!(!pending.capture(&mut fixture.delta, &mut answers));
    assert!(
        matches!(pending.updates[&entity].stage, Stage::Capture(_)),
        "should keep the request waiting after a missing display"
    );

    let mut answers = displays([(current, Some(display("new")))]);
    assert!(pending.capture(&mut fixture.delta, &mut answers));
    let Stage::Ready { legend, .. } = &pending.updates[&entity].stage else {
        panic!("should capture the current display");
    };
    assert_eq!(legend.label(), "new");
    assert!(pending.apply(&mut fixture.delta));
    assert_eq!(fixture.delta.node_row(entity), Some(row));
    let identities = DeltaIdentityProvider::from_parts(
        &fixture.delta.node,
        NaiveIdentityProvider::from_ref(&fixture.delta.world.layout.index.identity),
    );
    assert_eq!(
        identities
            .payload_of_row(row)
            .expect("should replace the row's legend")
            .label(),
        "new"
    );
}

/// A failed superseded request releases admission without discarding its replacement.
#[test]
fn receive_superseded_failure() {
    let fixture = fixture("pending-receive-superseded-failure");
    let mut pending = Pending::default();
    queue_node(&mut pending, &fixture.delta, 100, 1);
    let (tx, mut requests) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let request = requests.try_recv().expect("should submit the first update");

    queue_node(&mut pending, &fixture.delta, 100, 2);
    assert!(
        !pending.has_placements(),
        "should wait for the outstanding request"
    );
    assert!(pump(&mut pending, &tx, None).is_continue());
    assert!(requests.try_recv().is_err());

    pending.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Err(Report::new(PlacementError::Exhaustion))),
    });
    assert!(
        pending.has_placements(),
        "should release the replacement after the failed completion"
    );

    assert!(pump(&mut pending, &tx, None).is_continue());
    let replacement = requests.try_recv().expect("should submit the replacement");
    assert_ne!(replacement.event, request.event);
}

/// An added node's revival reuses its first position while older epochs remain withdrawn.
#[test]
fn classify_added_revival() {
    let mut fixture = fixture("pending-classify-added-revival");
    let mut pending = Pending::default();
    let entity = ArchivedEntityId::from(entity(100));
    let position = Vec2::new(0.5, -0.25);

    fixture
        .delta
        .update_node(
            entity,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("original")),
            position,
        )
        .expect("should allocate a node");
    fixture.delta.revision.increment_by(1);
    fixture.delta.withdraw(entity);
    let withdrawn = epoch(&fixture.delta);
    fixture.delta.revision.increment_by(1);

    queue_node(&mut pending, &fixture.delta, 100, 1);
    assert!(matches!(
        pending.updates[&entity].stage,
        Stage::Capture(Geometry::Node(held)) if held == position
    ));

    let edition = pending.updates[&entity].event.edition;
    let mut answers = displays([(edition, Some(display("revived")))]);
    pending.capture(&mut fixture.delta, &mut answers);
    assert!(pending.apply(&mut fixture.delta));

    let row = fixture
        .delta
        .node_row(entity)
        .expect("should resolve the retained row");
    assert_eq!(fixture.delta.world.layout.position(&withdrawn, row), None);
    let epoch = epoch(&fixture.delta);
    assert_eq!(
        fixture.delta.world.layout.position(&epoch, row),
        Some(position)
    );
}
#[test]
fn normalize_batch() {
    let mut pending = Pending::default();
    let inputs: [BoxedVecN<PROJECTOR_DIMENSIONS>; 5] = core::array::from_fn(|axis| {
        let mut input = BoxedVecN::zero();
        input.as_array_mut()[axis] = 1.0;
        input
    });
    let positions: Vec<_> = projector(None)
        .project(&inputs)
        .try_collect()
        .expect("should project finite inputs");
    assert!(positions.windows(2).all(|pair| pair[0] != pair[1]));

    for seed in 100..105 {
        pending.observe(update(seed, 1, false));
        pending
            .updates
            .get_mut(&ArchivedEntityId::from(entity(seed)))
            .expect("should retain the node")
            .stage = Stage::Place;
    }
    let (tx, mut rx) = mpsc::channel(5);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let mut entities = Vec::new();
    let mut raw = Vec::new();
    for position in positions.into_iter().rev() {
        let request = rx.try_recv().expect("should submit each node");
        entities.push(ArchivedEntityId::from(request.entity));
        raw.push(position.get());
        pending.receive(PendingEntry {
            event: request.event,
            entity: request.entity,
            phase: Completed(Ok(position)),
        });
    }
    assert!(rx.try_recv().is_err());
    for seed in 200..210 {
        pending.observe(update(seed, 1, false));
    }

    let bounds = Bounds2::new(Vec2::splat(-100.0), Vec2::splat(100.0))
        .expect("should have ordered finite bounds");
    let expected = bounds.normalize_into(WIRE_FRAME, &raw);
    let mut scratch = vec![Vec2::splat(99.0)];
    pending.normalize(bounds, &mut scratch);
    assert!(scratch.is_empty());
    assert_eq!(pending.classifications().count(), 10);
    assert_eq!(pending.editions().count(), 5);
    for (entity, expected) in entities.into_iter().zip(expected) {
        let Stage::Capture(Geometry::Node(actual)) = pending.updates[&entity].stage else {
            panic!("should await the node's display");
        };
        assert!(actual.distance_squared_wide(expected) < 1e-10);
    }
    pending.normalize(bounds, &mut scratch);
    assert!(scratch.is_empty());
    assert_eq!(pending.editions().count(), 5);
}

#[test]
fn normalize_superseded() {
    let mut pending = Pending::default();
    let key = ArchivedEntityId::from(entity(100));
    pending.observe(update(100, 1, false));
    pending
        .updates
        .get_mut(&key)
        .expect("should retain the node")
        .stage = Stage::Place;
    let (tx, mut rx) = mpsc::channel(1);
    assert!(pump(&mut pending, &tx, None).is_continue());
    let request = rx.try_recv().expect("should submit the node");
    pending.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Ok(projected())),
    });
    assert!(matches!(pending.updates[&key].stage, Stage::Normalize(_)));
    pending.observe(update(100, 2, false));
    let bounds = Bounds2::new(Vec2::splat(-100.0), Vec2::splat(100.0))
        .expect("should have ordered finite bounds");
    let mut scratch = Vec::new();
    pending.normalize(bounds, &mut scratch);
    assert!(scratch.is_empty());
    assert_ne!(pending.updates[&key].id, request.event);
    assert!(matches!(pending.updates[&key].stage, Stage::Classify));
    assert_eq!(pending.editions().count(), 0);
}

#[test]
fn edge_incomplete_pair() {
    let mut fixture = fixture("pending-edge-incomplete-pair");
    let node = ArchivedEntityId::from(entity(101));
    fixture
        .delta
        .update_node(
            node,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("node")),
            Vec2::ZERO,
        )
        .expect("should allocate the endpoint");
    let edge = ArchivedEntityId::from(entity(100));
    for (source, target) in [(Some(node), None), (None, Some(node)), (None, None)] {
        let mut pending = Pending::default();
        pending.observe(update(100, 1, false));
        pending.classify(
            &fixture.delta,
            [(edge, Classification::Edge { source, target })],
        );
        assert!(!pending.has_placements());
        let edition = pending.updates[&edge].event.edition;
        pending.capture(
            &mut fixture.delta,
            &mut displays([(edition, Some(display("incomplete")))]),
        );
        assert!(matches!(
            pending.updates[&edge].stage,
            Stage::Ready {
                geometry: Geometry::Edge(None),
                ..
            }
        ));
        assert!(!pending.apply(&mut fixture.delta));
        assert_eq!(pending.updates.len(), 1);

        pending.observe(update(100, 2, false));
        pending.classify(
            &fixture.delta,
            [(
                edge,
                Classification::Edge {
                    source: Some(node),
                    target: Some(node),
                },
            )],
        );
        let edition = pending.updates[&edge].event.edition;
        pending.capture(
            &mut fixture.delta,
            &mut displays([(edition, Some(display("complete")))]),
        );
        pending.apply(&mut fixture.delta);
        assert!(pending.updates.is_empty());
        let identities = DeltaIdentityProvider::from_parts(
            &fixture.delta.edge,
            NaiveIdentityProvider::from_ref(&fixture.delta.world.topology.identity),
        );
        assert!(identities.row_of(edge).is_some());
    }
}
