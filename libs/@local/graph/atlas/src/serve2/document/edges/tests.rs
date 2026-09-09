use alloc::sync::Arc;
use core::{assert_matches, cell::RefCell, iter};

use arc_swap::Guard;
use camino::Utf8Path;
use error_stack::Report;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::{
    ontology::{VersionedUrl, id::OntologyTypeUuid},
    principal::actor::{ActorId, ActorType},
};
use uuid::Uuid;

use super::{
    EdgeSlot, EdgesDocument, EdgesDocumentDetailLevel, EdgesDocumentError, EdgesDocumentOptions,
    EdgesLimits, EdgesTrailer,
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Label, OwnedLegend},
    file::generation::Generation,
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    morton::{Depth, MortonTile, Zoom},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{
        fit::prepare::identity::IdentityTable,
        lod::{key, stage::WIRE_FRAME},
    },
    serve2::{
        codec::EncodedRowId,
        delta::{Delta, epoch::Epoch},
        hydrate::{HydrateError, TypeUrlResolver},
        scene::Scene,
        schedule::ViewSchedule,
        tests::fixture::{EDGE_SEED, EDGES, ENDPOINTS, NODES, TamperFixture, secret},
        visibility::{VisibilityActor, VisibilityMask},
        world::World,
    },
};

struct FailingResolver;

impl TypeUrlResolver for FailingResolver {
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        let _ = types;
        Err::<iter::Empty<(OntologyTypeUuid, VersionedUrl)>, _>(Report::new(HydrateError::Query))
    }
}

struct FakeResolver {
    answers: Vec<(OntologyTypeUuid, VersionedUrl)>,
    asked: RefCell<Vec<Vec<OntologyTypeUuid>>>,
}

impl FakeResolver {
    fn new(answers: Vec<(OntologyTypeUuid, VersionedUrl)>) -> Self {
        Self {
            answers,
            asked: RefCell::new(Vec::new()),
        }
    }

    fn url(name: &str) -> VersionedUrl {
        format!("https://example.com/types/{name}/v/1")
            .parse()
            .expect("should parse the fixture URL")
    }

    #[track_caller]
    fn assert_query(&self, expected: &[OntologyTypeUuid]) {
        let asked = self.asked.borrow();
        assert_eq!(asked.len(), 1, "should call the resolver exactly once");
        assert_eq!(
            asked[0].len(),
            expected.len(),
            "should query each distinct type once"
        );
        for uuid in expected {
            assert!(
                asked[0].contains(uuid),
                "should query the expected type {uuid:?}"
            );
        }
    }
}

impl TypeUrlResolver for FakeResolver {
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        self.asked.borrow_mut().push(types.into_iter().collect());
        Ok(self.answers.clone())
    }
}

