use alloc::{collections::BTreeMap, sync::Arc};
use core::{assert_matches, cell::RefCell, iter};

use arc_swap::Guard;
use camino::Utf8Path;
use error_stack::Report;
use hashql_core::id::{Id as _, IdVec};
use rand::{SeedableRng as _, rngs::StdRng};
use serde_json::json;
use type_system::{
    knowledge::entity::{EntityId, id::DraftId},
    ontology::{VersionedUrl, id::BaseUrl},
    principal::actor::{ActorId, ActorType},
};
use uuid::Uuid;

use super::{
    LocateDocument, LocateDocumentError, LocateDocumentOptions, LocateLimits, LocateSource,
    trailer::{LocateTrailer, PropertyMap},
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Label, OwnedLegend},
    file::generation::Generation,
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    morton::{Depth, MortonTile, Zoom},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{
        fit::prepare::identity::IdentityTable,
        lod::{key, stage::WIRE_FRAME},
    },
    serve2::{
        codec::EncodedRowId,
        delta::{Delta, epoch::Epoch},
        hydrate::{
            EdgeSlot, HydrateError, LocateLink, LocateNode, LocateProperties, LocateRequest,
            LocateResolver, NodeSlot,
            scalar::{ScalarProperties, ScalarValue},
        },
        intern::TableIndex,
        membership::{OntologySelection, SelectionSlot},
        scene::Scene,
        schedule::ViewSchedule,
        tests::fixture::{EDGE_SEED, EDGES, ENDPOINTS, NODES, TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask},
        world::World,
    },
};

/// One locate request as the resolver received it.
#[derive(Debug, PartialEq, Eq)]
struct RecordedRequest {
    actor_id: ActorId,
    instance_admin: bool,
    nodes: Vec<ArchivedEntityId>,
    links: Vec<ArchivedEntityId>,
    properties: u32,
    link_type_ids: u32,
    link_properties: u32,
}

impl RecordedRequest {
    fn of(request: &LocateRequest<'_>) -> Self {
        Self {
            actor_id: request.actor.id,
            instance_admin: request.actor.instance_admin,
            nodes: request.nodes.iter().map(|node| node.identity).collect(),
            links: request.links.iter().map(|link| link.identity).collect(),
            properties: request.properties,
            link_type_ids: request.link_type_ids,
            link_properties: request.link_properties,
        }
    }
}

struct Details {
    nodes: IdVec<NodeSlot, Option<LocateNode>>,
    links: IdVec<EdgeSlot, Option<LocateLink>>,
    source_properties: Option<LocateProperties>,
}

enum Answer {
    Response(Details),
    Unresolved,
    Failure,
}

/// A synchronous resolver that answers one request and records every request it receives.
struct FakeResolver {
    answer: RefCell<Option<Answer>>,
    requests: RefCell<Vec<RecordedRequest>>,
}

impl FakeResolver {
    fn answering(response: Details) -> Self {
        Self {
            answer: RefCell::new(Some(Answer::Response(response))),
            requests: RefCell::new(Vec::new()),
        }
    }

    const fn failing() -> Self {
        Self {
            answer: RefCell::new(Some(Answer::Failure)),
            requests: RefCell::new(Vec::new()),
        }
    }

    const fn unexpected() -> Self {
        Self {
            answer: RefCell::new(None),
            requests: RefCell::new(Vec::new()),
        }
    }

    fn url(name: &str) -> VersionedUrl {
        format!("https://example.com/types/{name}/v/1")
            .parse()
            .expect("should parse the fixture type URL")
    }

    fn property(name: &str) -> BaseUrl {
        BaseUrl::new(format!("https://example.com/property/{name}/"))
            .expect("should parse the fixture property URL")
    }

    fn scalars(value: serde_json::Value) -> ScalarProperties {
        let (properties, _truncated) = ScalarProperties::new(value, None, usize::MAX);
        properties
    }

    fn resolved(nodes: usize, edges: usize) -> Details {
        Details {
            nodes: IdVec::from_fn(nodes, |_| {
                Some(LocateNode {
                    type_urls: Vec::new(),
                })
            }),
            links: IdVec::from_fn(edges, |_| {
                Some(LocateLink {
                    type_urls: Vec::new(),
                    type_urls_complete: true,
                    properties: LocateProperties {
                        values: ScalarProperties::EMPTY,
                        complete: true,
                    },
                })
            }),
            source_properties: Some(LocateProperties {
                values: ScalarProperties::EMPTY,
                complete: true,
            }),
        }
    }

    fn unresolve_node(response: &mut Details, slot: usize) {
        let slot = NodeSlot::from_usize(slot);
        response.nodes[slot] = None;
        if slot == NodeSlot::MIN {
            response.source_properties = None;
        }
    }

    fn unresolve_link(response: &mut Details, slot: usize) {
        response.links[EdgeSlot::from_usize(slot)] = None;
    }

    #[track_caller]
    fn assert_request(&self, expected: &RecordedRequest) {
        let requests = self.requests.borrow();
        assert_eq!(requests.len(), 1, "should resolve exactly once");
        assert_eq!(
            requests[0], *expected,
            "should forward the delivered identities, the actor and the limits"
        );
    }

    #[track_caller]
    fn assert_unasked(&self) {
        assert!(
            self.requests.borrow().is_empty(),
            "should refuse before hydration"
        );
    }
}

