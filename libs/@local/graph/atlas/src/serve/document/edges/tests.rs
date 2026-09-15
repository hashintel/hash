use alloc::sync::Arc;
use core::{assert_matches, cell::RefCell, iter};
use std::io;

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
    api::problem::{Problem, tests::assert_internal_diagnostic},
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
    serve::{
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

/// A [`TypeUrlResolver`] whose every request fails.
///
/// Its failure carries a store message and an attachment. A test asserts on the internal-problem
/// mapping and the redaction a resolver failure produces.
struct FailingResolver;

impl TypeUrlResolver for FailingResolver {
    fn resolve(
        &self,
        types: impl IntoIterator<Item = OntologyTypeUuid, IntoIter: ExactSizeIterator>,
    ) -> Result<impl IntoIterator<Item = (OntologyTypeUuid, VersionedUrl)>, Report<HydrateError>>
    {
        let _ = types;
        Err::<iter::Empty<(OntologyTypeUuid, VersionedUrl)>, _>(
            Report::new(io::Error::other("private-store-message"))
                .change_context(HydrateError::Query)
                .attach("private-property-value"),
        )
    }
}

/// A [`TypeUrlResolver`] fixture answering a fixed set of type URLs.
///
/// It records every requested batch. A test asserts which types the document asked for.
struct FakeResolver {
    answers: Vec<(OntologyTypeUuid, VersionedUrl)>,
    asked: RefCell<Vec<Vec<OntologyTypeUuid>>>,
}

impl FakeResolver {
    /// Constructs a resolver that returns exactly `answers` for every request.
    fn new(answers: Vec<(OntologyTypeUuid, VersionedUrl)>) -> Self {
        Self {
            answers,
            asked: RefCell::new(Vec::new()),
        }
    }

    /// Builds a deterministic fixture URL for `name`.
    ///
    /// # Panics
    ///
    /// Panics where `name` leaves the interpolated URL unparseable.
    fn url(name: &str) -> VersionedUrl {
        format!("https://example.com/types/{name}/v/1")
            .parse()
            .expect("should parse the fixture URL")
    }

    /// Asserts that this resolver was called exactly once, for the types in `expected`.
    ///
    /// That call's batch names exactly the distinct types in `expected`, in any order.
    ///
    /// # Panics
    ///
    /// Panics if the recorded calls differ from that expectation or the call log is borrowed
    /// mutably.
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

/// Reads each edge's representative type URL out of `trailer`, in slot order.
///
/// A slot is [`None`] where the trailer recorded no representative type.
fn resolved_urls(trailer: &EdgesTrailer<'_>) -> Vec<Option<VersionedUrl>> {
    trailer
        .representative_type_urls
        .iter()
        .map(|slot| {
            slot.map(|index| trailer.representative_type_urls_interner.entries()[index].clone())
        })
        .collect()
}

/// An opened synthetic generation, shared by every test below.
///
/// It carries the captured epoch, actor, visibility mask and delivery schedule that `scene()`
/// assembles into one scene.
struct Fixture {
    world: Arc<World>,
    epoch: Epoch,
    actor: VisibilityActor,
    mask: VisibilityMask,
    schedule: ViewSchedule,
    _files: TamperFixture,
}

impl Fixture {
    /// Opens `generation`, published from `files`, with a fresh delta identity.
    ///
    /// The mask grants one fixed test actor full visibility.
    ///
    /// # Panics
    ///
    /// Panics if [`World::open`] fails to open or validate the serving artifacts.
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
        let mask = VisibilityMask::full(actor);
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

    /// Publishes and opens the named synthetic generation unmodified.
    ///
    /// # Panics
    ///
    /// Panics where publishing the synthetic generation fails, and for the conditions
    /// [`Self::from_generation`] states.
    fn new(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let generation = files.generation().clone();
        Self::from_generation(files, generation)
    }

    /// Reopens `path` for writing, clearing its read-only staged-artifact permission first.
    ///
    /// # Panics
    ///
    /// Panics on any of three filesystem failures against `path`: an unreadable metadata entry,
    /// a permission change the process may not make, and a truncating reopen that fails.
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

    /// Builds a synthetic identity for edge `row`, derived from the fixture's own edge seed.
    ///
    /// # Panics
    ///
    /// Panics above a row of 255, which does not convert to u8. A row whose sum with
    /// [`EDGE_SEED`] leaves u8 overflows instead: a checked build panics there, an unchecked one
    /// wraps.
    fn edge_identity(row: u64) -> ArchivedEntityId {
        let seed = EDGE_SEED + u8::try_from(row).expect("should fit the fixture row in u8");
        ArchivedEntityId {
            web_id: Uuid::from_bytes([seed; 16]).into(),
            entity_uuid: Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
        }
    }

    /// Publishes the named synthetic generation, then rewrites its edge-identity table.
    ///
    /// The rewritten table holds [`Self::edge_identity`] values and per-row ontology legends that
    /// distinguish row 0 from the rest.
    ///
    /// # Panics
    ///
    /// Panics where publishing the synthetic generation fails and where the rewritten table does
    /// not write. It also panics for the conditions [`Self::recreate_writable`] and
    /// [`Self::from_generation`] state.
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

    /// Narrows this fixture's visibility mask and schedule to exactly the given rows.
    ///
    /// A later `scene()` call sees only those node and edge rows.
    fn restrict(
        &mut self,
        nodes: impl IntoIterator<Item = u64>,
        edges: impl IntoIterator<Item = u64>,
    ) {
        self.mask = VisibilityMask::partial(
            self.actor,
            CompressedBitSet::from_rows(nodes.into_iter().map(NodeRowId::new)),
            CompressedBitSet::from_rows(edges.into_iter().map(EdgeRowId::new)),
        );
        self.schedule = ViewSchedule::of(Arc::clone(&self.world), &self.epoch, &self.mask);
    }

    /// Assembles this fixture's world, epoch, mask and schedule into one [`Scene`].
    ///
    /// Its delivery is the schedule's cut at the zero offset.
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

    /// Builds a [`MortonTile`] at zoom `z` and coordinates `(x, y)`.
    ///
    /// # Panics
    ///
    /// Panics where `z` exceeds [`Depth::MAX`], the bound its depth carries.
    fn tile(z: u8, x: u32, y: u32) -> MortonTile {
        MortonTile {
            z: Depth::new(z),
            x,
            y,
        }
    }

    /// Returns the deepest-cut tile that contains `node`'s captured position.
    ///
    /// # Panics
    ///
    /// Panics where the fixture's epoch captured no position for `node`.
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

    /// Collects every deepest-cut tile the fixture's nodes occupy, sorted and deduplicated.
    fn all_tiles(&self) -> Vec<MortonTile> {
        let mut tiles: Vec<_> = (0..NODES)
            .map(|row| self.tile_of(NodeRowId::new(row)))
            .collect();
        tiles.sort_unstable_by_key(|tile| (tile.z.get(), tile.x, tile.y));
        tiles.dedup();
        tiles
    }

    /// Returns the identity the fixture generation assigned to `edge`.
    ///
    /// # Panics
    ///
    /// Panics where that generation holds no identity for `edge`.
    fn identity_of(&self, edge: EdgeRowId) -> ArchivedEntityId {
        self.world
            .topology
            .key_of(&self.epoch, edge)
            .expect("should resolve the fixture edge's identity")
    }

    /// Encodes the wire row id for `node`.
    ///
    /// # Panics
    ///
    /// Panics under [`NodeIndex::encode`](crate::serve::world::NodeIndex::encode)'s row-range and
    /// cache-miss conditions.
    ///
    /// # Warning
    ///
    /// On a 32-bit target, a node outside the wire range can instead return a cached row's
    /// encoding.
    fn encode(&self, node: NodeRowId) -> EncodedRowId<NodeRowId> {
        self.world.layout.index.encode(node)
    }

    /// Returns `edge`'s captured display label.
    ///
    /// # Panics
    ///
    /// Panics where the fixture captured no display payload for `edge`.
    fn label_of(&self, edge: EdgeRowId) -> &Label {
        self.world
            .topology
            .payload(&self.epoch, edge)
            .expect("should resolve the fixture edge's display payload")
            .label()
    }

    /// Returns the ontology type uuid the fixture generation assigned to ontology row `row`.
    ///
    /// # Panics
    ///
    /// Panics where that generation holds no ontology row `row`.
    fn ontology_uuid(&self, row: u64) -> ArchivedOntologyTypeUuid {
        self.world
            .ontology
            .key_of(&self.epoch, OntologyRowId::new(row))
            .expect("should resolve the fixture ontology row")
    }

    /// Asserts that `document` is complete and lists exactly the edges in `rows`.
    ///
    /// The identities, sources and targets appear in the order `rows` gives them.
    ///
    /// # Panics
    ///
    /// Panics where `document` departs from that expectation, and where a row in `rows` reaches
    /// past the fixture's [`ENDPOINTS`], which it indexes.
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

/// More tiles than the configured limit refuses with the exceeded count and the limit.
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

/// A minimal-detail request over every terminal-depth tile delivers every edge in row order.
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

/// Duplicate and permuted tile lists deliver the same edges as their canonical form.
///
/// A self-loop tile listed twice delivers its edge exactly once, and a reciprocal pair of tiles
/// delivers the same edges in either listed order.
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

/// Each edge resolves to its own type's URL whatever order the answers arrive in.
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

/// The log records the whole report while the response redacts it.
///
/// The logged [`Debug`](core::fmt::Debug) rendering includes the underlying store error's text and
/// the private attachment added below [`HydrateError::Query`]. Outside debug builds the response
/// carries the fixed detail instead of either.
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
    assert_matches!(
        report.current_context(),
        EdgesDocumentError::Hydrate(HydrateError::Query)
    );
    assert_matches!(
        report.downcast_ref::<HydrateError>(),
        Some(HydrateError::Query)
    );
    assert!(
        format!("{report:#}").contains("private-store-message"),
        "should retain the supplied source text in the report"
    );
    assert!(
        format!("{report:?}").contains("private-property-value"),
        "should retain the supplied attachment in the report"
    );
    assert_internal_diagnostic(
        move || Problem::from(report),
        &["private-store-message", "private-property-value"],
        "the detail hydration failed",
    );
}

/// Hiding either endpoint of an edge, or the edge itself, removes it from the document.
///
/// The cases hide node 3, node 6, and edge 5, the only edge touching those nodes. All three
/// deliver every other edge.
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
