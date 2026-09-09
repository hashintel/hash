use alloc::sync::Arc;
use core::assert_matches;

use arc_swap::Guard;
use camino::Utf8Path;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{
    super::masks::TypeMasks, TileDocument, TileDocumentDetailLevel, TileDocumentError,
    TileDocumentOptions, TileLimits, TileSlot,
};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Label, OwnedLegend},
    file::{generation::Generation, morton::read::MortonFile},
    identity::{BasePosition, Column, NodeRowId, OntologyRowId},
    math::Bounds2,
    morton::{Depth, MortonCell, MortonKey, MortonTile, Zoom},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    salt::{
        fit::prepare::identity::IdentityTable,
        lod::{key, stage::WIRE_FRAME},
        wire::Mode,
    },
    serve2::{
        delta::{Delta, epoch::Epoch},
        membership::{OntologySelection, SelectionSlot},
        scene::Scene,
        schedule::ViewSchedule,
        tests::fixture::{NODES, TamperFixture, secret},
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

    fn node_identity(seed: u8) -> ArchivedEntityId {
        ArchivedEntityId {
            web_id: Uuid::from_bytes([seed; 16]).into(),
            entity_uuid: Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
        }
    }

    /// Assigns distinct labels and both empty and nonempty representative icons.
    fn varied(name: &str) -> Self {
        let files = TamperFixture::publish(name);
        let target = files.generation().repository().files.node_identities.name();
        let generation = files.tamper(&target, |path| {
            let mut table = IdentityTable::<NodeRowId, ArchivedEntityId>::new();
            for row in 0..NODES {
                table.push(Self::node_identity(
                    u8::try_from(row).expect("fixture row counts fit u8"),
                ));
            }
            let legends: Vec<_> = (0..NODES)
                .map(|row| {
                    let representative = OntologyRowId::new(if row == 0 { 0 } else { 2 });
                    OwnedLegend::new(representative, Label::new(&format!("node-{row}")))
                })
                .collect();
            let mut file = Self::recreate_writable(path);
            let _digest = table
                .write_into(legends.iter().map(AsRef::as_ref), &mut file)
                .expect("should write the varied node identities");
        });
        Self::from_generation(files, generation)
    }

    fn restrict(&mut self, nodes: impl IntoIterator<Item = u64>) {
        self.mask = VisibilityMask::partial(
            &self.epoch,
            self.actor,
            CompressedBitSet::from_rows(nodes.into_iter().map(NodeRowId::new)),
            CompressedBitSet::from_rows(core::iter::empty()),
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

    fn key_of(&self, row: u64) -> MortonKey {
        let position = self
            .world
            .layout
            .position(&self.epoch, NodeRowId::new(row))
            .expect("should resolve the fixture node's position");
        key::keys(&[position], WIRE_FRAME)[0]
    }

    fn ontology_uuid(&self, row: u64) -> ArchivedOntologyTypeUuid {
        self.world
            .ontology
            .key_of(&self.epoch, OntologyRowId::new(row))
            .expect("should resolve the fixture ontology row")
    }

    fn label_of(&self, row: NodeRowId) -> &Label {
        self.world
            .layout
            .index
            .payload(&self.epoch, row)
            .expect("should resolve the fixture node's display payload")
            .label()
    }

    /// Returns a terminal-zoom tile none of the fixture's nodes occupy.
    fn empty_terminal_tile(&self) -> MortonTile {
        let depth = Depth::from_zoom(self.world.schedule().max_tile_depth());
        let occupied: Vec<_> = (0..NODES).map(|row| self.key_of(row).tile(depth)).collect();
        let mut candidate = MortonTile {
            z: depth,
            x: 0,
            y: 0,
        };
        while occupied.contains(&candidate) {
            candidate.x += 1;
        }
        candidate
    }

    /// Reads the stored bucket, Morton key and row permutation.
    fn records(&self) -> Vec<(Depth, MortonKey, NodeRowId)> {
        let generation = self.world.generation();
        let files = &generation.repository().files;
        let morton: MortonFile = files
            .morton
            .open(generation)
            .expect("should open the recorded keys");
        let rows: Column<BasePosition, NodeRowId> = files
            .row_of_position
            .open(generation)
            .expect("should open the row permutation");

        (0..morton.count())
            .map(|index| {
                let position = BasePosition::from_u64(index);
                (
                    morton.bucket_of(position),
                    morton.code(position),
                    rows.view()[position],
                )
            })
            .collect()
    }

    /// Selects stored rows in bucket-major order with counts for each bucket.
    fn delivered_in(
        &self,
        first: Depth,
        last: Depth,
        cell: MortonCell,
    ) -> (Vec<NodeRowId>, Vec<usize>) {
        let records = self.records();
        let rows = records
            .iter()
            .filter(|&&(bucket, key, _)| first <= bucket && bucket <= last && cell.contains(key))
            .map(|&(_, _, node)| node)
            .collect();
        let runs = (first..=last)
            .map(|bucket| {
                records
                    .iter()
                    .filter(|&&(held, key, _)| held == bucket && cell.contains(key))
                    .count()
            })
            .collect();
        (rows, runs)
    }
}

/// Refuses a request past the configured type-count limit, under [`TileDocumentError::Types`].
#[test]
fn types_over_limit() {
    let fixture = Fixture::new("tile-types-over-limit");
    let types = [ArchivedOntologyTypeUuid::from(Uuid::nil()); 3];
    let Err(report) = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&types),
            limits: TileLimits {
                colored_type_ids: 2,
            },
        },
    ) else {
        panic!("should refuse a type count past the limit");
    };
    assert_matches!(
        report.current_context(),
        TileDocumentError::Types {
            count: 3,
            maximum: 2
        },
    );
}