impl LocateResolver for FakeResolver {
    fn resolve(
        &self,
        request: LocateRequest<'_>,
    ) -> Result<Option<LocateProperties>, Report<HydrateError>> {
        self.requests
            .borrow_mut()
            .push(RecordedRequest::of(&request));
        assert!(request.nodes.iter().all(|node| node.details.is_none()));
        assert!(request.links.iter().all(|link| link.details.is_none()));
        match self.answer.borrow_mut().take() {
            Some(Answer::Response(response)) => {
                assert_eq!(
                    request.nodes.len(),
                    response.nodes.len(),
                    "should receive the expected node slots"
                );
                assert_eq!(
                    request.links.len(),
                    response.links.len(),
                    "should receive the expected link slots"
                );
                for (slot, details) in request.nodes.iter_mut().zip(response.nodes) {
                    slot.details = details;
                }
                for (slot, details) in request.links.iter_mut().zip(response.links) {
                    slot.details = details;
                }
                Ok(response.source_properties)
            }
            Some(Answer::Unresolved) => Ok(None),
            Some(Answer::Failure) => Err(Report::new(HydrateError::Query)),
            None => panic!("should receive no further request"),
        }
    }
}

struct Fixture {
    world: Arc<World>,
    epoch: Epoch,
    actor: VisibilityActor,
    mask: VisibilityMask,
    schedule: ViewSchedule,
    _files: TamperFixture,
}

impl Fixture {
    fn actor(id: u128, instance_admin: bool) -> VisibilityActor {
        VisibilityActor {
            id: ActorId::new(Uuid::from_u128(id), ActorType::User),
            instance_admin,
        }
    }

