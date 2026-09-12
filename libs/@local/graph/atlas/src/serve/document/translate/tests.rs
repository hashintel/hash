use alloc::{collections::BTreeMap, sync::Arc};
use core::assert_matches;

use arc_swap::Guard;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::{
    knowledge::entity::{
        EntityId,
        id::{DraftId, EntityUuid},
    },
    principal::actor::{ActorId, ActorType},
};
use uuid::Uuid;

use super::{
    TranslateDocument, TranslateDocumentError, TranslateLimits, TranslatedEdge, TranslatedNode,
};
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
    morton::Zoom,
    postgres::id::ArchivedEntityId,
    serve::{
        delta::{Delta, epoch::Epoch},
        scene::Scene,
        schedule::ViewSchedule,
        tests::fixture::{EDGES, ENDPOINTS, NODES, TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask},
        world::World,
    },
};

struct Fixture {
    world: Arc<World>,
    epoch: Epoch,
    actor: VisibilityActor,
    mask: VisibilityMask,
    schedule: ViewSchedule,
    _files: TamperFixture,
}

impl Fixture {
    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let world = Arc::new(
            World::open(files.generation().clone(), &secret())
                .expect("should open the synthetic generation"),
        );
        let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(17))
            .expect("should allocate a delta identity");
        let epoch = Epoch::from(Guard::from_inner(Arc::new(delta)));
        let actor = VisibilityActor {
            id: ActorId::new(Uuid::from_u128(1), ActorType::User),
            instance_admin: false,
        };
        let mask = VisibilityMask::full(&epoch, actor);
        let schedule = ViewSchedule::of(Arc::clone(&world), &epoch, &mask);
        Self {
            world,
            epoch,
            actor,
            mask,
            schedule,
            _files: files,
        }
    }

    fn restrict(
        &mut self,
        nodes: impl IntoIterator<Item = u64>,
        edges: impl IntoIterator<Item = u64>,
    ) {
        self.mask = VisibilityMask::partial(
            &self.epoch,
            self.actor,
            CompressedBitSet::from_rows(nodes.into_iter().map(NodeRowId::new)),
            CompressedBitSet::from_rows(edges.into_iter().map(EdgeRowId::new)),
        );
        self.schedule = ViewSchedule::of(Arc::clone(&self.world), &self.epoch, &self.mask);
    }

    fn scene(&self) -> Scene<'_> {
        Scene {
            world: &self.world,
            epoch: &self.epoch,
            mask: &self.mask,
            schedule: &self.schedule,
            delivery: self
                .schedule
                .cut(Zoom::MIN)
                .expect("should bind the zero offset"),
        }
    }

    fn node_id(&self, row: u64) -> EntityId {
        EntityId::from(
            self.world
                .layout
                .index
                .key_of(&self.epoch, NodeRowId::new(row))
                .expect("should resolve the fixture node"),
        )
    }

    fn edge_id(&self, row: u64) -> EntityId {
        EntityId::from(
            self.world
                .topology
                .key_of(&self.epoch, EdgeRowId::new(row))
                .expect("should resolve the fixture edge"),
        )
    }
}

#[test]
fn identities_mixed_input() {
    let fixture = Fixture::new("translate-mixed-input");
    let node_id = fixture.node_id(0);
    let edge_id = fixture.edge_id(0);
    let draft_node = EntityId {
        draft_id: Some(DraftId::new(Uuid::from_u128(3))),
        ..fixture.node_id(1)
    };
    let draft_edge = EntityId {
        draft_id: Some(DraftId::new(Uuid::from_u128(4))),
        ..fixture.edge_id(1)
    };
    let unknown = EntityId {
        entity_uuid: EntityUuid::new(Uuid::nil()),
        ..node_id
    };
    let document = TranslateDocument::new(
        fixture.scene(),
        [node_id, node_id, edge_id, draft_node, draft_edge, unknown],
        TranslateLimits { .. },
    )
    .expect("should construct within the identity limit");
    let node = TranslatedNode {
        id: fixture.world.layout.index.encode(NodeRowId::new(0)),
        position: fixture
            .world
            .layout
            .position(&fixture.epoch, NodeRowId::new(0))
            .expect("should read the node's wire position"),
    };
    let [source, target] = ENDPOINTS[0];
    assert_eq!(
        document,
        TranslateDocument {
            nodes: BTreeMap::from([(ArchivedEntityId::from(node_id), node)]),
            edges: BTreeMap::from([(
                ArchivedEntityId::from(edge_id),
                TranslatedEdge {
                    source: fixture.world.layout.index.encode(source),
                    target: fixture.world.layout.index.encode(target),
                }
            )]),
        }
    );
}

#[test]
fn identities_count_limit() {
    let fixture = Fixture::new("translate-count-limit");
    let id = fixture.node_id(0);
    let report =
        TranslateDocument::new(fixture.scene(), [id, id], TranslateLimits { entity_ids: 1 })
            .expect_err("should count duplicates toward the limit");
    assert_matches!(
        report.current_context(),
        TranslateDocumentError::Ids {
            count: 2,
            maximum: 1
        }
    );
    let boundary =
        TranslateDocument::new(fixture.scene(), [id, id], TranslateLimits { entity_ids: 2 })
            .expect("should admit the exact limit");
    assert_eq!(boundary.nodes.len(), 1, "should collapse the repeated key");
    assert!(boundary.edges.is_empty());
    let empty = TranslateDocument::new(fixture.scene(), [], TranslateLimits { entity_ids: 0 })
        .expect("should admit an empty request at a zero limit");
    assert!(empty.nodes.is_empty());
    assert!(empty.edges.is_empty());
}

#[test]
fn identities_masked_domains() {
    let mut fixture = Fixture::new("translate-masked-domains");
    let ids = [
        fixture.node_id(0),
        fixture.edge_id(0),
        fixture.node_id(2),
        fixture.edge_id(2),
    ];
    let keys = ids.map(ArchivedEntityId::from);
    let baseline = TranslateDocument::new(fixture.scene(), ids, TranslateLimits { .. })
        .expect("should construct the full scene");
    assert_eq!(baseline.nodes.len(), 2);
    assert_eq!(baseline.edges.len(), 2);

    // Edge 0 joins nodes 0 and 1. Edge 2 is a self-loop at node 2.
    for (hidden_node, hidden_edge, source_visible) in [
        (Some(0), None, false),
        (Some(1), None, true),
        (None, Some(0), true),
    ] {
        fixture.restrict(
            (0..NODES).filter(|row| Some(*row) != hidden_node),
            (0..EDGES).filter(|row| Some(*row) != hidden_edge),
        );
        let document = TranslateDocument::new(fixture.scene(), ids, TranslateLimits { .. })
            .expect("should construct the restricted scene");
        assert_eq!(document.nodes.contains_key(&keys[0]), source_visible);
        assert!(
            !document.edges.contains_key(&keys[1]),
            "should omit the hidden link or endpoint"
        );
        assert_eq!(document.nodes.get(&keys[2]), baseline.nodes.get(&keys[2]));
        assert_eq!(document.edges.get(&keys[3]), baseline.edges.get(&keys[3]));
    }
}