/// Admits a request at exactly the configured type-count cap.
#[test]
fn types_limit_boundary() {
    let fixture = Fixture::new("tile-types-limit-boundary");
    let types = [ArchivedOntologyTypeUuid::from(Uuid::nil()); 32];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&types),
            limits: TileLimits { .. },
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
}

/// Refuses a zoom past the schedule's deepest served tile, under [`TileDocumentError::Zoom`].
#[test]
fn zoom_over_maximum() {
    let fixture = Fixture::new("tile-zoom-over-maximum");
    let maximum = fixture.world.schedule().max_tile_depth();
    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let coordinate = MortonTile {
        z: Depth::new(maximum.get() + 1),
        x: 0,
        y: 0,
    };
    let Err(report) = TileDocument::new(
        fixture.scene(),
        coordinate,
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    ) else {
        panic!("should refuse a zoom past the schedule maximum");
    };
    assert_matches!(
        report.current_context(),
        TileDocumentError::Zoom { maximum: actual, .. } if *actual == maximum,
    );
}

/// Refuses a coordinate outside its own zoom's grid, under [`TileDocumentError::Coordinate`].
#[test]
fn coordinate_outside_grid() {
    let fixture = Fixture::new("tile-coordinate-outside-grid");
    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    for coordinate in [
        MortonTile {
            z: Depth::new(1),
            x: 2,
            y: 0,
        },
        MortonTile {
            z: Depth::new(1),
            x: 0,
            y: 2,
        },
    ] {
        let Err(report) = TileDocument::new(
            fixture.scene(),
            coordinate,
            &TileDocumentOptions {
                mode: Mode::Total,
                detail: TileDocumentDetailLevel::Minimal,
                types: OntologySelection::new(&empty),
                limits: TileLimits { .. },
            },
        ) else {
            panic!("should refuse a coordinate outside its zoom's grid");
        };
        assert_matches!(
            report.current_context(),
            TileDocumentError::Coordinate { tile: refused } if *refused == coordinate,
        );
    }
}