    fn from_generation(
        files: TamperFixture,
        generation: Generation,
        actor: VisibilityActor,
    ) -> Self {
        let world = Arc::new(
            World::open(generation, &secret()).expect("should open the synthetic generation"),
        );
        let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(17))
            .expect("should allocate a delta identity");
        let epoch = Epoch::from(Guard::from_inner(Arc::new(delta)));
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

    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let generation = files.generation().clone();
        Self::from_generation(files, generation, Self::actor(1, false))
    }

    #[expect(
        clippy::permissions_set_readonly_false,
        reason = "the staged copy is this test's own scratch file"
    )]
    fn recreate_writable(path: &Utf8Path) -> std::fs::File {
        let mut permissions = std::fs::metadata(path)
            .expect("should read the staged artifact's metadata")
            .permissions();
        permissions.set_readonly(false);
        std::fs::set_permissions(path, permissions).expect("should set the permissions");
        std::fs::File::create(path).expect("should rewrite the staged artifact")
    }

    fn identity(seed: u8) -> ArchivedEntityId {
        ArchivedEntityId {
            web_id: Uuid::from_bytes([seed; 16]).into(),
            entity_uuid: Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
        }
    }

    /// Republishes with the label `node-{row}` on every node row.
    fn varied_nodes(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let target = files.generation().repository().files.node_identities.name();
        let generation = files.tamper(&target, |path| {
            let mut table = IdentityTable::<NodeRowId, ArchivedEntityId>::new();
            for row in 0..NODES {
                table.push(Self::identity(
                    u8::try_from(row).expect("should fit the fixture row in u8"),
                ));
            }
            let legends: Vec<_> = (0..NODES)
                .map(|row| {
                    OwnedLegend::new(
                        OntologyRowId::new(row & 1),
                        Label::new(&format!("node-{row}")),
                    )
                })
                .collect();
            let mut file = Self::recreate_writable(path);
            let _digest = table
                .write_into(legends.iter().map(AsRef::as_ref), &mut file)
                .expect("should write the varied node identities");
        });
        Self::from_generation(files, generation, Self::actor(1, false))
    }

    /// Reverses edge identities while preserving each row's label.
    fn varied_links(name: &str, actor: VisibilityActor) -> Self {
        let files = TamperFixture::publish(name);
        let target = files.generation().repository().files.edge_identities.name();
        let generation = files.tamper(&target, |path| {
            let mut table = IdentityTable::<EdgeRowId, ArchivedEntityId>::new();
            for row in 0..EDGES {
                let offset =
                    u8::try_from(EDGES - 1 - row).expect("should fit the fixture row in u8");
                table.push(Self::identity(EDGE_SEED + offset));
            }
            let legends: Vec<_> = (0..EDGES)
                .map(|row| {
                    OwnedLegend::new(OntologyRowId::new(2), Label::new(&format!("edge-{row}")))
                })
                .collect();
            let mut file = Self::recreate_writable(path);
            let _digest = table
                .write_into(legends.iter().map(AsRef::as_ref), &mut file)
                .expect("should write the varied edge identities");
        });
        Self::from_generation(files, generation, actor)
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

    fn no_types() -> &'static OntologySelection {
        OntologySelection::new(&[])
    }

    fn encode(&self, node: NodeRowId) -> EncodedRowId<NodeRowId> {
        self.world.layout.index.encode(node)
    }

    fn node_identity(&self, node: NodeRowId) -> ArchivedEntityId {
        self.world
            .layout
            .index
            .key_of(&self.epoch, node)
            .expect("should resolve the fixture node's identity")
    }

    fn entity_source(&self, node: NodeRowId) -> LocateSource {
        LocateSource::Key(EntityId::from(self.node_identity(node)))
    }

    fn row_source(&self, node: NodeRowId) -> LocateSource {
        LocateSource::Row(self.encode(node))
    }

    fn position_of(&self, node: NodeRowId) -> Vec2 {
        self.world
            .layout
            .position(&self.epoch, node)
            .expect("should resolve the fixture node's position")
    }

    /// The tile of the node's wire position at its first delivery zoom.
    fn fly_to(&self, node: NodeRowId) -> MortonTile {
        let zoom = self
            .scene()
            .delivery
            .first_zoom(node)
            .expect("should schedule the fixture node");
        key::keys(&[self.position_of(node)], WIRE_FRAME)[0].tile(Depth::from_zoom(zoom))
    }

    fn identity_of(&self, edge: EdgeRowId) -> ArchivedEntityId {
        self.world
            .topology
            .key_of(&self.epoch, edge)
            .expect("should resolve the fixture edge's identity")
    }

    fn node_label_of(&self, node: NodeRowId) -> &Label {
        self.world
            .layout
            .index
            .payload(&self.epoch, node)
            .expect("should resolve the fixture node's display payload")
            .label()
    }

    fn link_label_of(&self, edge: EdgeRowId) -> &Label {
        self.world
            .topology
            .payload(&self.epoch, edge)
            .expect("should resolve the fixture edge's display payload")
            .label()
    }

    fn ontology_uuid(&self, row: u64) -> ArchivedOntologyTypeUuid {
        self.world
            .ontology
            .key_of(&self.epoch, OntologyRowId::new(row))
            .expect("should resolve the fixture ontology row")
    }

    /// The edge rows of [`ENDPOINTS`] touching `source`, in identity order.
    fn incident(&self, source: NodeRowId) -> Vec<EdgeRowId> {
        let mut edges: Vec<_> = ENDPOINTS
            .iter()
            .enumerate()
            .filter(|(_, endpoints)| endpoints.contains(&source))
            .map(|(row, _)| EdgeRowId::from_usize(row))
            .collect();
        edges.sort_unstable_by_key(|&edge| self.identity_of(edge));
        edges
    }

    /// The source followed by the distinct partners of `edges`, in encoded-row order.
    fn nodes_of(&self, source: NodeRowId, edges: &[EdgeRowId]) -> Vec<NodeRowId> {
        let mut partners: Vec<_> = edges
            .iter()
            .flat_map(|&edge| ENDPOINTS[edge.as_usize()])
            .filter(|&row| row != source)
            .collect();
        partners.sort_unstable_by_key(|&row| self.encode(row));
        partners.dedup();
        iter::once(source).chain(partners).collect()
    }

    fn decode_type_urls(
        trailer: &LocateTrailer<'_>,
        indices: impl IntoIterator<Item = TableIndex<VersionedUrl>>,
    ) -> Vec<VersionedUrl> {
        indices
            .into_iter()
            .map(|index| trailer.type_urls.entries()[index].clone())
            .collect()
    }

    fn decode_properties(
        trailer: &LocateTrailer<'_>,
        properties: &PropertyMap,
    ) -> BTreeMap<BaseUrl, ScalarValue> {
        properties
            .0
            .iter()
            .map(|(&index, value)| {
                (
                    trailer.property_urls.entries()[index].clone(),
                    value.clone(),
                )
            })
            .collect()
    }

    /// Asserts the source-first node columns and the identity-ordered edge columns over `edges`.
    #[track_caller]
    fn assert_geometry(
        &self,
        document: &LocateDocument<'_>,
        source: NodeRowId,
        edges: &[EdgeRowId],
    ) {
        let nodes = self.nodes_of(source, edges);

        assert_eq!(
            document.generation,
            self.world.generation().id(),
            "should echo the generation identity"
        );
        assert_eq!(
            document.entity_id,
            self.node_identity(source),
            "should carry the source's upstream identity"
        );
        assert_eq!(
            document.coordinate,
            self.fly_to(source),
            "should place the fly-to tile at the source's first delivery zoom"
        );
        assert_eq!(
            document.ids.iter().copied().collect::<Vec<_>>(),
            nodes
                .iter()
                .map(|&row| self.encode(row))
                .collect::<Vec<_>>(),
            "should list the source first and distinct partners by encoded row"
        );
        assert_eq!(
            document.positions.iter().copied().collect::<Vec<_>>(),
            nodes
                .iter()
                .map(|&row| self.position_of(row))
                .collect::<Vec<_>>(),
            "should align positions with the delivered node slots"
        );
        assert_eq!(
            document.edge_ids.iter().copied().collect::<Vec<_>>(),
            edges
                .iter()
                .map(|&edge| self.identity_of(edge))
                .collect::<Vec<_>>(),
            "should list edge identities in identity order"
        );
        for (column, endpoint) in [(&document.edge_sources, 0), (&document.edge_targets, 1)] {
            assert_eq!(
                column.iter().copied().collect::<Vec<_>>(),
                edges
                    .iter()
                    .map(|&edge| self.encode(ENDPOINTS[edge.as_usize()][endpoint]))
                    .collect::<Vec<_>>(),
                "should encode endpoint {endpoint} of each edge"
            );
        }
    }

    #[track_caller]
    fn assert_unknown_entity(result: Result<LocateDocument<'_>, Report<LocateDocumentError>>) {
        let Err(report) = result else {
            panic!("should refuse a source that names no visible node");
        };
        assert_matches!(report.current_context(), LocateDocumentError::UnknownEntity);
    }
}