fn resolved_urls(trailer: &EdgesTrailer<'_>) -> Vec<Option<VersionedUrl>> {
    trailer
        .representative_type_urls
        .iter()
        .map(|slot| {
            slot.map(|index| trailer.representative_type_urls_interner.entries()[index].clone())
        })
        .collect()
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
    fn from_generation(files: TamperFixture, generation: Generation) -> Self {
        let world = Arc::new(
            World::open(generation, &secret()).expect("should open the synthetic generation"),
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

    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let generation = files.generation().clone();
        Self::from_generation(files, generation)
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

    fn edge_identity(row: u64) -> ArchivedEntityId {
        let seed = EDGE_SEED + u8::try_from(row).expect("should fit the fixture row in u8");
        ArchivedEntityId {
            web_id: Uuid::from_bytes([seed; 16]).into(),
            entity_uuid: Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
        }
    }

    fn varied(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let name = files.generation().repository().files.edge_identities.name();
        let generation = files.tamper(&name, |path| {
            let mut table = IdentityTable::<EdgeRowId, ArchivedEntityId>::new();
            for row in 0..EDGES {
                table.push(Self::edge_identity(row));
            }
            let legends: Vec<_> = (0..EDGES)
                .map(|row| {
                    let ontology = OntologyRowId::new(if row == 0 { 0 } else { 2 });
                    OwnedLegend::new(ontology, Label::new(&format!("edge-{row}")))
                })
                .collect();
            let mut file = Self::recreate_writable(path);
            let _digest = table
                .write_into(legends.iter().map(AsRef::as_ref), &mut file)
                .expect("should write the varied edge identities");
        });
        Self::from_generation(files, generation)
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

    fn tile(z: u8, x: u32, y: u32) -> MortonTile {
        MortonTile {
            z: Depth::new(z),
            x,
            y,
        }
    }

    fn tile_of(&self, node: NodeRowId) -> MortonTile {
        let position = self
            .world
            .layout
            .position(&self.epoch, node)
            .expect("should resolve the fixture node's position");
        // The deepest served cut includes every bucket, including the scoped catch-all.
        let depth = Depth::from_zoom(self.world.schedule().max_tile_depth());
        key::keys(&[position], WIRE_FRAME)[0].tile(depth)
    }

    fn all_tiles(&self) -> Vec<MortonTile> {
        let mut tiles: Vec<_> = (0..NODES)
            .map(|row| self.tile_of(NodeRowId::new(row)))
            .collect();
        tiles.sort_unstable_by_key(|tile| (tile.z.get(), tile.x, tile.y));
        tiles.dedup();
        tiles
    }

    fn identity_of(&self, edge: EdgeRowId) -> ArchivedEntityId {
        self.world
            .topology
            .key_of(&self.epoch, edge)
            .expect("should resolve the fixture edge's identity")
    }

    fn encode(&self, node: NodeRowId) -> EncodedRowId<NodeRowId> {
        self.world.layout.index.encode(node)
    }

    fn label_of(&self, edge: EdgeRowId) -> &Label {
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

    #[track_caller]
    fn assert_edges(&self, document: &EdgesDocument<'_>, rows: &[u64]) {
        assert!(document.complete, "should deliver the complete edge set");
        // The fixture's ascending seed bytes make row order equal to identity order.
        let expected_ids: Vec<_> = rows
            .iter()
            .map(|&row| self.identity_of(EdgeRowId::new(row)))
            .collect();
        assert_eq!(
            document.ids.iter().copied().collect::<Vec<_>>(),
            expected_ids,
            "should list the expected edge identities in order"
        );
        for (column, endpoint) in [(&document.sources, 0), (&document.targets, 1)] {
            let expected: Vec<_> = rows
                .iter()
                .map(|&row| {
                    let row = usize::try_from(row).expect("should fit the fixture row in usize");
                    self.encode(ENDPOINTS[row][endpoint])
                })
                .collect();
            assert_eq!(
                column.iter().copied().collect::<Vec<_>>(),
                expected,
                "should encode endpoint {endpoint} of each edge"
            );
        }
    }
}

#[test]
fn tiles_count_over_limit() {
    let fixture = Fixture::new("edges-tiles-count-over-limit");
    let tile = Fixture::tile(0, 0, 0);
    let Err(report) = EdgesDocument::new(
        fixture.scene(),
        &[tile, tile],
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { tiles: 1, .. },
            resolver: FailingResolver,
        },
    ) else {
        panic!("should refuse a tile list past the limit");
    };
    assert_matches!(
        report.current_context(),
        EdgesDocumentError::Tiles {
            count: 2,
            maximum: 1
        },
    );
}

#[test]
fn tiles_zoom_over_maximum() {
    let fixture = Fixture::new("edges-tiles-zoom-over-maximum");
    let maximum = fixture.world.schedule().max_tile_depth();
    let tile = Fixture::tile(maximum.get() + 1, 0, 0);
    let Err(report) = EdgesDocument::new(
        fixture.scene(),
        &[tile],
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { .. },
            resolver: FailingResolver,
        },
    ) else {
        panic!("should refuse a tile zoom past the schedule maximum");
    };
    assert_matches!(
        report.current_context(),
        EdgesDocumentError::Zoom { maximum: actual, .. } if *actual == maximum,
    );
}

#[test]
fn tiles_coordinate_outside_grid() {
    let fixture = Fixture::new("edges-tiles-coordinate-outside-grid");
    for tile in [Fixture::tile(1, 2, 0), Fixture::tile(1, 0, 2)] {
        let Err(report) = EdgesDocument::new(
            fixture.scene(),
            &[tile],
            &EdgesDocumentOptions {
                detail: EdgesDocumentDetailLevel::Auxiliary,
                limits: EdgesLimits { .. },
                resolver: FailingResolver,
            },
        ) else {
            panic!("should refuse a coordinate outside its zoom's grid");
        };
        assert_matches!(
            report.current_context(),
            EdgesDocumentError::Coordinate { tile: refused } if *refused == tile,
        );
    }
}

#[test]
fn trailer_minimal() {
    let fixture = Fixture::new("edges-trailer-minimal");
    let resolver = FakeResolver::new(Vec::new());
    let document = EdgesDocument::new(
        fixture.scene(),
        &fixture.all_tiles(),
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Minimal,
            limits: EdgesLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with terminal-depth tiles");
    assert_eq!(
        document.ids.len(),
        ENDPOINTS.len(),
        "should deliver every edge"
    );
    assert!(document.trailer.is_none(), "should omit the trailer");
    assert!(resolver.asked.borrow().is_empty(), "should skip resolution");
}

#[test]
fn trailer_empty() {
    let fixture = Fixture::new("edges-trailer-empty");
    let resolver = FakeResolver::new(Vec::new());
    let document = EdgesDocument::new(
        fixture.scene(),
        &[],
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with no tiles");
    fixture.assert_edges(&document, &[]);
    let trailer = document
        .trailer
        .expect("should include an auxiliary trailer");
    assert!(trailer.labels.is_empty(), "should have no labels");
    assert!(
        trailer.representative_type_urls.is_empty(),
        "should have no URL slots"
    );
    assert!(
        trailer.representative_type_urls_interner.is_empty(),
        "should have no URLs"
    );
    assert!(
        resolver.asked.borrow().is_empty(),
        "should skip resolution even for an empty query"
    );
}

#[test]
fn constructor_slot_alignment() {
    let fixture = Fixture::new("edges-constructor-slot-alignment");
    let document = EdgesDocument::new(
        fixture.scene(),
        &fixture.all_tiles(),
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Minimal,
            limits: EdgesLimits { .. },
            resolver: FailingResolver,
        },
    )
    .expect("should construct with terminal-depth tiles");
    fixture.assert_edges(&document, &(0..EDGES).collect::<Vec<_>>());
}

#[test]
fn capacity_boundaries() {
    let fixture = Fixture::new("edges-capacity-boundaries");
    let tiles = fixture.all_tiles();
    let total = ENDPOINTS.len();
    for capacity in [0, total - 1, total, total + 5] {
        let document = EdgesDocument::new(
            fixture.scene(),
            &tiles,
            &EdgesDocumentOptions {
                detail: EdgesDocumentDetailLevel::Minimal,
                limits: EdgesLimits {
                    edges: u32::try_from(capacity).expect("should fit the capacity in u32"),
                    ..
                },
                resolver: FailingResolver,
            },
        )
        .expect("should construct with terminal-depth tiles");
        assert_eq!(
            document.ids.len(),
            capacity.min(total),
            "should respect capacity {capacity}"
        );
        assert_eq!(
            document.complete,
            capacity >= total,
            "should report completeness at capacity {capacity}"
        );
    }
}

#[test]
fn tiles_duplicate_and_permuted() {
    let fixture = Fixture::new("edges-tiles-duplicate-and-permuted");
    // Node 2 has a self-loop. Nodes 5 and 7 form the reciprocal pair.
    let looped = fixture.tile_of(NodeRowId::new(2));
    let source = fixture.tile_of(NodeRowId::new(5));
    let target = fixture.tile_of(NodeRowId::new(7));
    assert_ne!(source, target, "should exercise distinct tiles");
    let options = EdgesDocumentOptions {
        detail: EdgesDocumentDetailLevel::Minimal,
        limits: EdgesLimits { .. },
        resolver: FailingResolver,
    };
    for tiles in [vec![looped], vec![looped, looped]] {
        let document = EdgesDocument::new(fixture.scene(), &tiles, &options)
            .expect("should construct the self-loop document");
        fixture.assert_edges(&document, &[2]);
    }
    for tiles in [[source, target], [target, source]] {
        let document = EdgesDocument::new(fixture.scene(), &tiles, &options)
            .expect("should construct the reciprocal-pair document");
        fixture.assert_edges(&document, &[3, 4]);
    }
}

#[test]
fn trailer_distinct_borrowed_labels() {
    let fixture = Fixture::varied("edges-trailer-distinct-borrowed-labels");
    let document = EdgesDocument::new(
        fixture.scene(),
        &fixture.all_tiles(),
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { .. },
            resolver: FakeResolver::new(Vec::new()),
        },
    )
    .expect("should construct with terminal-depth tiles");
    let trailer = document
        .trailer
        .expect("should include an auxiliary trailer");
    assert_eq!(
        trailer.labels.len(),
        ENDPOINTS.len(),
        "should label every edge"
    );
    for row in 0..EDGES {
        let slot = EdgeSlot::from_usize(usize::try_from(row).expect("should fit the row in usize"));
        assert_eq!(
            trailer.labels[slot].as_ref(),
            format!("edge-{row}"),
            "should carry edge {row}'s text"
        );
        assert!(
            core::ptr::eq(trailer.labels[slot], fixture.label_of(EdgeRowId::new(row))),
            "should borrow edge {row}'s label from the captured scene"
        );
    }
}

#[test]
fn dispatch_dedup_two_types() {
    let fixture = Fixture::varied("edges-dispatch-dedup-two-types");
    let first = *fixture.ontology_uuid(0);
    let shared = *fixture.ontology_uuid(2);
    let unsolicited = *fixture.ontology_uuid(1);
    let first_url = FakeResolver::url("first");
    let shared_url = FakeResolver::url("shared");
    let resolver = FakeResolver::new(vec![
        (shared, shared_url.clone()),
        (unsolicited, FakeResolver::url("unsolicited")),
        (first, first_url.clone()),
    ]);
    let document = EdgesDocument::new(
        fixture.scene(),
        &fixture.all_tiles(),
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with terminal-depth tiles");
    resolver.assert_query(&[first, shared]);
    let trailer = document
        .trailer
        .expect("should include an auxiliary trailer");
    let mut expected = vec![Some(shared_url); ENDPOINTS.len()];
    expected[0] = Some(first_url);
    assert_eq!(
        resolved_urls(&trailer),
        expected,
        "should resolve each edge's own type"
    );
    assert_eq!(
        trailer.representative_type_urls_interner.len(),
        2,
        "should omit the unsolicited answer"
    );
}

#[test]
fn dispatch_unresolved_type() {
    let fixture = Fixture::varied("edges-dispatch-unresolved-type");
    let first = *fixture.ontology_uuid(0);
    let shared = *fixture.ontology_uuid(2);
    let shared_url = FakeResolver::url("shared");
    let resolver = FakeResolver::new(vec![(shared, shared_url.clone())]);
    let document = EdgesDocument::new(
        fixture.scene(),
        &fixture.all_tiles(),
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { .. },
            resolver: &resolver,
        },
    )
    .expect("should construct with terminal-depth tiles");
    resolver.assert_query(&[first, shared]);
    let trailer = document
        .trailer
        .expect("should include an auxiliary trailer");
    let mut expected = vec![Some(shared_url); ENDPOINTS.len()];
    expected[0] = None;
    assert_eq!(
        resolved_urls(&trailer),
        expected,
        "should leave the unanswered type's edge unresolved"
    );
}

#[test]
fn dispatch_reversed_answers() {
    let fixture = Fixture::varied("edges-dispatch-reversed-answers");
    let first = *fixture.ontology_uuid(0);
    let shared = *fixture.ontology_uuid(2);
    let first_url = FakeResolver::url("first");
    let shared_url = FakeResolver::url("shared");
    let forward = vec![(first, first_url.clone()), (shared, shared_url.clone())];
    let reversed = vec![(shared, shared_url.clone()), (first, first_url.clone())];
    let mut expected = vec![Some(shared_url); ENDPOINTS.len()];
    expected[0] = Some(first_url);
    for answers in [forward, reversed] {
        let resolver = FakeResolver::new(answers);
        let document = EdgesDocument::new(
            fixture.scene(),
            &fixture.all_tiles(),
            &EdgesDocumentOptions {
                detail: EdgesDocumentDetailLevel::Auxiliary,
                limits: EdgesLimits { .. },
                resolver: &resolver,
            },
        )
        .expect("should construct with terminal-depth tiles");
        resolver.assert_query(&[first, shared]);
        let trailer = document
            .trailer
            .expect("should include an auxiliary trailer");
        assert_eq!(
            resolved_urls(&trailer),
            expected,
            "should resolve each edge independently of answer order"
        );
    }
}

#[test]
fn resolver_failure() {
    let fixture = Fixture::new("edges-resolver-failure");
    let Err(report) = EdgesDocument::new(
        fixture.scene(),
        &fixture.all_tiles(),
        &EdgesDocumentOptions {
            detail: EdgesDocumentDetailLevel::Auxiliary,
            limits: EdgesLimits { .. },
            resolver: FailingResolver,
        },
    ) else {
        panic!("should propagate the resolver's failure");
    };
    assert_matches!(report.current_context(), EdgesDocumentError::Hydrate,);
    assert_matches!(
        report.downcast_ref::<HydrateError>(),
        Some(HydrateError::Query)
    );
}

#[test]
fn scene_hidden_rows() {
    let mut fixture = Fixture::new("edges-scene-hidden-rows");
    let tiles = fixture.all_tiles();
    // Edge 5 is the only edge touching nodes 3 or 6.
    let cases: [(Vec<u64>, Vec<u64>); 3] = [
        (
            (0..NODES).filter(|&row| row != 3).collect(),
            (0..EDGES).collect(),
        ),
        (
            (0..NODES).filter(|&row| row != 6).collect(),
            (0..EDGES).collect(),
        ),
        (
            (0..NODES).collect(),
            (0..EDGES).filter(|&row| row != 5).collect(),
        ),
    ];
    for (nodes, edges) in cases {
        fixture.restrict(nodes, edges);
        let document = EdgesDocument::new(
            fixture.scene(),
            &tiles,
            &EdgesDocumentOptions {
                detail: EdgesDocumentDetailLevel::Minimal,
                limits: EdgesLimits { .. },
                resolver: FailingResolver,
            },
        )
        .expect("should construct with a restricted scene");
        fixture.assert_edges(&document, &[0, 1, 2, 3, 4]);
    }
}