/// An occupied nonroot tile can contain earlier buckets without adding rows at its own cut.
#[test]
fn mode_delta_empty_total_full() {
    let fixture = Fixture::new("tile-mode-delta-empty-total-full");
    let maximum = fixture.world.schedule().max_tile_depth();

    let (coordinate, cut, delta_runs, total_rows, total_runs) = (0..NODES)
        .flat_map(|row| {
            let key = fixture.key_of(row);
            (1..=maximum.get()).map(move |level| (key, level))
        })
        .find_map(|(key, level)| {
            let zoom = Zoom::new(level).expect("should lie within the served zoom range");
            let coordinate = key.tile(Depth::new(level));
            let cell = MortonCell::from_tile(coordinate).expect("should resolve the cell");
            let cut = fixture.world.schedule().cut(zoom);
            let (delta_rows, delta_runs) = fixture.delivered_in(cut, cut, cell);
            let (total_rows, total_runs) = fixture.delivered_in(Depth::MIN, cut, cell);
            (delta_rows.is_empty() && !total_rows.is_empty())
                .then_some((coordinate, cut, delta_runs, total_rows, total_runs))
        })
        .expect(
            "the fixture should express a nonroot tile whose delta is empty and whose total is not",
        );

    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let selection = OntologySelection::new(&empty);
    let options = |mode| TileDocumentOptions {
        mode,
        detail: TileDocumentDetailLevel::Minimal,
        types: selection,
        limits: TileLimits { .. },
    };

    let delta_document = TileDocument::new(fixture.scene(), coordinate, &options(Mode::Delta))
        .expect("should construct the delta document");
    assert!(
        delta_document.ids.is_empty(),
        "should carry no rows this tile newly delivers"
    );
    assert_eq!(
        delta_document.generation,
        fixture.world.generation().id().digest()
    );
    assert_eq!(delta_document.coordinate, coordinate);
    assert_eq!(delta_document.mode, Mode::Delta);
    assert_eq!(delta_document.positions.len(), delta_document.ids.len());
    assert_eq!(delta_document.first_bucket, cut);
    assert_eq!(delta_document.runs, delta_runs);
    assert_eq!(
        delta_document.runs.iter().sum::<usize>(),
        delta_document.ids.len(),
        "the run partition should sum to the delivered row count"
    );

    let total_document = TileDocument::new(fixture.scene(), coordinate, &options(Mode::Total))
        .expect("should construct the total document");
    let expected_ids: Vec<_> = total_rows
        .iter()
        .map(|&row| fixture.world.layout.index.encode(row))
        .collect();
    let expected_positions: Vec<_> = total_rows
        .iter()
        .map(|&row| {
            fixture
                .world
                .layout
                .position(&fixture.epoch, row)
                .expect("should resolve the fixture node's position")
        })
        .collect();
    assert_eq!(
        total_document.ids.iter().copied().collect::<Vec<_>>(),
        expected_ids,
        "should list the cumulative rows in bucket-major order"
    );
    assert_eq!(
        total_document.positions.iter().copied().collect::<Vec<_>>(),
        expected_positions,
        "should list each cumulative row's own position, read independently through World"
    );
    assert_eq!(
        total_document.generation,
        fixture.world.generation().id().digest()
    );
    assert_eq!(total_document.coordinate, coordinate);
    assert_eq!(total_document.mode, Mode::Total);
    assert_eq!(total_document.positions.len(), total_document.ids.len());
    assert_eq!(total_document.first_bucket, Depth::MIN);
    assert_eq!(total_document.runs, total_runs);
    assert_eq!(
        total_document.runs.iter().sum::<usize>(),
        total_rows.len(),
        "the run partition should sum to the delivered row count"
    );
}

/// Root metadata describes the admitted fixture rows.
#[test]
fn global_root_metadata() {
    let fixture = Fixture::new("tile-global-root-metadata");
    let records = fixture.records();
    let cut = fixture.world.schedule().cut(Zoom::MIN);
    let visible = records
        .iter()
        .filter(|&&(bucket, ..)| bucket <= cut)
        .count();
    let deepest_occupied = records
        .iter()
        .map(|&(bucket, ..)| bucket)
        .max()
        .expect("should contain base rows");

    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct the root tile");

    let global = document
        .global
        .expect("should include global metadata at the root");
    assert_eq!(global.visible, visible as u64);
    assert_eq!(global.bounds, fixture.world.layout.base_bounds());
    assert_eq!(global.min_resolution, u64::from(deepest_occupied.get()));
}