/// Both source forms resolve to one source-first geometry and fly-to coordinate.
#[test]
fn source_forms() {
    let fixture = Fixture::new("locate-source-forms");
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let mut ids = Vec::new();
    for source_form in [fixture.entity_source(source), fixture.row_source(source)] {
        let resolver = FakeResolver::answering(FakeResolver::resolved(3, 2));
        let document = LocateDocument::new(
            fixture.scene(),
            source_form,
            &LocateDocumentOptions {
                types: Fixture::no_types(),
                limits: LocateLimits { .. },
                resolver: &resolver,
            },
        )
        .expect("should construct from a visible source");
        assert!(document.complete, "should deliver every incident edge");
        fixture.assert_geometry(&document, source, &edges);
        ids.push(document.ids.iter().copied().collect::<Vec<_>>());
    }
    assert_eq!(
        ids[0], ids[1],
        "should deliver the same nodes for both forms"
    );
}

/// An identity outside the captured corpus refuses under [`LocateDocumentError::UnknownEntity`].
#[test]
fn source_unknown_entity() {
    let fixture = Fixture::new("locate-source-unknown-entity");
    let resolver = FakeResolver::unexpected();
    let unknown = ArchivedEntityId {
        web_id: Uuid::from_u128(0xDEAD).into(),
        entity_uuid: Uuid::from_u128(0xBEEF).into(),
    };
    Fixture::assert_unknown_entity(LocateDocument::new(
        fixture.scene(),
        LocateSource::Key(EntityId::from(unknown)),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    ));
    resolver.assert_unasked();
}

/// A draft of a captured entity refuses under [`LocateDocumentError::UnknownEntity`].
#[test]
fn source_draft_entity() {
    let fixture = Fixture::new("locate-source-draft-entity");
    let resolver = FakeResolver::unexpected();
    let draft = EntityId {
        draft_id: Some(DraftId::new(Uuid::from_u128(7))),
        ..EntityId::from(fixture.node_identity(NodeRowId::new(1)))
    };
    Fixture::assert_unknown_entity(LocateDocument::new(
        fixture.scene(),
        LocateSource::Key(draft),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    ));
    resolver.assert_unasked();
}

/// An encoded row beyond the captured domain reads absent.
#[test]
fn source_row_out_of_domain() {
    let fixture = Fixture::new("locate-source-row-out-of-domain");
    let resolver = FakeResolver::unexpected();
    Fixture::assert_unknown_entity(LocateDocument::new(
        fixture.scene(),
        LocateSource::Row(fixture.encode(NodeRowId::new(NODES))),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    ));
    resolver.assert_unasked();
}

/// Either source form of a masked node refuses under [`LocateDocumentError::UnknownEntity`].
#[test]
fn source_hidden_by_mask() {
    let mut fixture = Fixture::new("locate-source-hidden-by-mask");
    let source = NodeRowId::new(1);
    fixture.restrict((0..NODES).filter(|&row| row != 1), 0..EDGES);
    for source_form in [fixture.entity_source(source), fixture.row_source(source)] {
        let resolver = FakeResolver::unexpected();
        Fixture::assert_unknown_entity(LocateDocument::new(
            fixture.scene(),
            source_form,
            &LocateDocumentOptions {
                types: Fixture::no_types(),
                limits: LocateLimits { .. },
                resolver: &resolver,
            },
        ));
        resolver.assert_unasked();
    }
}

/// A hidden partner or a hidden edge leaves the visible set complete.
#[test]
fn scene_hidden_partner_and_edge() {
    let mut fixture = Fixture::new("locate-scene-hidden-partner-and-edge");
    let source = NodeRowId::new(1);
    let cases: [(Vec<u64>, Vec<u64>); 2] = [
        (
            (0..NODES).filter(|&row| row != 0).collect(),
            (0..EDGES).collect(),
        ),
        (
            (0..NODES).collect(),
            (0..EDGES).filter(|&row| row != 0).collect(),
        ),
    ];
    for (nodes, edges) in cases {
        fixture.restrict(nodes, edges);
        let resolver = FakeResolver::answering(FakeResolver::resolved(2, 1));
        let document = LocateDocument::new(
            fixture.scene(),
            fixture.entity_source(source),
            &LocateDocumentOptions {
                types: Fixture::no_types(),
                limits: LocateLimits { .. },
                resolver: &resolver,
            },
        )
        .expect("should construct over the restricted scene");
        assert!(document.complete, "should count only visible edges");
        fixture.assert_geometry(&document, source, &[EdgeRowId::new(1)]);
    }
}

/// A self-loop contributes one edge without repeating the source node.
#[test]
fn edges_self_loop() {
    let fixture = Fixture::new("locate-edges-self-loop");
    let source = NodeRowId::new(2);
    let edges = fixture.incident(source);
    let resolver = FakeResolver::answering(FakeResolver::resolved(2, 2));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct the self-loop document");
    assert!(document.complete, "should deliver both incident edges");
    fixture.assert_geometry(&document, source, &edges);
    let loop_slot = EdgeSlot::from_usize(
        edges
            .iter()
            .position(|&edge| edge == EdgeRowId::new(2))
            .expect("should include the self-loop"),
    );
    assert_eq!(
        (
            document.edge_sources[loop_slot],
            document.edge_targets[loop_slot]
        ),
        (fixture.encode(source), fixture.encode(source)),
        "should keep both self-loop endpoints on the source"
    );
    assert_eq!(
        document.ids.len(),
        2,
        "should deliver the source and one partner"
    );
}

/// Reciprocal links share one partner slot.
#[test]
fn edges_reciprocal_pair() {
    let fixture = Fixture::new("locate-edges-reciprocal-pair");
    let source = NodeRowId::new(5);
    let edges = fixture.incident(source);
    let resolver = FakeResolver::answering(FakeResolver::resolved(2, 2));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct the reciprocal-pair document");
    assert!(document.complete, "should deliver both reciprocal links");
    fixture.assert_geometry(&document, source, &edges);
    assert_eq!(document.edge_ids.len(), 2, "should keep both links");
    assert_eq!(
        document.ids.len(),
        2,
        "should deliver the shared partner once"
    );
}

/// Completeness follows the incident count against the capacity, including at zero.
#[test]
fn edges_capacity_boundaries() {
    let fixture = Fixture::new("locate-edges-capacity-boundaries");
    let linked = NodeRowId::new(5);
    let incident = fixture.incident(linked);
    for capacity in [0, 2, 3] {
        let expected: &[EdgeRowId] = if capacity == 0 { &[] } else { &incident };
        let resolver = FakeResolver::answering(FakeResolver::resolved(
            fixture.nodes_of(linked, expected).len(),
            expected.len(),
        ));
        let document = LocateDocument::new(
            fixture.scene(),
            fixture.entity_source(linked),
            &LocateDocumentOptions {
                types: Fixture::no_types(),
                limits: LocateLimits {
                    edges: capacity,
                    ..
                },
                resolver: &resolver,
            },
        )
        .expect("should construct at every capacity");
        assert_eq!(
            document.complete,
            usize::try_from(capacity).expect("should fit the capacity in usize") >= incident.len(),
            "should report completeness at capacity {capacity}"
        );
        fixture.assert_geometry(&document, linked, expected);
    }

    let isolated = NodeRowId::new(4);
    let resolver = FakeResolver::answering(FakeResolver::resolved(1, 0));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(isolated),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { edges: 0, .. },
            resolver: &resolver,
        },
    )
    .expect("should construct an isolated source at zero capacity");
    assert!(
        document.complete,
        "should be complete with no incident edge"
    );
    fixture.assert_geometry(&document, isolated, &[]);
}

/// Link identity breaks a tie in partner distance and delivery zoom.
#[test]
fn edges_reciprocal_identity_tie() {
    let fixture = Fixture::varied_links(
        "locate-edges-reciprocal-identity-tie",
        Fixture::actor(1, false),
    );
    let source = NodeRowId::new(5);
    let incident = fixture.incident(source);
    assert!(
        fixture.identity_of(EdgeRowId::new(4)) < fixture.identity_of(EdgeRowId::new(3)),
        "the varied fixture should order identities against rows"
    );
    let retained = incident[0];
    assert_eq!(retained, EdgeRowId::new(4), "should retain row 4");
    let resolver = FakeResolver::answering(FakeResolver::resolved(2, 1));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { edges: 1, .. },
            resolver: &resolver,
        },
    )
    .expect("should construct at capacity one");
    assert!(!document.complete, "should report the dropped link");
    fixture.assert_geometry(&document, source, &[retained]);
}

/// Capacity one keeps the nearest partner, including a self-loop.
#[test]
fn edges_nearest_truncation() {
    let fixture = Fixture::new("locate-edges-nearest-truncation");
    for (source, kept, nodes) in [
        (NodeRowId::new(1), EdgeRowId::new(1), 2),
        (NodeRowId::new(2), EdgeRowId::new(2), 1),
    ] {
        let resolver = FakeResolver::answering(FakeResolver::resolved(nodes, 1));
        let document = LocateDocument::new(
            fixture.scene(),
            fixture.entity_source(source),
            &LocateDocumentOptions {
                types: Fixture::no_types(),
                limits: LocateLimits { edges: 1, .. },
                resolver: &resolver,
            },
        )
        .expect("should construct at capacity one");
        assert!(!document.complete, "should report the dropped link");
        fixture.assert_geometry(&document, source, &[kept]);
    }
}

/// Hydration uses the mask's actor and the configured limits.
#[test]
fn hydrate_request_recorded() {
    let fixture = Fixture::varied_links("locate-hydrate-request-recorded", Fixture::actor(2, true));
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let nodes = fixture.nodes_of(source, &edges);
    assert_ne!(
        edges,
        [EdgeRowId::new(0), EdgeRowId::new(1)],
        "the varied fixture should order the links against their rows"
    );
    let resolver = FakeResolver::answering(FakeResolver::resolved(nodes.len(), edges.len()));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits {
                colored_type_ids: 9,
                edges: 7,
                properties: 3,
                link_type_ids: 2,
                link_properties: 4,
            },
            resolver: &resolver,
        },
    )
    .expect("should construct with nondefault limits");
    fixture.assert_geometry(&document, source, &edges);
    resolver.assert_request(&RecordedRequest {
        actor_id: fixture.actor.id,
        instance_admin: true,
        nodes: nodes
            .iter()
            .map(|&row| fixture.node_identity(row))
            .collect(),
        links: edges
            .iter()
            .map(|&edge| fixture.identity_of(edge))
            .collect(),
        properties: 3,
        link_type_ids: 2,
        link_properties: 4,
    });
}