/// A nonroot tile omits global metadata.
#[test]
fn global_nonroot_absent() {
    let fixture = Fixture::new("tile-global-nonroot-absent");
    let coordinate = fixture.key_of(0).tile(Depth::new(1));
    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        coordinate,
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct a nonroot tile");
    assert!(
        document.global.is_none(),
        "should omit global metadata off the root"
    );
}

/// The terminal cut includes the deepest bucket and leaves no children to request.
#[test]
fn children_zero_terminal() {
    let fixture = Fixture::new("tile-children-zero-terminal");
    let depth = Depth::from_zoom(fixture.world.schedule().max_tile_depth());
    let coordinate = MortonTile {
        z: depth,
        x: 0,
        y: 0,
    };
    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        coordinate,
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct at the deepest served zoom");
    assert_eq!(
        document.children, 0,
        "should report no children once the cut reaches the schedule's deepest bucket"
    );
}

/// Minimal detail omits the trailer.
#[test]
fn trailer_minimal_omitted() {
    let fixture = Fixture::new("tile-trailer-minimal-omitted");
    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct with the minimal detail level");
    assert!(
        document.trailer.is_none(),
        "should omit the trailer at minimal detail"
    );
}

/// Auxiliary details borrow labels and preserve each row's representative icon.
#[test]
fn trailer_auxiliary_slot_alignment() {
    let fixture = Fixture::varied("tile-trailer-auxiliary-slot-alignment");
    let cut = fixture.world.schedule().cut(Zoom::MIN);
    let root_cell =
        MortonCell::from_tile(Fixture::tile(0, 0, 0)).expect("the root cell always resolves");
    let (rows, _) = fixture.delivered_in(Depth::MIN, cut, root_cell);
    assert!(
        rows.len() >= 2,
        "the fixture should deliver at least two rows to witness distinct values"
    );

    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Auxiliary,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct with the auxiliary detail level");

    let expected_ids: Vec<_> = rows
        .iter()
        .map(|&row| fixture.world.layout.index.encode(row))
        .collect();
    let expected_positions: Vec<_> = rows
        .iter()
        .map(|&row| {
            fixture
                .world
                .layout
                .position(&fixture.epoch, row)
                .expect("should resolve the fixture node's position")
        })
        .collect();
    assert_eq!(document.ids.len(), rows.len());
    assert_eq!(document.positions.len(), rows.len());
    assert_eq!(
        document.ids.iter().copied().collect::<Vec<_>>(),
        expected_ids,
        "should list the delivered rows in bucket-major order"
    );
    assert_eq!(
        document.positions.iter().copied().collect::<Vec<_>>(),
        expected_positions,
        "should list each delivered row's own position, read independently through World"
    );

    let trailer = document
        .trailer
        .expect("should include an auxiliary trailer");
    assert_eq!(trailer.labels.len(), rows.len());
    assert_eq!(trailer.icons.len(), rows.len());

    let mut saw_icon = false;
    let mut saw_empty_icon = false;
    for (index, &row) in rows.iter().enumerate() {
        let slot = TileSlot::from_usize(index);
        let row_index = row.as_u64();

        assert_eq!(
            trailer.labels[slot].as_ref(),
            format!("node-{row_index}"),
            "should carry row {row_index}'s own text"
        );
        assert!(
            core::ptr::eq(trailer.labels[slot], fixture.label_of(row)),
            "should borrow row {row_index}'s label from the captured scene"
        );

        let icon = trailer.icons[slot].as_ref();
        if row_index == 0 {
            assert_eq!(
                icon, "fixture-icon",
                "row 0's representative has its own icon"
            );
            saw_icon = true;
        } else {
            assert_eq!(
                icon, "",
                "row {row_index}'s representative has no icon through its trivial closure"
            );
            saw_empty_icon = true;
        }
    }
    assert!(
        saw_icon && saw_empty_icon,
        "should witness both representative icon values"
    );
}