/// A source without incident edges still issues one request, with no links.
#[test]
fn hydrate_request_empty_links() {
    let fixture = Fixture::new("locate-hydrate-request-empty-links");
    let source = NodeRowId::new(4);
    assert!(
        fixture.incident(source).is_empty(),
        "the fixture should isolate node 4"
    );
    let resolver = FakeResolver::answering(FakeResolver::resolved(1, 0));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct an isolated source");
    assert!(
        document.complete,
        "should be complete with no incident edge"
    );
    fixture.assert_geometry(&document, source, &[]);
    resolver.assert_request(&RecordedRequest {
        actor_id: fixture.actor.id,
        instance_admin: false,
        nodes: vec![fixture.node_identity(source)],
        links: Vec::new(),
        properties: 10,
        link_type_ids: 5,
        link_properties: 10,
    });
}

/// A failed hydration keeps [`HydrateError::Query`] under [`LocateDocumentError::Hydrate`].
#[test]
fn hydrate_failure() {
    let fixture = Fixture::new("locate-hydrate-failure");
    let resolver = FakeResolver::failing();
    let Err(report) = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(NodeRowId::new(1)),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    ) else {
        panic!("should propagate the resolver's failure");
    };
    assert_matches!(report.current_context(), LocateDocumentError::Hydrate);
    assert_matches!(
        report.downcast_ref::<HydrateError>(),
        Some(HydrateError::Query)
    );
}

/// Unavailable details preserve the delivered geometry and every trailer slot.
#[test]
fn hydrate_unresolved() {
    let fixture = Fixture::varied_nodes("locate-hydrate-unresolved");
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let resolver = FakeResolver {
        answer: RefCell::new(Some(Answer::Unresolved)),
        requests: RefCell::new(Vec::new()),
    };
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct when the store resolves no details");
    fixture.assert_geometry(&document, source, &edges);
    let trailer = &document.trailer;
    assert_eq!(trailer.labels.len(), 3);
    assert!(trailer.labels.iter().all(|label| label.as_ref().is_empty()));
    assert_eq!(trailer.representative_type_urls.len(), 3);
    assert!(trailer.representative_type_urls.iter().all(Option::is_none));
    assert!(trailer.properties.is_none());
    assert!(!trailer.type_ids_complete);
    assert!(!trailer.properties_complete);
    assert_eq!(trailer.link_labels.len(), 2);
    assert!(
        trailer
            .link_labels
            .iter()
            .all(|label| label.as_ref().is_empty())
    );
    assert_eq!(trailer.link_type_urls.len(), 2);
    assert!(trailer.link_type_urls.iter().all(Vec::is_empty));
    assert_eq!(trailer.link_properties.len(), 2);
    assert!(trailer.link_properties.iter().all(Option::is_none));
    assert_eq!(trailer.link_type_urls_complete.domain_size(), 2);
    assert!(trailer.link_type_urls_complete.iter().next().is_none());
    assert_eq!(trailer.link_properties_complete.domain_size(), 2);
    assert!(trailer.link_properties_complete.iter().next().is_none());
    assert!(trailer.type_urls.is_empty());
    assert!(trailer.property_urls.is_empty());
}

/// Resolved nodes borrow their captured labels and unresolved nodes read empty.
#[test]
fn labels_nodes_partial() {
    let fixture = Fixture::varied_nodes("locate-labels-nodes-partial");
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let nodes = fixture.nodes_of(source, &edges);
    let mut response = FakeResolver::resolved(nodes.len(), edges.len());
    FakeResolver::unresolve_node(&mut response, 2);
    let resolver = FakeResolver::answering(response);
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with a partially resolved response");
    fixture.assert_geometry(&document, source, &edges);
    let labels = &document.trailer.labels;
    assert_eq!(
        labels.len(),
        nodes.len(),
        "should label every delivered node"
    );
    for (index, &row) in nodes.iter().enumerate().take(2) {
        let slot = NodeSlot::from_usize(index);
        assert_eq!(
            labels[slot].as_ref(),
            format!("node-{}", row.as_u64()),
            "should carry row {row}'s own text at slot {index}"
        );
        assert!(
            core::ptr::eq(labels[slot], fixture.node_label_of(row)),
            "should borrow row {row}'s label from the captured scene"
        );
    }
    assert_eq!(
        labels[NodeSlot::from_usize(2)].as_ref(),
        "",
        "should leave the unresolved node's label empty"
    );
}

/// Resolved links borrow their captured labels and unresolved links read empty.
#[test]
fn labels_links_partial() {
    let fixture = Fixture::varied_links("locate-labels-links-partial", Fixture::actor(1, false));
    let source = NodeRowId::new(5);
    let edges = fixture.incident(source);
    let mut response = FakeResolver::resolved(2, edges.len());
    FakeResolver::unresolve_link(&mut response, 0);
    let resolver = FakeResolver::answering(response);
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with a partially resolved response");
    fixture.assert_geometry(&document, source, &edges);
    let labels = &document.trailer.link_labels;
    assert_eq!(
        labels.len(),
        edges.len(),
        "should label every delivered link"
    );
    assert_eq!(
        labels[EdgeSlot::from_usize(0)].as_ref(),
        "",
        "should leave the unresolved link's label empty"
    );
    let resolved = edges[1];
    assert_eq!(
        labels[EdgeSlot::from_usize(1)].as_ref(),
        format!("edge-{}", resolved.as_u64()),
        "should carry the resolved link's own text"
    );
    assert!(
        core::ptr::eq(
            labels[EdgeSlot::from_usize(1)],
            fixture.link_label_of(resolved)
        ),
        "should borrow the resolved link's label from the captured scene"
    );
}

/// Shared URLs preserve each slot's values and missing property maps.
#[test]
fn trailer_url_interning() {
    let fixture = Fixture::new("locate-trailer-url-interning");
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let alpha = FakeResolver::url("alpha");
    let beta = FakeResolver::url("beta");
    let gamma = FakeResolver::url("gamma");

    let mut response = FakeResolver::resolved(3, 2);
    response.nodes[NodeSlot::from_usize(0)] = Some(LocateNode {
        type_urls: vec![alpha.clone(), gamma.clone()],
    });
    response.nodes[NodeSlot::from_usize(1)] = Some(LocateNode {
        type_urls: vec![alpha.clone()],
    });
    response.source_properties = Some(LocateProperties {
        values: FakeResolver::scalars(json!({
            "https://example.com/property/name/": "Ada",
            "https://example.com/property/age/": 36,
        })),
        complete: true,
    });
    response.links[EdgeSlot::from_usize(0)] = Some(LocateLink {
        type_urls: vec![alpha.clone(), beta.clone()],
        type_urls_complete: true,
        properties: LocateProperties {
            values: FakeResolver::scalars(json!({
                "https://example.com/property/name/": true,
                "https://example.com/property/weight/": 0.5,
                "https://example.com/property/note/": null,
            })),
            complete: true,
        },
    });
    FakeResolver::unresolve_link(&mut response, 1);
    let resolver = FakeResolver::answering(response);
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with hydrated details");
    fixture.assert_geometry(&document, source, &edges);
    let trailer = &document.trailer;

    let representatives: Vec<_> = trailer
        .representative_type_urls
        .iter()
        .map(|slot| slot.map(|index| trailer.type_urls.entries()[index].clone()))
        .collect();
    assert_eq!(
        representatives,
        [Some(alpha.clone()), Some(alpha.clone()), None],
        "should keep each node's first type at its slot"
    );
    assert_eq!(
        Fixture::decode_type_urls(
            trailer,
            trailer.link_type_urls[EdgeSlot::from_usize(0)]
                .iter()
                .copied()
        ),
        [alpha.clone(), beta.clone()],
        "should preserve the resolver's link type order"
    );
    assert!(
        trailer.link_type_urls[EdgeSlot::from_usize(1)].is_empty(),
        "should keep no types for the unresolved link"
    );
    assert_eq!(
        trailer.type_urls.len(),
        2,
        "should intern each emitted type URL once"
    );
    assert!(
        !trailer.type_urls.entries().iter().any(|url| *url == gamma),
        "should intern no nonrepresentative source type"
    );

    let source_properties = trailer
        .properties
        .as_ref()
        .expect("should carry the resolved source's properties");
    assert_eq!(
        Fixture::decode_properties(trailer, source_properties),
        BTreeMap::from([
            (FakeResolver::property("age"), ScalarValue::Integer(36)),
            (
                FakeResolver::property("name"),
                ScalarValue::String("Ada".to_owned())
            ),
        ]),
        "should decode the source's properties by URL"
    );
    let link_properties = trailer.link_properties[EdgeSlot::from_usize(0)]
        .as_ref()
        .expect("should carry the resolved link's properties");
    assert_eq!(
        Fixture::decode_properties(trailer, link_properties),
        BTreeMap::from([
            (FakeResolver::property("name"), ScalarValue::Bool(true)),
            (FakeResolver::property("note"), ScalarValue::Null),
            (FakeResolver::property("weight"), ScalarValue::Float(0.5)),
        ]),
        "should decode the link's properties by URL"
    );
    assert!(
        trailer.link_properties[EdgeSlot::from_usize(1)].is_none(),
        "should carry no map for the unresolved link"
    );
    assert_eq!(
        trailer.property_urls.len(),
        4,
        "should intern each distinct property URL once across source and links"
    );
}

/// Complete type coverage requires a resolved source with nonempty, fully selected direct types.
#[test]
fn trailer_completeness() {
    let fixture = Fixture::new("locate-trailer-completeness");
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let alpha = FakeResolver::url("alpha");
    let beta = FakeResolver::url("beta");
    let alpha_id = ArchivedOntologyTypeUuid::from_url(&alpha);
    let beta_id = ArchivedOntologyTypeUuid::from_url(&beta);
    let both = [alpha_id, beta_id];
    let alpha_only = [alpha_id];

    let cases: [(
        &str,
        Vec<VersionedUrl>,
        &[ArchivedOntologyTypeUuid],
        bool,
        bool,
    ); 4] = [
        (
            "partial",
            vec![alpha.clone(), beta.clone()],
            &alpha_only,
            false,
            false,
        ),
        ("empty", Vec::new(), &alpha_only, false, true),
        (
            "complete",
            vec![alpha.clone(), beta.clone()],
            &both,
            true,
            true,
        ),
        ("unresolved", Vec::new(), &alpha_only, false, false),
    ];
    for (case, source_types, selection, expected_types_complete, properties_complete) in cases {
        let mut response = FakeResolver::resolved(3, 2);
        response.nodes[NodeSlot::MIN] = Some(LocateNode {
            type_urls: source_types,
        });
        response
            .source_properties
            .as_mut()
            .expect("should have source properties")
            .complete = properties_complete;
        for (slot, link) in response.links.iter_enumerated_mut() {
            let link = link.as_mut().expect("should have link details");
            link.type_urls_complete = slot == EdgeSlot::MIN;
            link.properties.complete = slot != EdgeSlot::MIN;
        }
        if case == "unresolved" {
            FakeResolver::unresolve_node(&mut response, 0);
        }
        let resolver = FakeResolver::answering(response);
        let document = LocateDocument::new(
            fixture.scene(),
            fixture.entity_source(source),
            &LocateDocumentOptions {
                types: OntologySelection::new(selection),
                limits: LocateLimits { .. },
                resolver: &resolver,
            },
        )
        .expect("should construct every completeness case");
        fixture.assert_geometry(&document, source, &edges);
        let trailer = &document.trailer;
        assert_eq!(
            trailer.type_ids_complete, expected_types_complete,
            "should report source type coverage for the {case} case"
        );
        assert_eq!(
            trailer.properties_complete, properties_complete,
            "should pass the source property completeness through in the {case} case"
        );
        assert_eq!(
            trailer.properties.is_some(),
            case != "unresolved",
            "should carry a property map only for a resolved source in the {case} case"
        );
        assert_eq!(
            trailer.link_type_urls_complete.iter().collect::<Vec<_>>(),
            [EdgeSlot::from_usize(0)],
            "should pass the link type completeness set through"
        );
        assert_eq!(
            trailer.link_properties_complete.iter().collect::<Vec<_>>(),
            [EdgeSlot::from_usize(1)],
            "should pass the link property completeness set through"
        );
    }
}