/// An empty type selection omits the mask column.
#[test]
fn mask_omitted_empty_selection() {
    let fixture = Fixture::new("tile-mask-omitted-empty-selection");
    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct with an empty type selection");
    assert!(
        document.type_masks.is_none(),
        "should omit the mask column for an empty selection"
    );
}

/// A nonempty selection over a tile with no delivered rows keeps a present, empty mask column.
#[test]
fn mask_present_empty() {
    let fixture = Fixture::new("tile-mask-present-empty");
    let type0 = fixture.ontology_uuid(0);
    let requested = [type0];
    let coordinate = fixture.empty_terminal_tile();
    let document = TileDocument::new(
        fixture.scene(),
        coordinate,
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&requested),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct an empty tile at the deepest served zoom");
    let masks = document
        .type_masks
        .expect("should keep a present-but-empty column");
    assert_eq!(
        masks.bits.row_domain_size(),
        0,
        "should carry no rows over an empty tile"
    );
    assert_eq!(
        masks.bits.col_domain_size(),
        requested.len(),
        "should still carry one column per requested type"
    );
}

/// An unknown type uuid produces zero bits for every row.
#[test]
fn mask_unknown_uuid_zero_bits() {
    let fixture = Fixture::new("tile-mask-unknown-uuid-zero-bits");
    let unknown = ArchivedOntologyTypeUuid::from(Uuid::from_u128(0xDEAD_BEEF));
    let requested = [unknown];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&requested),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct with an unresolved type request");
    let masks = document.type_masks.expect("should keep a present column");
    assert_eq!(
        masks.bits.col_domain_size(),
        requested.len(),
        "should keep one column for the unresolved type"
    );
    assert!(
        masks.bits.row_domain_size() > 0,
        "the root cut should deliver at least one row"
    );
    assert!(
        masks.bits.rows().all(|slot| masks.bits.is_empty_row(slot)),
        "should set no bit for a type no row carries"
    );
}

/// Duplicate types retain separate selection slots.
///
/// Type 1 is a child of type 0. Every node therefore matches type 0, including the odd rows
/// whose direct type is 1. Type 2 has no node members.
#[test]
fn mask_duplicate_slots() {
    let fixture = Fixture::new("tile-mask-duplicate-slots");
    let cut = fixture.world.schedule().cut(Zoom::MIN);
    let root_cell =
        MortonCell::from_tile(Fixture::tile(0, 0, 0)).expect("the root cell always resolves");
    let (rows, _) = fixture.delivered_in(Depth::MIN, cut, root_cell);
    assert!(
        !rows.is_empty(),
        "the root cut should deliver at least one row"
    );

    let type0 = fixture.ontology_uuid(0);
    let type1 = fixture.ontology_uuid(1);
    let type2 = fixture.ontology_uuid(2);
    let unknown = ArchivedOntologyTypeUuid::from(Uuid::from_u128(0xDEAD_BEEF));
    let requested = [
        type0, type1, type2, unknown, type0, type1, type2, unknown, type0,
    ];
    let membership: [Option<u64>; 9] = [
        Some(0),
        Some(1),
        Some(2),
        None,
        Some(0),
        Some(1),
        Some(2),
        None,
        Some(0),
    ];

    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Minimal,
            types: OntologySelection::new(&requested),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct the root tile");
    let masks = document
        .type_masks
        .expect("should keep a mask column for a nonempty selection");

    assert_eq!(masks.bits.row_domain_size(), rows.len());
    assert_eq!(masks.bits.col_domain_size(), requested.len());
    for (row_index, &row) in rows.iter().enumerate() {
        let row_slot = TileSlot::from_usize(row_index);
        for (bit, &type_row) in membership.iter().enumerate() {
            let expected = match type_row {
                Some(0) => true,
                Some(1) => row.as_u64() & 1 == 1,
                _ => false,
            };
            assert_eq!(
                masks
                    .bits
                    .contains(row_slot, SelectionSlot::from_usize(bit)),
                expected,
                "row {row_index}'s membership at requested slot {bit} should match its own type"
            );
        }
    }
}