/// Refuses a request past the configured type-count limit, under [`LocateDocumentError::Types`].
#[test]
fn types_over_limit() {
    let fixture = Fixture::new("locate-types-over-limit");
    let types = [fixture.ontology_uuid(0); 3];
    let resolver = FakeResolver::unexpected();
    let Err(report) = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(NodeRowId::new(1)),
        &LocateDocumentOptions {
            types: OntologySelection::new(&types),
            limits: LocateLimits {
                colored_type_ids: 2,
                ..
            },
            resolver: &resolver,
        },
    ) else {
        panic!("should refuse a type count past the limit");
    };
    assert_matches!(
        report.current_context(),
        LocateDocumentError::Types {
            count: 3,
            maximum: 2
        },
    );
    resolver.assert_unasked();
}

/// Admits a request at exactly the configured type-count cap.
#[test]
fn types_limit_boundary() {
    let fixture = Fixture::new("locate-types-limit-boundary");
    let types = [fixture.ontology_uuid(0), fixture.ontology_uuid(1)];
    let resolver = FakeResolver::answering(FakeResolver::resolved(3, 2));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(NodeRowId::new(1)),
        &LocateDocumentOptions {
            types: OntologySelection::new(&types),
            limits: LocateLimits {
                colored_type_ids: 2,
                ..
            },
            resolver: &resolver,
        },
    )
    .expect("should admit exactly the configured type-count cap");
    let masks = document
        .type_masks
        .expect("should keep a mask column for a nonempty selection");
    assert_eq!(
        masks.bits.col_domain_size(),
        types.len(),
        "should keep one column per requested type at the exact cap"
    );
    assert_eq!(
        masks.bits.row_domain_size(),
        3,
        "should keep one row per delivered node"
    );
}

/// An empty type selection omits the mask column.
#[test]
fn masks_omitted_empty_selection() {
    let fixture = Fixture::new("locate-masks-omitted-empty-selection");
    let resolver = FakeResolver::answering(FakeResolver::resolved(3, 2));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(NodeRowId::new(1)),
        &LocateDocumentOptions {
            types: Fixture::no_types(),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with an empty type selection");
    assert!(
        document.type_masks.is_none(),
        "should omit the mask column for an empty selection"
    );
}

/// Mask rows follow the source-first slots, and duplicate requests keep separate columns.
///
/// Type 1 is a child of type 0. Every node matches type 0, and the odd rows match type 1. Type 2
/// has no node members.
#[test]
fn masks_source_first_slots() {
    let fixture = Fixture::new("locate-masks-source-first-slots");
    let source = NodeRowId::new(1);
    let edges = fixture.incident(source);
    let nodes = fixture.nodes_of(source, &edges);
    let type0 = fixture.ontology_uuid(0);
    let type1 = fixture.ontology_uuid(1);
    let type2 = fixture.ontology_uuid(2);
    let unknown = ArchivedOntologyTypeUuid::from(Uuid::from_u128(0xDEAD_BEEF));
    let requested = [type0, type1, type2, unknown, type0];
    let membership: [Option<u64>; 5] = [Some(0), Some(1), Some(2), None, Some(0)];

    let resolver = FakeResolver::answering(FakeResolver::resolved(nodes.len(), edges.len()));
    let document = LocateDocument::new(
        fixture.scene(),
        fixture.entity_source(source),
        &LocateDocumentOptions {
            types: OntologySelection::new(&requested),
            limits: LocateLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with a nonempty type selection");
    fixture.assert_geometry(&document, source, &edges);
    let masks = document
        .type_masks
        .expect("should keep a mask column for a nonempty selection");
    assert_eq!(masks.bits.row_domain_size(), nodes.len());
    assert_eq!(masks.bits.col_domain_size(), requested.len());
    for (index, &row) in nodes.iter().enumerate() {
        let slot = NodeSlot::from_usize(index);
        for (bit, &type_row) in membership.iter().enumerate() {
            let expected = match type_row {
                Some(0) => true,
                Some(1) => row.as_u64() & 1 == 1,
                _ => false,
            };
            assert_eq!(
                masks.bits.contains(slot, SelectionSlot::from_usize(bit)),
                expected,
                "row {row}'s membership at requested slot {bit} should match its own type"
            );
        }
    }
}