/// Mask slots follow the input row order.
#[test]
fn mask_permuted_delivered_order() {
    let fixture = Fixture::new("tile-mask-permuted-delivered-order");
    let type1 = fixture.ontology_uuid(1);
    let requested = [type1];
    let selection = OntologySelection::new(&requested);
    let rows = [NodeRowId::new(3), NodeRowId::new(0), NodeRowId::new(5)];
    let masks = TypeMasks::<TileSlot>::new(fixture.scene(), rows, selection);
    let bit = SelectionSlot::from_usize(0);
    assert!(
        masks.bits.contains(TileSlot::from_usize(0), bit),
        "row 3 should match type 1"
    );
    assert!(
        !masks.bits.contains(TileSlot::from_usize(1), bit),
        "row 0 should not match type 1"
    );
    assert!(
        masks.bits.contains(TileSlot::from_usize(2), bit),
        "row 5 should match type 1 at its input slot"
    );
}

/// A row outside the fitted position domain keeps its slot's bits clear.
#[test]
fn mask_row_out_of_domain() {
    let fixture = Fixture::new("tile-mask-row-out-of-domain");
    let type1 = fixture.ontology_uuid(1);
    let requested = [type1];
    let selection = OntologySelection::new(&requested);
    let rows = [NodeRowId::new(0), NodeRowId::new(NODES), NodeRowId::new(1)];
    let masks = TypeMasks::<TileSlot>::new(fixture.scene(), rows, selection);
    let bit = SelectionSlot::from_usize(0);
    assert!(
        !masks.bits.contains(TileSlot::from_usize(0), bit),
        "row 0 should not match type 1"
    );
    assert!(
        !masks.bits.contains(TileSlot::from_usize(1), bit),
        "a row outside the fitted position domain should keep its slot's bits clear"
    );
    assert!(
        masks.bits.contains(TileSlot::from_usize(2), bit),
        "row 1 should match type 1 at its input slot"
    );
}

/// A singleton visible scope delivers its sole row at the root.
#[test]
fn visibility_singleton_root() {
    let mut fixture = Fixture::varied("tile-visibility-singleton-root");
    let position = fixture
        .world
        .layout
        .position(&fixture.epoch, NodeRowId::new(0))
        .expect("should resolve the fixture node's position");
    fixture.restrict([0]);

    let empty: [ArchivedOntologyTypeUuid; 0] = [];
    let document = TileDocument::new(
        fixture.scene(),
        Fixture::tile(0, 0, 0),
        &TileDocumentOptions {
            mode: Mode::Total,
            detail: TileDocumentDetailLevel::Auxiliary,
            types: OntologySelection::new(&empty),
            limits: TileLimits { .. },
        },
    )
    .expect("should construct the root tile over the restricted scope");

    let global = document
        .global
        .expect("should include global metadata at the root");
    assert_eq!(
        global.visible, 1,
        "the lone admitted row should be the whole visible set"
    );
    assert_eq!(
        global.bounds,
        Bounds2::new(position, position),
        "the tight extent of one point is that point twice"
    );
    assert_eq!(
        global.min_resolution, 0,
        "a lone admitted row is the cascade's sole occupant, its own natural bucket the root"
    );

    assert_eq!(
        document.ids.len(),
        1,
        "the lone admitted row is the whole delivery"
    );
    assert_eq!(document.positions.len(), 1);
    let slot = TileSlot::from_usize(0);
    assert_eq!(
        document.ids[slot],
        fixture.world.layout.index.encode(NodeRowId::new(0)),
        "should deliver exactly row 0"
    );
    assert_eq!(
        document.positions[slot], position,
        "should carry the sole visible row's own position"
    );

    let trailer = document
        .trailer
        .expect("should include an auxiliary trailer");
    assert_eq!(trailer.labels.len(), 1, "should carry exactly one label");
    assert_eq!(trailer.icons.len(), 1, "should carry exactly one icon");
    assert_eq!(
        trailer.labels[slot].as_ref(),
        "node-0",
        "should carry the sole visible row's own label"
    );
    assert_eq!(
        trailer.icons[slot].as_ref(),
        "fixture-icon",
        "should carry the sole visible row's own icon"
    );
}
