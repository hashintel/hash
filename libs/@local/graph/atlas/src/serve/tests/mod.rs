//! Serving reads over a real published generation.
//!
//! The fixture publishes through the production `fit`, so every artifact the serving surface maps
//! is the pipeline's own output. Expectations derive from independently opened artifacts and the
//! schedule laws - fencepost sums, code-column scans, the quad walk - never from the assembly under
//! test.
#![expect(
    clippy::little_endian_bytes,
    reason = "the expectations spell out the wire contract's little-endian columns"
)]

use alloc::borrow::Cow;
use core::{assert_matches, num::NonZero};
use std::collections::{HashMap, HashSet};

use camino::Utf8PathBuf;
use futures::future::ready;
use hash_graph_postgres_store::store::{EntityEnd, EntityEvent};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::{
    collections::fast_hash_set,
    id::{Id, IdSlice, IdVec},
};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::{SmallVec, smallvec};
use type_system::{
    knowledge::entity::{EntityId, id::EntityUuid},
    ontology::id::{BaseUrl, VersionedUrl},
    principal::actor_group::WebId,
};
use uuid::Uuid;
use zerocopy::{LE, U64};

use super::{
    Atlas, CutOffset, EdgesError, EdgesLimits, EdgesRequest, GenerationId, OpenOptions,
    ServeLimits, TileError, TileLimits, TileQuery, TileRequest, View, ViewCensus, VisibilityLimits,
    VisibilityProof, WireRow, WireSecret, codec,
    delta::{DeltaEvent, DeltaRegister, DeltaRevision, DeltaSnapshot, PlacementCohort},
    edges::EdgesDetail,
    error::OpenAtlasError,
    hydrate::{
        DetailError, EdgeSlot, EdgesStore, LocateHydration, LocateLinkHydration,
        LocateNodeHydration, LocateOrder, LocateStore, TypeSlot,
    },
    locate::{LocateSubgraph, SourceSubject},
    neighbourhood::{EdgeColumns, ServedEdge},
    schedule::{ViewRow, ViewSchedule},
    tile::TileDetail,
};
use crate::{
    bitset::{CompressedBitSet, DenseBitSlice},
    device::Device,
    file::generation::GenerationRoot,
    identity::{BasePosition, CardRow, EdgeRowId, NodeRowId, OntologyRowId},
    postgres::id::ArchivedOntologyTypeUuid,
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        landmark::select::SelectionOptions,
        policy::classifier,
        wire::{Mode, tile::TileCoordinate},
    },
};

mod arrival;
mod authorization;
mod auxiliary;
mod delta_edges;
mod density;
mod frame_channel;
mod masking;
mod metadata_channel;
mod open;
mod row_codec;
mod schedule;
mod withdrawal;

/// The tests' default authority.
///
/// The operator proof is byte-identical to the pre-visibility serve.
pub(crate) static FULL: VisibilityProof = VisibilityProof::full_visibility();
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node as CorpusNode, Ontology, PROJECTOR_DIMENSIONS,
        auxiliary::Label, card::Card, memory::MemoryDataset,
    },
    file::{
        WriteInto as _,
        array::ArrayFile,
        generation::Generation,
        identity::{Key, Row},
        morton::read::MortonFile,
        quad::read::QuadFile,
    },
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, Bounds2, BoxedVecN, Log2, Vec2, VecN, positive},
    morton::{Depth, MortonCell, MortonKey},
    progress::NoProgress,
    salt::{
        fit::{ClassifierInput, FitConfig, PlacementOptions, Supplies, fit},
        lod::stage::LodConfig,
        wire::{
            edges::EdgesResponse,
            tests::section,
            tile::{TileHead, TileResponse},
        },
    },
};

/// Corpus rows of the fixture fit.
const NODES: usize = 48;

/// The fixture schedule.
///
/// `span = 1`, so the cut rule reads `bucket = z + 1` and the root spans buckets `0..=1`.
pub(crate) const FIXTURE_LOD: LodConfig = LodConfig {
    span: Log2::new(1).expect("1 lies below the shift width"),
    max_tile_depth: 3,
};

/// The tile payload's pinned slot indexes.
const HEAD: usize = 0;
const POSITIONS: usize = 1;
pub(crate) const ROW_IDS: usize = 2;
const TYPE_MASK: usize = 3;
const MASS: usize = 4;

/// The edges payload's pinned slot index.
const EDGE_IDS: usize = 3;

/// The fixture edge list: `(id, source row, target row)`, edge row order.
///
/// Row 2 carries a self-loop. Rows 3 and 4 are a reciprocal pair sharing both endpoints.
const FIXTURE_EDGES: [(u64, u64, u64); 6] = [
    (100, 0, 1),
    (101, 1, 2),
    (102, 2, 2),
    (103, 5, 40),
    (104, 40, 5),
    (105, 3, 7),
];

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-serve-{}-{name}",
            std::process::id()
        ));
    let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&dir);
    dir
}

/// One fixture corpus row, owning its projector embedding under a plain integer id.
type FixtureNode = CorpusNode<'static, U64<LE>>;

/// The fit-scale corpus rows.
///
/// Unit-norm pseudo-random representations whose canonical embeddings extend them with zeros,
/// typed per row by `types`. Every fixture corpus shares this geometry, so the placement
/// conditioning is one derivation.
fn fixture_nodes(
    types: impl Fn(usize) -> SmallVec<OntologyRowId, 2>,
) -> (
    Vec<FixtureNode>,
    HashMap<u64, BoxedVecN<CANONICAL_DIMENSIONS>>,
) {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x5E4E);
    let mut canonical = HashMap::new();

    let nodes: Vec<_> = (0..NODES)
        .map(|row| {
            let mut components = [0.0_f32; PROJECTOR_DIMENSIONS];
            for component in &mut components {
                *component = rng.random::<f32>() - 0.5;
            }
            let norm = components
                .iter()
                .map(|&component| f64::from(component) * f64::from(component))
                .sum::<f64>()
                .sqrt();
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the normalization factor of a 512-component vector is far inside f32 \
                          range"
            )]
            for component in &mut components {
                *component = (f64::from(*component) / norm) as f32;
            }

            let mut extended = BoxedVecN::<CANONICAL_DIMENSIONS>::zero();
            extended.as_array_mut()[..PROJECTOR_DIMENSIONS].copy_from_slice(&components);
            canonical.insert(row as u64, extended);

            CorpusNode {
                id: U64::<LE>::new(row as u64),
                ontology: types(row),
                embedding: Cow::Owned(BoxedVecN::new(&VecN::new(components))),
                confidence: None,
            }
        })
        .collect();

    (nodes, canonical)
}

/// A fit-scale corpus.
///
/// The [`fixture_nodes`] geometry with one node type alternating between two ontology rows, and
/// one link type.
fn fixture_dataset() -> MemoryDataset {
    let (nodes, canonical) = fixture_nodes(|row| smallvec![OntologyRowId::from_usize(row & 1)]);

    let edges = FIXTURE_EDGES
        .into_iter()
        .map(|(id, source, target)| Edge {
            id: U64::<LE>::new(id),
            source: NodeRowId::new(source),
            target: NodeRowId::new(target),
            ontology: smallvec![OntologyRowId::new(2)],
            embedding: None,
            confidence: None,
            source_confidence: None,
            target_confidence: None,
        })
        .collect();

    let ontology = vec![
        Ontology {
            id: U64::<LE>::new(0),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(1),
            parents: smallvec![],
        },
        Ontology {
            id: U64::<LE>::new(2),
            parents: smallvec![],
        },
    ];

    let cards = HashMap::from([
        (0, Card::verbatim("Person entity card".to_owned())),
        (1, Card::verbatim("Company entity card".to_owned())),
        (2, Card::verbatim("Employment link card".to_owned())),
    ]);

    MemoryDataset::new(nodes, edges, ontology, canonical, cards)
}

/// A deterministic provider deriving each embedding from its text hash.
struct HashEmbedder;

impl CardEmbedder for HashEmbedder {
    type Error = !;

    fn fingerprint(&self) -> EmbedderFingerprint {
        let mut hasher = Sha256::new();
        hasher.update(b"serve test embedder");
        EmbedderFingerprint::new(hasher.finalize())
    }

    fn embed<'text>(
        &self,
        texts: impl IntoIterator<Item = &'text str, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|text| {
                let mut hasher = Sha256::new();
                hasher.update(text.as_bytes());
                let bytes = hasher.finalize().to_bytes();

                let mut vector = BoxedVecN::zero();
                for (component, &byte) in vector.as_array_mut().iter_mut().zip(bytes.iter().cycle())
                {
                    *component = f32::from(byte) / 255.0;
                }
                vector
            })
            .collect()))
    }
}

/// A deterministic classifier input fitted from a synthetic corpus.
///
/// The supplied model input of the fixture fit.
fn fixture_classifier() -> ClassifierInput {
    const ROWS: usize = 4;
    // Coprime to the dimension, so no two corpus rows repeat.
    const PATTERN: [f32; 13] = [
        -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75,
    ];

    let mut storage = BoxedVecN::<{ ROWS * CANONICAL_DIMENSIONS }>::zero();
    for (component, &value) in storage
        .as_array_mut()
        .iter_mut()
        .zip(PATTERN.iter().cycle())
    {
        *component = value;
    }
    let embeddings: &IdSlice<CardRow, AlignedVecN<CANONICAL_DIMENSIONS>> = IdSlice::from_raw(
        AlignedVecN::from_slice(storage.as_array()).expect("boxed storage is aligned"),
    );

    let rows: IdVec<CardRow, _> = [
        ([0.7, 0.2, 0.1], b"group-a" as &[u8]),
        ([0.2, 0.6, 0.2], b"group-b"),
        ([0.1, 0.2, 0.7], b"group-c"),
        ([0.3, 0.4, 0.3], b"group-d"),
    ]
    .into_iter()
    .map(|(target, group)| {
        let mut hasher = Sha256::new();
        hasher.update(group);
        classifier::TrainingRow {
            target,
            weight: 1.0,
            group: hasher.finalize(),
        }
    })
    .collect();

    let training =
        classifier::TrainingSet::new(embeddings, &rows).expect("the fixture corpus validates");
    let classifier = classifier::fit(
        training,
        classifier::FitConfig { folds: 2, .. },
        &NoProgress,
    )
    .expect("the fixture classifier fits")
    .classifier;

    let mut hasher = Sha256::new();
    hasher.update(b"serve fixture classifier");
    ClassifierInput::Supplied {
        classifier,
        source: hasher.finalize(),
    }
}

fn fixture_config() -> FitConfig {
    FitConfig {
        seed: 11,
        selection: SelectionOptions {
            maximum_count: NonZero::new(8).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::fit(positive!(1.0), positive!(0.1))
            .expect("the reference falloff is well-conditioned"),
        neighbours: NonZero::new(4).expect("the fixture neighbour count is nonzero"),
        // The serving fixture reads artifacts, not placement quality:
        // it opts out of the default's training run.
        placement: PlacementOptions::LandmarkBaseline,
        lod: FIXTURE_LOD,
        ..
    }
}

/// Fits and publishes one fixture generation, as the pipeline writes it.
///
/// Identity artifacts carry the memory dataset's 8-byte positional ids, which the serving open
/// rejects.
async fn fit_fixture(name: &str) -> (GenerationRoot, Generation) {
    fit_dataset(name, &fixture_dataset()).await
}

/// Fits and publishes `dataset` as one fixture generation.
async fn fit_dataset(name: &str, dataset: &MemoryDataset) -> (GenerationRoot, Generation) {
    let root = GenerationRoot::new(scratch(name)).expect("the root should open");
    let published = fit(
        dataset,
        &HashEmbedder,
        &fixture_config(),
        Supplies {
            classifier: &fixture_classifier(),
            ..
        },
        &root,
        Device::Cpu.pin(0).resolve(),
        &NoProgress,
    )
    .await
    .expect("the fit should publish");

    let generation = root
        .open(published.id())
        .expect("the published generation should open");

    (root, generation)
}

/// The versioned type URL behind fixture ontology row `row`.
///
/// The rewritten ontology identities key each row by the uuid its URL derives, exactly as the
/// store's identities would.
fn fixture_type_url(row: u64) -> String {
    format!("https://example.com/types/fixture-{row}/v/1")
}

/// The edge-domain seed offset.
///
/// Link entities own ids disjoint from node ids, as the store's would be.
const EDGE_SEED: u8 = 64;

/// Rewrites a published fixture generation's identity artifacts with store-width ids.
///
/// Deterministic by row: ontology row `r` keys the uuid derived from [`fixture_type_url`] of `r`,
/// and node row `r` keys [`entity_id_of`] of `r`. Edge row `r` keys [`entity_id_of`] of
/// `EDGE_SEED + r`.
///
/// The memory dataset speaks 8-byte positional ids, which the serving open rejects; the rewrite
/// is the test-lane bridge that gives a fixture generation store-width ids. Open
/// trusts the metadata document's hash, not per-file digests (tooling verifies those), so the
/// rewritten artifacts serve.
///
/// Display payloads copy through the rewrite row by row, so a dataset's labels and icons survive
/// the bridge and serve exactly as the production pipeline wrote them.
fn store_identities(generation: &Generation) {
    use type_system::ontology::id::VersionedUrl;

    use crate::{
        file::identity::read::IdentityFile,
        postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
        salt::fit::prepare::identity::IdentityTable,
    };

    fn entity_table<R: Row>(rows: u64, seed: u8) -> IdentityTable<R, ArchivedEntityId> {
        let mut table = IdentityTable::new();
        for row in 0..rows {
            let row = u8::try_from(row).expect("fixture row counts fit u8");
            table.push(entity_id_of(seed + row));
        }
        table
    }

    let files = &generation.repository().files;
    let rows_of = |name: &crate::file::repository::FileName| {
        IdentityFile::open(generation.path_of(name))
            .expect("the published identity artifact opens")
            .rows()
    };

    let ontology_rows = rows_of(&files.ontology_identities.name());
    let mut ontology = IdentityTable::<OntologyRowId, ArchivedOntologyTypeUuid>::new();
    for row in 0..ontology_rows {
        let url: VersionedUrl = fixture_type_url(row)
            .parse()
            .expect("the fixture URL parses");
        ontology.push(ArchivedOntologyTypeUuid::from_url(&url));
    }

    let nodes = entity_table::<NodeRowId>(rows_of(&files.node_identities.name()), 0);
    let edges = entity_table::<EdgeRowId>(rows_of(&files.edge_identities.name()), EDGE_SEED);

    let ontology_payloads = payloads_of(&generation.path_of(&files.ontology_identities.name()));
    let node_payloads = payloads_of(&generation.path_of(&files.node_identities.name()));
    let edge_payloads = payloads_of(&generation.path_of(&files.edge_identities.name()));

    rewrite_identities(
        &generation.path_of(&files.ontology_identities.name()),
        &ontology,
        &ontology_payloads,
    );
    rewrite_identities(
        &generation.path_of(&files.node_identities.name()),
        &nodes,
        &node_payloads,
    );
    rewrite_identities(
        &generation.path_of(&files.edge_identities.name()),
        &edges,
        &edge_payloads,
    );
}

/// Reads every row's payload bytes out of a published identity artifact.
///
/// The mapping drops when this returns, so the caller can truncate and rewrite the file
/// afterwards.
fn payloads_of(path: &camino::Utf8Path) -> Vec<Vec<u8>> {
    use crate::file::identity::read::IdentityFile;

    let file = IdentityFile::open(path).expect("the published identity artifact opens");
    let payload = file.payload();
    file.spans()
        .iter()
        .map(|span| {
            let offset = usize::try_from(span.offset()).expect("payload regions fit usize");
            let length = usize::try_from(span.length()).expect("payload regions fit usize");
            payload[offset..offset + length].to_vec()
        })
        .collect()
}

/// Overwrites one identity artifact with a hand-built table, keeping the given payloads.
///
/// `payloads` carries one byte string per row, in row order - [`payloads_of`] of the published
/// artifact when the rewrite preserves them.
fn rewrite_identities<R, I>(
    path: &camino::Utf8Path,
    table: &crate::salt::fit::prepare::identity::IdentityTable<R, I>,
    payloads: &[Vec<u8>],
) where
    R: Row,
    I: Key,
{
    let rows = usize::try_from(table.len()).expect("fixture row counts fit the address space");
    assert_eq!(payloads.len(), rows, "one payload survives per row");
    let mut file = recreate_writable(path);
    let payloads: Vec<&I::Payload> = payloads
        .iter()
        .map(|bytes| {
            <I::Payload as zerocopy::TryFromBytes>::try_ref_from_bytes(bytes)
                .expect("published payload bytes cast as the id type's payload")
        })
        .collect();
    let _digest = table
        .write_into(payloads, &mut file)
        .expect("the identities should write");
}

/// Reopens a published artifact for rewriting.
///
/// Sealing dropped the write permission, so a tamper lifts it before truncating the file.
fn recreate_writable(path: &camino::Utf8Path) -> std::fs::File {
    let mut permissions = std::fs::metadata(path)
        .expect("the published artifact should stat")
        .permissions();
    #[expect(
        clippy::permissions_set_readonly_false,
        reason = "tests rewrite their own scratch files"
    )]
    permissions.set_readonly(false);
    std::fs::set_permissions(path, permissions).expect("the permissions should set");
    std::fs::File::create(path).expect("the published artifact rewrites")
}

/// The suite's wire secret, exactly the codec's key width, with an arbitrary value.
const TEST_WIRE_SECRET: [u8; 32] = *b"atlas-test-wire-secret-32-bytes!";

/// The open options every suite open uses.
fn test_open_options() -> OpenOptions {
    OpenOptions {
        wire_secret: WireSecret::new(TEST_WIRE_SECRET),
    }
}

/// Publishes one fixture generation with store-width identities and opens its serving surface.
pub(crate) async fn publish(name: &str) -> (Generation, Atlas) {
    publish_dataset(name, &fixture_dataset()).await
}

/// Publishes `dataset` with store-width identities and opens its serving surface.
async fn publish_dataset(name: &str, dataset: &MemoryDataset) -> (Generation, Atlas) {
    let (root, generation) = fit_dataset(name, dataset).await;
    store_identities(&generation);
    let atlas =
        Atlas::open(&root, generation.id(), test_open_options()).expect("the atlas should open");

    (generation, atlas)
}

/// One proof's delivery inputs, owned, so a test can hand assembly a [`View`].
///
/// A view borrows the census and the schedule its scope resolved; production holds both in the
/// visibility cache entry, and a test holds them here. Binding through [`Bound::view`] runs the
/// same pairing check the request boundary runs.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
pub(crate) struct Bound<'proof> {
    proof: &'proof VisibilityProof,
    census: ViewCensus,
    schedule: ViewSchedule,
    k: CutOffset,
    cohort: PlacementCohort<'proof>,
    delta: Option<&'proof DeltaSnapshot>,
}

impl<'proof> Bound<'proof> {
    /// Resolves `proof`'s census and schedule, the way a scope resolution would.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    fn new(atlas: &Atlas, proof: &'proof VisibilityProof, k: CutOffset) -> Self {
        Self::resolved(atlas, proof, PlacementCohort::EMPTY, k)
    }

    /// Resolves `proof`'s census and schedule against `cohort`, the way an arrival-bearing
    /// scope resolution would.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub(crate) fn resolved(
        atlas: &Atlas,
        proof: &'proof VisibilityProof,
        cohort: PlacementCohort<'proof>,
        k: CutOffset,
    ) -> Self {
        Self {
            proof,
            census: atlas.census(proof),
            schedule: ViewSchedule::of(atlas, proof, cohort),
            k,
            cohort,
            delta: None,
        }
    }

    /// Carries `delta` as the view's ingress capture, the way a data route would.
    pub(crate) fn withdrawing(mut self, delta: &'proof DeltaSnapshot) -> Self {
        self.delta = Some(delta);
        self
    }

    /// Resolves `proof` at the zero offset, the corpus-equivalent cut.
    fn of(atlas: &Atlas, proof: &'proof VisibilityProof) -> Self {
        Self::new(atlas, proof, CutOffset::ZERO)
    }

    /// Binds the delivery view assembly reads.
    pub(crate) fn view(&self, atlas: &Atlas) -> View<'_> {
        View::bind(
            atlas.grid,
            self.proof,
            self.census,
            &self.schedule,
            self.k,
            self.cohort,
            self.delta,
        )
        .expect("the fixture's proof, schedule and offset pair")
    }
}

/// Binds `proof`'s delivery view at the zero offset and reads it once.
pub(crate) fn viewing<T>(
    atlas: &Atlas,
    proof: &VisibilityProof,
    body: impl FnOnce(&View<'_>) -> T,
) -> T {
    let bound = Bound::of(atlas, proof);

    body(&bound.view(atlas))
}

pub(crate) fn request(z: u8, x: u32, y: u32, mode: Mode) -> TileRequest {
    TileRequest {
        coordinate: TileCoordinate { z, x, y },
        query: TileQuery {
            mode,
            ..TileQuery::default()
        },
    }
}

/// Returns the tile coordinate addressing a Morton cell.
fn coordinate_of(cell: MortonCell) -> TileCoordinate {
    let z = cell.depth().get();
    if z == 0 {
        return TileCoordinate { z, x: 0, y: 0 };
    }

    let [x, y] = cell.min_key().coordinates();
    TileCoordinate {
        z,
        x: x >> (32 - z),
        y: y >> (32 - z),
    }
}

/// Collects every quad node with its cell, walking children in Morton child order from the root.
fn walk(quad: &QuadFile, node: u32, cell: MortonCell, out: &mut Vec<(u32, MortonCell)>) {
    out.push((node, cell));
    let children = cell
        .children()
        .expect("fixture nodes stay above Depth::MAX");
    for (quadrant, child_cell) in children.into_iter().enumerate() {
        if let Some(child) = quad.nodes()[node as usize].child(quadrant) {
            walk(quad, child, child_cell, out);
        }
    }
}

/// Counts the fixture codes inside one cell by scanning the column.
fn population(morton: &MortonFile, cell: MortonCell) -> u64 {
    morton
        .codes()
        .iter()
        .filter(|code| cell.contains(MortonKey::from_bits(code.get())))
        .count() as u64
}

/// Extracts a subgraph's delivered node rows, in delivered order.
///
/// The subgraphs this resolves deliver fitted rows alone, so an arrival vessel is a fixture
/// defect rather than a case.
pub(crate) fn delivered_row_ids(atlas: &Atlas, subgraph: &LocateSubgraph) -> Vec<NodeRowId> {
    let row_ids = atlas.row_ids();
    subgraph
        .delivered
        .iter()
        .map(|&vessel| match vessel {
            ViewRow::Base(position) => row_ids[position],
            ViewRow::Arrival(index) => {
                panic!("a fitted-only fixture delivered the arrival vessel {index:?}")
            }
        })
        .collect()
}

/// Unwraps a fitted delivered edge.
///
/// The subgraphs this resolves deliver fitted edges alone, so a delta vessel is a fixture
/// defect rather than a case.
pub(crate) fn fitted(edge: ServedEdge) -> crate::serve::neighbourhood::DeliveredEdge {
    match edge {
        ServedEdge::Fitted(edge) => edge,
        ServedEdge::Delta(edge) => panic!("a fitted-only fixture delivered the delta {edge:?}"),
    }
}

/// Decodes a `ROW_IDS` section into row ids.
fn decode_rows(bytes: &[u8]) -> Vec<u32> {
    let (chunks, remainder) = bytes.as_chunks::<4>();
    assert!(remainder.is_empty(), "row sections are whole u32 columns");
    chunks
        .iter()
        .map(|&chunk| u32::from_le_bytes(chunk))
        .collect()
}

/// The independently opened serving artifacts of one generation.
pub(crate) struct Artifacts {
    pub morton: MortonFile,
    pub quad: QuadFile,
    pub coordinates: ArrayFile,
    pub rows: ArrayFile,
}

pub(crate) fn open_artifacts(generation: &Generation) -> Artifacts {
    let files = &generation.repository().files;
    Artifacts {
        morton: MortonFile::open(generation.path_of(&files.morton.name()))
            .expect("the morton artifact should open"),
        quad: QuadFile::open(generation.path_of(&files.quad.name()))
            .expect("the quad artifact should open"),
        coordinates: ArrayFile::open(generation.path_of(&files.wire_coordinates.name()))
            .expect("the coordinate artifact should open"),
        rows: ArrayFile::open(generation.path_of(&files.row_of_position.name()))
            .expect("the row artifact should open"),
    }
}

/// Reads the gather column narrowed to the fixture tests' `u32` row vocabulary.
pub(crate) fn fixture_row_ids(rows: &ArrayFile) -> Vec<u32> {
    rows.u64_le_elements()
        .expect("the row column is little-endian u64 rows")
        .iter()
        .map(|row| u32::try_from(row.get()).expect("fixture rows fit u32"))
        .collect()
}

/// The generation's extent, and the rows attaining any of its four extremes.
///
/// Removing exactly these rows from a view vacates every edge of the extent, which is what lets
/// an aggregate witness fail on an extent read off the artifacts rather than off the view: with
/// any edge still attained, the corpus extent and the view's extent agree there and the wrong
/// answer looks right.
fn extremes(points: &[Vec2], row_ids: &[u32]) -> (Bounds2, Vec<u32>) {
    let corpus = Bounds2::from_points(points.iter().copied()).expect("the fixture holds points");

    // Exact equality is the predicate: an extremum IS one of this column's own values, so a row
    // attains it bit-for-bit or does not attain it.
    #[expect(
        clippy::float_cmp,
        reason = "the comparand is drawn from this very column, so bit equality is the intended \
                  test"
    )]
    let mut attaining: Vec<u32> = points
        .iter()
        .enumerate()
        .filter(|(_, point)| {
            point.x() == corpus.min().x()
                || point.x() == corpus.max().x()
                || point.y() == corpus.min().y()
                || point.y() == corpus.max().y()
        })
        .map(|(position, _)| row_ids[position])
        .collect();
    attaining.sort_unstable();
    attaining.dedup();

    (corpus, attaining)
}

/// The generation's extent, and rows whose removal both vacates every edge and empties a root cell.
///
/// The extreme-attaining rows alone move the extent, and they move the root count only when they
/// are some cell's whole population: a cell keeping one visible row keeps a representative, and
/// the root cut delivers one row per occupied cell, so the count does not move at all. Whether any
/// cell holds nothing but extreme rows is a property of the fitted layout rather than of the
/// witness, and a layout is target-specific down to the last bit of each coordinate, so a witness
/// resting on that coincidence has teeth on one target and none on the next.
///
/// Adding the rest of one extreme-bearing cell empties that cell whatever the layout, which takes
/// the occupied-cell count down by at least one and the delivered count with it. An aggregate read
/// off the artifacts instead of off the view is then a detectable answer on the count axis as well
/// as on the extent axis, and the construction asserts that outcome rather than trusting it.
pub(crate) fn extremes_vacating_a_root_cell(
    atlas: &Atlas,
    points: &[Vec2],
    row_ids: &[u32],
) -> (Bounds2, Vec<u32>) {
    let (corpus, attaining) = extremes(points, row_ids);

    // The root's cut, which is the depth whose cells the root tile delivers one row apiece from.
    let cut = Depth::new(FIXTURE_LOD.span.get()).expect("the fixture span is a valid depth");
    let cell_of = |position: usize| {
        atlas
            .morton
            .code(BasePosition::from_u32(
                u32::try_from(position).expect("fixture positions fit u32"),
            ))
            .prefix(cut)
    };

    let hidden: HashSet<u32> = attaining.iter().copied().collect();
    let mut population: HashMap<u64, Vec<usize>> = HashMap::new();
    for position in 0..points.len() {
        population
            .entry(cell_of(position))
            .or_default()
            .push(position);
    }
    assert!(
        population.len() > 1,
        "the fixture occupies one root cell, so no mask can vacate one and leave a view"
    );

    // Vacating the cell that keeps the fewest visible rows costs the view the least; the cell key
    // breaks ties, so the choice does not ride a map's iteration order.
    let survivors = |positions: &[usize]| {
        positions
            .iter()
            .filter(|&&position| !hidden.contains(&row_ids[position]))
            .count()
    };
    let (_, vacated) = population
        .iter()
        .filter(|(_, positions)| positions.iter().any(|&at| hidden.contains(&row_ids[at])))
        .map(|(&cell, positions)| ((survivors(positions), cell), positions))
        .min_by_key(|&(order, _)| order)
        .expect("the extremes occupy a cell");

    let mut hiding = attaining;
    hiding.extend(vacated.iter().map(|&position| row_ids[position]));
    hiding.sort_unstable();
    hiding.dedup();

    // What the count witness rests on, checked here rather than left to the next layout to decide.
    let remaining = population
        .values()
        .filter(|positions| {
            positions
                .iter()
                .any(|&position| !hiding.contains(&row_ids[position]))
        })
        .count();
    assert!(
        remaining < population.len(),
        "the hidden set empties no root cell, so the count witness would have no teeth"
    );
    assert!(remaining > 0, "the hidden set empties every root cell");

    (corpus, hiding)
}

/// Every operator head accounts for exactly the rows its response delivered.
///
/// The wire law is `sum(runs) == delivered` in every response. A client paints from `runs`, reading
/// bucket `b0 + i` at column offset `sum(runs[..i])`, so a head that overcounts moves every later
/// bucket's points. The producer asserts the identity when it encodes. This reads the same law back
/// off the bytes, over the corpus schedule rather than a scope cascade.
///
/// The scoped side of the sweep lives in `schedule.rs`, and both reach it through [`head_counts`].
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn operator_head_accounting() {
    let (generation, atlas) = publish("operator-head").await;
    let Artifacts { quad, .. } = open_artifacts(&generation);

    let root_cell = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");
    let mut nodes = Vec::new();
    walk(&quad, 0, root_cell, &mut nodes);
    assert!(nodes.len() > 1, "the fixture quadtree subdivides");

    for mode in [Mode::Delta, Mode::Total] {
        for &(_node, cell) in &nodes {
            let TileCoordinate { z, x, y } = coordinate_of(cell);
            let bytes = atlas
                .tile(
                    &request(z, x, y, mode),
                    TileLimits::default(),
                    Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
                )
                .expect("the operator tile serves");
            let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));

            assert_head_delivers(&bytes, rows.len() as u64);
        }
    }
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn serves_published_tiles() {
    let (generation, atlas) = publish("serves").await;
    assert_eq!(atlas.generation(), generation.id());

    let Artifacts {
        morton,
        quad,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    // The root delta delivers buckets 0..=m: the head of the base
    // order, sized by the fencepost lengths.
    let bytes = atlas
        .tile(
            &request(0, 0, 0, Mode::Delta),
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
        )
        .expect("the root tile should serve");
    assert_eq!(&bytes[..8], b"SALTILET");

    let delivered: u64 = morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    assert!(delivered > 0, "the fixture root delivers points");

    let head = usize::try_from(delivered).expect("fixture counts fit usize");
    let positions_section = section(&bytes, POSITIONS).expect("POSITIONS is present");
    let rows_section = section(&bytes, ROW_IDS).expect("ROW_IDS is present");
    assert_eq!(positions_section.len() as u64, delivered * 8);
    assert_eq!(rows_section.len() as u64, delivered * 4);
    assert!(
        section(&bytes, TYPE_MASK).is_none(),
        "TYPE_MASK is absent without colouring",
    );
    assert!(section(&bytes, MASS).is_none(), "MASS is reserved-absent");

    // The wire column carries the codec's ids: encode the head of
    // the base order through the independent derivation.
    let node_codec = test_codec(&atlas);
    let expected_rows: Vec<u8> = row_ids[..head]
        .iter()
        .flat_map(|&row| {
            node_codec
                .encode(NodeRowId::from_u32(row), atlas.node_universe())
                .get()
                .to_le_bytes()
        })
        .collect();
    assert_eq!(rows_section, expected_rows);
    let expected_positions: Vec<u8> = points[..head]
        .iter()
        .flat_map(|point| {
            let [x, y] = [point.x().to_le_bytes(), point.y().to_le_bytes()];
            x.into_iter().chain(y)
        })
        .collect();
    assert_eq!(positions_section, expected_positions);

    // The root's total delivery equals its delta delivery.
    let total = atlas
        .tile(
            &request(0, 0, 0, Mode::Total),
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
        )
        .expect("the root total should serve");
    assert_eq!(
        section(&total, POSITIONS).expect("POSITIONS is present"),
        positions_section,
    );
    assert_eq!(
        section(&total, ROW_IDS).expect("ROW_IDS is present"),
        rows_section,
    );

    // Delta tiles partition the base order: walking every quad node
    // delivers each row exactly once.
    let root_cell = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");
    let mut nodes = Vec::new();
    walk(&quad, 0, root_cell, &mut nodes);
    assert!(nodes.len() > 1, "the fixture quadtree subdivides");

    let mut delivered_rows = decode_rows(rows_section);
    for &(node, cell) in &nodes[1..] {
        let coordinate = coordinate_of(cell);
        let bytes = atlas
            .tile(
                &TileRequest {
                    coordinate,
                    query: TileQuery::default(),
                },
                TileLimits::default(),
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            )
            .expect("every node tile should serve");
        let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));

        let run = quad.nodes()[node as usize].run();
        assert_eq!(tile_rows.len() as u64, run.end - run.start);
        delivered_rows.extend(tile_rows);
    }

    let mut expected: Vec<u32> = row_ids
        .iter()
        .map(|&row| {
            node_codec
                .encode(NodeRowId::from_u32(row), atlas.node_universe())
                .get()
        })
        .collect();
    expected.sort_unstable();
    delivered_rows.sort_unstable();
    assert_eq!(delivered_rows, expected, "each row arrives exactly once");
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn serves_empty_and_deepest_cells() {
    let (generation, atlas) = publish("cells").await;
    let Artifacts {
        morton,
        quad,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let _row_ids = rows
        .u64_le_elements()
        .expect("the row column is little-endian u64 rows");

    // A valid coordinate with no quad node serves the honest empty
    // tile, byte for byte.
    let empty_cell = (1..=FIXTURE_LOD.max_tile_depth)
        .flat_map(|z| {
            let cells = 1_u32 << z;
            (0..cells).flat_map(move |x| {
                (0..cells).map(move |y| {
                    MortonCell::new(Depth::new(z).expect("fixture depths are valid"), x, y)
                        .expect("the coordinates lie on the grid")
                })
            })
        })
        .find(|&cell| quad.locate(cell).is_none())
        .expect("the fixture grid has empty cells");

    let coordinate = coordinate_of(empty_cell);
    let expected = TileResponse {
        head: TileHead {
            generation: generation.id().digest(),
            variant: 0,
            coordinate,
            mode: Mode::Delta,
            first_bucket: coordinate.z + FIXTURE_LOD.span.get(),
            runs: &[0],
            global: None,
            children: 0,
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&[]),
        arrivals: IdSlice::from_raw(&[]),
        masks: None,
        trailer: None,
    }
    .encode();
    assert_eq!(
        atlas
            .tile(
                &TileRequest {
                    coordinate,
                    query: TileQuery::default(),
                },
                TileLimits::default(),
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            )
            .expect("the empty tile should serve"),
        expected,
    );

    // At the deepest zoom a total tile delivers its cell's whole
    // population: the cut reaches the catch-all bucket.
    let deep_cell = MortonKey::from_bits(morton.codes()[BasePosition::from_u32(0)].get())
        .cell(Depth::new(FIXTURE_LOD.max_tile_depth).expect("the deepest tile depth is valid"));
    let bytes = atlas
        .tile(
            &TileRequest {
                coordinate: coordinate_of(deep_cell),
                query: TileQuery {
                    mode: Mode::Total,
                    ..TileQuery::default()
                },
            },
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
        )
        .expect("the deepest total tile should serve");
    let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
    assert_eq!(tile_rows.len() as u64, population(&morton, deep_cell));
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn tile_contract_rejections() {
    let (_generation, atlas) = publish("rejects").await;

    assert_eq!(
        atlas.tile(
            &request(4, 0, 0, Mode::Delta),
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas)
        ),
        Err(TileError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.tile(
            &request(2, 4, 0, Mode::Delta),
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas)
        ),
        Err(TileError::Grid { z: 2, x: 4, y: 0 }),
    );

    let mut colored = request(0, 0, 0, Mode::Delta);
    colored.query.colored_type_ids = vec![
        "https://example.com/types/thing/v/1"
            .parse()
            .expect("the literal is a versioned url");
        TileLimits::default().colored_type_ids as usize + 1
    ];
    assert_eq!(
        atlas.tile(
            &colored,
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas)
        ),
        Err(TileError::Types {
            count: TileLimits::default().colored_type_ids as usize + 1,
            maximum: TileLimits::default().colored_type_ids,
        }),
    );

    // Bucket 3 first enters at zoom 3 - span(1) - k(0) = 2, inside the grid's bound of 3.
    let manifest = serde_json::to_value(atlas.manifest(
        ServeLimits::default().manifest_limits(VisibilityLimits::default()),
        CutOffset::ZERO,
        3,
    ))
    .expect("the manifest serializes");
    assert_eq!(
        manifest,
        serde_json::json!({
            "generation": atlas.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": { "span": 2, "cut": "z+1", "maxZoom": 3 },
            "scopeSchedule": { "k": 0, "cut": "z+1", "maxZoom": 2 },
            "limits": { "coloredTypeIds": 32, "edgesTiles": 256, "locateEdges": 512, "locateProperties": 10, "locateLinkProperties": 10, "locateLinkTypeIds": 5, "translateEntityIds": 1024, "authoritySoftSeconds": 480, "authorityHardSeconds": 600 },
            // No createdAt: the fixture dataset has no temporal axes.
        }),
    );

    // The cut rule's three edges, each one field read: an offset deepens the subtrahend, the
    // grid clamps a catch-all-deep bucket, and an empty view saturates at the root.
    let limits = ServeLimits::default().manifest_limits(VisibilityLimits::default());
    let offset = serde_json::to_value(atlas.manifest(limits, CutOffset::new(1), 3))
        .expect("the manifest serializes");
    assert_eq!(offset["scopeSchedule"]["maxZoom"], 1, "3 - 1 - 1");
    let clamped = serde_json::to_value(atlas.manifest(limits, CutOffset::ZERO, 9))
        .expect("the manifest serializes");
    assert_eq!(clamped["scopeSchedule"]["maxZoom"], 3, "min(9 - 1, 3)");
    let empty = serde_json::to_value(atlas.manifest(limits, CutOffset::ZERO, 0))
        .expect("the manifest serializes");
    assert_eq!(
        empty["scopeSchedule"]["maxZoom"], 0,
        "an empty view saturates"
    );
}

#[test]
fn tile_query_delta_default() {
    let query: TileQuery = serde_json::from_str("{}").expect("the empty body parses");
    assert_eq!(query.mode, Mode::Delta);
    assert!(query.colored_type_ids.is_empty());
    assert_eq!(query.detail, TileDetail::Minimal);

    let query: TileQuery = serde_json::from_str(
        r#"{
            "mode": "total",
            "coloredTypeIds": ["https://example.com/types/thing/v/1"],
            "detail": "auxiliary"
        }"#,
    )
    .expect("the full body parses");
    assert_eq!(query.mode, Mode::Total);
    assert_eq!(query.colored_type_ids.len(), 1);
    assert_eq!(query.detail, TileDetail::Auxiliary);
}

#[test]
fn atlas_shared_across_requests() {
    const fn shared<T: Send + Sync>() {}
    shared::<Atlas>();
}

#[test]
fn open_rejects_unpublished() {
    let root = GenerationRoot::new(scratch("unpublished")).expect("the root should open");
    let id: GenerationId = "0000000000000000000000000000000000000000000000000000000000000000"
        .parse()
        .expect("the zero digest parses");
    assert_matches!(
        Atlas::open(&root, id, test_open_options()),
        Err(OpenAtlasError::Unpublished(unpublished)) if unpublished == id,
    );
}

/// The edge-side serving artifacts of one generation, independently opened.
struct EdgeArtifacts {
    endpoints: ArrayFile,
    ranks: ArrayFile,
    positions: ArrayFile,
}

fn open_edge_artifacts(generation: &Generation) -> EdgeArtifacts {
    let files = &generation.repository().files;
    EdgeArtifacts {
        endpoints: ArrayFile::open(generation.path_of(&files.edge_endpoints.name()))
            .expect("the endpoint artifact should open"),
        ranks: ArrayFile::open(generation.path_of(&files.rank_of_position.name()))
            .expect("the rank artifact should open"),
        positions: ArrayFile::open(generation.path_of(&files.position_of_row.name()))
            .expect("the position artifact should open"),
    }
}

/// Every tile coordinate of the deepest zoom.
///
/// The cut reaches the catch-all bucket, so the grid delivers the whole corpus.
fn full_grid() -> Vec<TileCoordinate> {
    let cells = 1_u32 << FIXTURE_LOD.max_tile_depth;
    (0..cells)
        .flat_map(|x| {
            (0..cells).map(move |y| TileCoordinate {
                z: FIXTURE_LOD.max_tile_depth,
                x,
                y,
            })
        })
        .collect()
}

fn edges_request(tiles: Vec<TileCoordinate>) -> EdgesRequest {
    EdgesRequest {
        tiles,
        detail: EdgesDetail::Minimal,
    }
}

/// A store capability the request under test must drop unused.
///
/// A rejection never reaches hydration and a minimal request orders none. Dropping the capability
/// is therefore part of the contract under test, and consuming it panics.
struct UntouchedStore;

impl LocateStore for UntouchedStore {
    #[expect(
        clippy::panic_in_result_fn,
        reason = "consuming the capability is the failure under test, and the panic is its witness"
    )]
    fn hydrate(self, _: LocateOrder<'_>) -> Result<LocateHydration, DetailError> {
        panic!("the request under test must not hydrate")
    }
}

impl EdgesStore for UntouchedStore {
    #[expect(
        clippy::panic_in_result_fn,
        reason = "consuming the capability is the failure under test, and the panic is its witness"
    )]
    fn hydrate(
        self,
        _: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, DetailError> {
        panic!("the request under test must not hydrate")
    }
}

/// A store answering that nothing resolves.
///
/// Every store-derived column reads empty and every completeness flag `false`, so an expectation
/// built over it pins the envelope and the in-process columns without store-derived content.
struct UnresolvedStore;

impl LocateStore for UnresolvedStore {
    fn hydrate(self, order: LocateOrder<'_>) -> Result<LocateHydration, DetailError> {
        Ok(LocateHydration {
            nodes: LocateNodeHydration::empty(order.nodes.count()),
            links: LocateLinkHydration::empty(order.links.len()),
        })
    }
}

impl EdgesStore for UnresolvedStore {
    fn hydrate(
        self,
        types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
    ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, DetailError> {
        Ok(IdVec::from_elem(None, types.len()))
    }
}

/// Derives the qualifying edge columns for a delivered row set.
///
/// Both-endpoint edges in ascending edge-row order.
fn qualifying_columns(
    endpoints: &[[u64; 2]],
    delivered: &HashSet<u32>,
) -> (Vec<u32>, Vec<u32>, Vec<u32>) {
    let mut sources = Vec::new();
    let mut targets = Vec::new();
    let mut rows = Vec::new();
    for (row, &[source, target]) in endpoints.iter().enumerate() {
        let source = u32::try_from(source).expect("fixture rows fit u32");
        let target = u32::try_from(target).expect("fixture rows fit u32");
        if delivered.contains(&source) && delivered.contains(&target) {
            sources.push(source);
            targets.push(target);
            rows.push(u32::try_from(row).expect("fixture edge rows fit u32"));
        }
    }

    (sources, targets, rows)
}

/// Maps a derivation's internal edge columns onto the wire's.
///
/// Node ids encoded through an independently derived codec; edge identities from the fixture's
/// seeding rule. Delivery order ascends by identity bytes, which for the fixture is ascending
/// internal edge row - the input order `qualifying_columns` already produces.
fn wire_columns(atlas: &Atlas, sources: &[u32], targets: &[u32], rows: &[u32]) -> EdgeColumns {
    let node_codec = test_codec(atlas);
    assert!(rows.is_sorted(), "the derivation supplies ascending rows");

    EdgeColumns::pinned(
        sources
            .iter()
            .zip(targets)
            .zip(rows)
            .map(|((&source, &target), &row)| {
                (
                    node_codec
                        .encode(NodeRowId::from_u32(source), atlas.node_universe())
                        .get(),
                    node_codec
                        .encode(NodeRowId::from_u32(target), atlas.node_universe())
                        .get(),
                    edge_identity_of(row),
                )
            }),
    )
}

fn expected_edges_bytes(generation: &Generation, complete: bool, edges: &EdgeColumns) -> Vec<u8> {
    EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete,
        edges,
        trailer: None,
    }
    .encode()
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_full_coverage() {
    let (generation, atlas) = publish("edges-full").await;
    let artifacts = open_edge_artifacts(&generation);
    let endpoints = artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let endpoints = endpoints.as_slice();

    // The endpoint artifact follows the dataset stream order, which
    // the derivations below lean on.
    assert_eq!(endpoints.len(), FIXTURE_EDGES.len());
    for (&(_, source, target), &actual) in FIXTURE_EDGES.iter().zip(endpoints) {
        assert_eq!([source, target], actual);
    }

    let request = edges_request(full_grid());
    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the full grid should serve");
    assert_eq!(&bytes[..8], b"SALTILEE");

    let delivered: HashSet<u32> =
        (0..u32::try_from(NODES).expect("the fixture count fits u32")).collect();
    let (sources, targets, rows) = qualifying_columns(endpoints, &delivered);
    assert_eq!(
        rows.len(),
        FIXTURE_EDGES.len(),
        "every fixture edge qualifies"
    );
    let columns = wire_columns(&atlas, &sources, &targets, &rows);
    assert_eq!(bytes, expected_edges_bytes(&generation, true, &columns));

    // Identical requests yield identical bytes.
    assert_eq!(
        atlas
            .edges(
                &request,
                EdgesLimits::default(),
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
                UntouchedStore,
            )
            .expect("the repeat should serve"),
        bytes,
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_root_visible_subgraph() {
    let (generation, atlas) = publish("edges-root").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&artifacts.rows);
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let endpoints = endpoints.as_slice();

    // The root delivers buckets 0..=m: the head of the base order.
    let head: u64 = artifacts.morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();

    let (sources, targets, edge_rows) = qualifying_columns(endpoints, &delivered);
    let columns = wire_columns(&atlas, &sources, &targets, &edge_rows);
    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let bytes = atlas
        .edges(
            &edges_request(vec![root]),
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the root should serve");
    assert_eq!(bytes, expected_edges_bytes(&generation, true, &columns));

    // Listing a tile twice changes nothing: the delivered union
    // deduplicates before the outgoing walk.
    let doubled = atlas
        .edges(
            &edges_request(vec![root, root]),
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the doubled root should serve");
    assert_eq!(doubled, bytes);
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_exclude_partially_delivered_pairs() {
    let (generation, atlas) = publish("edges-cross").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&artifacts.rows);
    let codes = artifacts.morton.codes();
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let endpoints = endpoints.as_slice();
    let positions: Vec<u32> = edge_artifacts
        .positions
        .u32_le_elements()
        .expect("the position permutation is little-endian u32")
        .iter()
        .map(|position| position.get())
        .collect();

    let depth = Depth::new(FIXTURE_LOD.max_tile_depth).expect("the deepest tile depth is valid");
    let cell_of_row = |row: u64| {
        let position = positions[usize::try_from(row).expect("fixture rows fit usize")];
        MortonKey::from_bits(codes[BasePosition::from_u32(position)].get()).cell(depth)
    };

    // An edge whose endpoints occupy different deepest-zoom cells:
    // its source tile alone delivers the source but not the target.
    let (crossing, &[source, _]) = endpoints
        .iter()
        .enumerate()
        .find(|&(_, &[source, target])| cell_of_row(source) != cell_of_row(target))
        .expect("the fixture spreads endpoints across deepest cells");
    let crossing = u32::try_from(crossing).expect("fixture edge rows fit u32");

    let cell = cell_of_row(source);
    let bytes = atlas
        .edges(
            &edges_request(vec![coordinate_of(cell)]),
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the source tile should serve");

    // A deepest tile delivers exactly its cell's population.
    let delivered: HashSet<u32> = codes
        .iter()
        .enumerate()
        .filter(|&(_, code)| cell.contains(MortonKey::from_bits(code.get())))
        .map(|(position, _)| row_ids[position])
        .collect();
    let (sources, targets, edge_rows) = qualifying_columns(endpoints, &delivered);
    assert!(
        !edge_rows.contains(&crossing),
        "the crossing edge is excluded from the derivation",
    );
    let columns = wire_columns(&atlas, &sources, &targets, &edge_rows);
    assert_eq!(bytes, expected_edges_bytes(&generation, true, &columns));
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_cap_truncates_by_worse_endpoint_rank() {
    let (generation, atlas) = publish("edges-cap").await;
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let endpoints = endpoints.as_slice();
    let ranks: Vec<u32> = edge_artifacts
        .ranks
        .u32_le_elements()
        .expect("the rank column is little-endian u32")
        .iter()
        .map(|rank| rank.get())
        .collect();
    let positions: Vec<u32> = edge_artifacts
        .positions
        .u32_le_elements()
        .expect("the position permutation is little-endian u32")
        .iter()
        .map(|position| position.get())
        .collect();
    let rank_of_row =
        |row: u64| ranks[positions[usize::try_from(row).expect("fixture rows fit usize")] as usize];

    // Under full coverage every edge qualifies; the cap keeps the
    // two whose worse endpoint ranks best - ties on identity bytes,
    // which for the fixture ascend with the edge row - emitted in
    // ascending identity order.
    let mut ranked: Vec<(u32, crate::postgres::id::ArchivedEntityId, u32)> = endpoints
        .iter()
        .enumerate()
        .map(|(row, &[source, target])| {
            let row = u32::try_from(row).expect("fixture edge rows fit u32");
            (
                rank_of_row(source).max(rank_of_row(target)),
                edge_identity_of(row),
                row,
            )
        })
        .collect();
    ranked.sort_unstable();
    ranked.truncate(2);
    let mut kept: Vec<u32> = ranked.into_iter().map(|(.., row)| row).collect();
    kept.sort_unstable();
    let sources: Vec<u32> = kept
        .iter()
        .map(|&row| u32::try_from(endpoints[row as usize][0]).expect("fixture rows fit u32"))
        .collect();
    let targets: Vec<u32> = kept
        .iter()
        .map(|&row| u32::try_from(endpoints[row as usize][1]).expect("fixture rows fit u32"))
        .collect();
    let columns = wire_columns(&atlas, &sources, &targets, &kept);

    let capped = EdgesLimits {
        edges: 2,
        ..EdgesLimits::default()
    };
    let bytes = atlas
        .edges(
            &edges_request(full_grid()),
            capped,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the capped request should serve");
    assert_eq!(bytes, expected_edges_bytes(&generation, false, &columns));

    // A zero cap serves the honest empty truncation.
    let empty = atlas
        .edges(
            &edges_request(full_grid()),
            EdgesLimits {
                edges: 0,
                ..EdgesLimits::default()
            },
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the zero cap should serve");
    assert_eq!(
        empty,
        expected_edges_bytes(&generation, false, &EdgeColumns::pinned([]))
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_contract_rejections() {
    let (generation, atlas) = publish("edges-rejects").await;
    let root = TileCoordinate { z: 0, x: 0, y: 0 };

    assert_matches!(
        atlas.edges(
            &edges_request(vec![root, root]),
            EdgesLimits {
                tiles: 1,
                ..EdgesLimits::default()
            },
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        ),
        Err(EdgesError::Tiles {
            count: 2,
            maximum: 1,
        }),
    );
    assert_matches!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 4, x: 0, y: 0 }]),
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        ),
        Err(EdgesError::Depth { z: 4, maximum: 3 }),
    );
    assert_matches!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 2, x: 4, y: 0 }]),
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        ),
        Err(EdgesError::Grid { z: 2, x: 4, y: 0 }),
    );

    // An empty tile list serves the honest empty response, with every
    // column present-empty.
    let bytes = atlas
        .edges(
            &edges_request(Vec::new()),
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore,
        )
        .expect("the empty request should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &EdgeColumns::pinned([]))
    );
    assert!(
        section(&bytes, EDGE_IDS)
            .expect("EDGE_IDS is present")
            .is_empty(),
    );
}

/// A detail request hydrates through its store capability and encodes the interned trailer.
///
/// The one-call path answers byte-exactly against the directly built wire document. Labels
/// resolve in process from the generation's payloads - empty under the fixture, whose identity
/// rewrite persists empty payloads - and the store capability answers the type column, all-`null`
/// here (G6 pins the non-null trailer bytes).
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn detailed_edges_trailer() {
    use crate::salt::wire::edges::EdgesTrailer;

    let (generation, atlas) = publish("detailed-edges").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&artifacts.rows);
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let endpoints = endpoints.as_slice();

    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let mut request = edges_request(vec![root]);
    request.detail = EdgesDetail::Auxiliary;

    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UnresolvedStore,
        )
        .expect("the detail request should serve");

    let head: u64 = artifacts.morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();
    let (sources, targets, internal_edges) = qualifying_columns(endpoints, &delivered);
    let columns = wire_columns(&atlas, &sources, &targets, &internal_edges);

    let no_labels: Vec<&Label> = vec![Label::EMPTY; columns.count()];
    let no_types: Vec<Option<super::TableIndex<VersionedUrl>>> = vec![None; columns.count()];
    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        edges: &columns,
        trailer: Some(EdgesTrailer {
            type_table: IdSlice::from_raw(&[]),
            link_labels: IdSlice::from_raw(&no_labels),
            link_type_ids: IdSlice::from_raw(&no_types),
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the trailer rides the pinned envelope");
}

/// Derives the type-resolution expectations from the published artifacts alone.
///
/// Each delivered edge's legend payload names its representative ontology row, the rewritten
/// ontology table pins that row's uuid to a fixture URL, and the returned resolution map answers
/// a synthetic URL per uuid. Returns that map, the per-edge expected URLs, and the distinct
/// uuids in first-occurrence order over the delivered edges.
fn type_expectations(
    generation: &Generation,
    internal_edges: &[u32],
) -> (
    hashql_core::collections::FastHashMap<
        crate::postgres::id::ArchivedOntologyTypeUuid,
        VersionedUrl,
    >,
    Vec<Option<VersionedUrl>>,
    Vec<crate::postgres::id::ArchivedOntologyTypeUuid>,
) {
    use crate::postgres::id::ArchivedOntologyTypeUuid;

    let files = &generation.repository().files;
    let ontology_rows = payloads_of(&generation.path_of(&files.ontology_identities.name())).len();
    let uuid_of = |row: usize| {
        let url: VersionedUrl = fixture_type_url(row as u64)
            .parse()
            .expect("the fixture URL parses");
        ArchivedOntologyTypeUuid::from_url(&url)
    };
    let resolved_of = |row: usize| -> VersionedUrl {
        format!("https://example.com/types/resolved-{row}/v/1")
            .parse()
            .expect("the synthetic URL parses")
    };
    let urls = (0..ontology_rows)
        .map(|row| (uuid_of(row), resolved_of(row)))
        .collect();

    let edge_payloads = payloads_of(&generation.path_of(&files.edge_identities.name()));
    let representative_of = |edge: u32| {
        let payload = &edge_payloads[usize::try_from(edge).expect("fixture rows fit usize")];
        let representative = u64::from_le_bytes(
            payload[..8]
                .try_into()
                .expect("a legend leads with its representative"),
        );
        usize::try_from(representative).expect("fixture rows fit usize")
    };
    let expected_urls = internal_edges
        .iter()
        .map(|&edge| {
            let representative = representative_of(edge);
            (representative < ontology_rows).then(|| resolved_of(representative))
        })
        .collect();
    let expected_asked = {
        let mut seen: Vec<ArchivedOntologyTypeUuid> = Vec::new();
        for &edge in internal_edges {
            let uuid = uuid_of(representative_of(edge));
            if !seen.contains(&uuid) {
                seen.push(uuid);
            }
        }
        seen
    };

    (urls, expected_urls, expected_asked)
}

/// The trailer's type column resolves each edge's legend representative through the store.
///
/// Expected values derive from the published artifacts alone, through [`type_expectations`].
/// The store receives the distinct uuids in first-occurrence order over the delivered edges,
/// which is the deduplication this path exists to buy.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn detailed_edges_types() {
    use alloc::rc::Rc;
    use core::cell::RefCell;

    use hashql_core::collections::FastHashMap;

    use crate::{postgres::id::ArchivedOntologyTypeUuid, salt::wire::edges::EdgesTrailer};

    /// Answers `urls` per known uuid and records every uuid set that reaches it.
    struct RecordingTypeStore {
        urls: FastHashMap<ArchivedOntologyTypeUuid, VersionedUrl>,
        asked: Rc<RefCell<Vec<ArchivedOntologyTypeUuid>>>,
    }

    impl EdgesStore for RecordingTypeStore {
        fn hydrate(
            self,
            types: &IdSlice<TypeSlot, ArchivedOntologyTypeUuid>,
        ) -> Result<IdVec<TypeSlot, Option<VersionedUrl>>, DetailError> {
            self.asked.borrow_mut().extend(types.iter().copied());

            Ok(types
                .iter()
                .map(|uuid| self.urls.get(uuid).cloned())
                .collect())
        }
    }

    let (generation, atlas) = publish("edge-type-resolution").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = fixture_row_ids(&artifacts.rows);
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs");
    let endpoints: Vec<[u64; 2]> = endpoints
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();

    // The delivered edge set, exactly as the pinned-envelope test derives it.
    let head: u64 = artifacts.morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();
    let (sources, targets, internal_edges) = qualifying_columns(&endpoints, &delivered);
    let columns = wire_columns(&atlas, &sources, &targets, &internal_edges);

    let (urls, expected_urls, expected_asked) = type_expectations(&generation, &internal_edges);

    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let mut request = edges_request(vec![root]);
    request.detail = EdgesDetail::Auxiliary;

    let asked = Rc::new(RefCell::new(Vec::new()));
    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            RecordingTypeStore {
                urls,
                asked: Rc::clone(&asked),
            },
        )
        .expect("the detail request should serve");

    assert_eq!(
        *asked.borrow(),
        expected_asked,
        "the order carries the distinct uuids in first-occurrence order"
    );

    let table = super::intern::Table::new(expected_urls.iter().flatten());
    let link_type_ids: Vec<Option<super::TableIndex<VersionedUrl>>> = expected_urls
        .iter()
        .map(|url| url.as_ref().map(|url| table.index_of(url)))
        .collect();
    let no_labels: Vec<&Label> = vec![Label::EMPTY; columns.count()];
    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        edges: &columns,
        trailer: Some(EdgesTrailer {
            type_table: table.entries(),
            link_labels: IdSlice::from_raw(&no_labels),
            link_type_ids: IdSlice::from_raw(&link_type_ids),
        }),
    }
    .encode();
    assert_eq!(
        bytes, expected,
        "each edge's type id points at its representative's resolved URL"
    );
}

/// Source resolution answers the delivery contract rather than a formula alone.
///
/// The resolved (zoom, cell) tile delivers the row under the cumulative schedule, and at zoom > 0
/// the parent tile's schedule does not. `zoom` is therefore the first visible zoom.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_first_visible_tile() {
    let (_generation, atlas) = publish("locate-resolve").await;
    let node_codec = test_codec(&atlas);
    let wire_of = |row: u32| {
        node_codec
            .encode(NodeRowId::from_u32(row), atlas.node_universe())
            .get()
    };
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);

    let row_of = |bytes: &[u8]| {
        let rows = section(bytes, ROW_IDS).expect("ROW_IDS is present");
        rows.as_chunks::<4>()
            .0
            .iter()
            .map(|&chunk| u32::from_le_bytes(chunk))
            .collect::<Vec<u32>>()
    };

    let mut resolved = 0;
    for row in 0..4_u8 {
        let Some(source) = atlas.resolve_source(&view, &entity_string_of(row)) else {
            panic!("fixture node ids resolve");
        };
        let SourceSubject::Base {
            row: source_row,
            position: source_position,
        } = source.subject
        else {
            panic!("a fitted fixture source resolves in the base domain");
        };
        assert_eq!(source_row.get(), NodeRowId::from_u32(u32::from(row)));
        assert_eq!(source_position, atlas.positions_of_row()[source_row.get()]);

        // The resolved tile delivers the row.
        let request = TileRequest {
            coordinate: source.cell,
            query: TileQuery {
                mode: Mode::Total,
                ..TileQuery::default()
            },
        };
        let bytes = atlas
            .tile(
                &request,
                TileLimits::default(),
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            )
            .expect("the resolved tile serves");
        assert!(
            row_of(&bytes).contains(&wire_of(source_row.get().as_u32())),
            "the resolved tile delivers its source",
        );

        // The parent's cumulative schedule does not: zoom is first.
        if source.zoom > 0 {
            let parent = TileRequest {
                coordinate: TileCoordinate {
                    z: source.zoom - 1,
                    // The parent tile halves each grid index: one
                    // right-shift, the quadtree's own arithmetic.
                    x: source.cell.x >> 1_u32,
                    y: source.cell.y >> 1_u32,
                },
                query: TileQuery {
                    mode: Mode::Total,
                    ..TileQuery::default()
                },
            };
            let bytes = atlas
                .tile(
                    &parent,
                    TileLimits::default(),
                    Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
                )
                .expect("the parent tile serves");
            assert!(
                !row_of(&bytes).contains(&wire_of(source_row.get().as_u32())),
                "the parent zoom does not deliver the source yet",
            );
            resolved += 1;
        }
    }
    // The fixture spreads buckets, so at least one probed row sits
    // below the root cut and exercises the parent assertion.
    assert!(resolved > 0, "at least one source resolves below zoom 0");

    // Non-node shapes read absent: an edge id, an unknown id, junk.
    assert_eq!(
        atlas.resolve_source(&view, &entity_string_of(EDGE_SEED)),
        None
    );
    assert_eq!(
        atlas.resolve_source(
            &view,
            &format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil())
        ),
        None,
    );
    assert_eq!(atlas.resolve_source(&view, "not an id"), None);
}

/// The locate delivered set answers the wire pin over hand-derived fixture ego-graphs.
///
/// Source first, then the delivered edges' partners ascending wire row id; edges are the source's
/// incident set - both directions, a self-loop exactly once - ascending link-entity identity
/// bytes (for the fixture, ascending edge row).
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_ego_graph() {
    use super::locate::LocateLimits;

    let (_generation, atlas) = publish("locate-ego").await;
    let node_codec = test_codec(&atlas);
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);

    // The fixture edge list by row: 0 = (0 → 1), 1 = (1 → 2),
    // 2 = (2 → 2) self-loop, 3 = (5 → 40), 4 = (40 → 5),
    // 5 = (3 → 7). Hand-derived ego-graphs, (source, partners,
    // edge rows):
    //   ego(0) = partner 1 over edge 0;
    //   ego(1) = partners {0, 2} over edges {0, 1};
    //   ego(2) = partner 1 over edges {1, 2} - the self-loop
    //            delivers exactly once and adds no partner;
    //   ego(4) = alone, zero edges - the honest-empty case;
    //   ego(5) = partner 40 over edges {3, 4} - the reciprocal
    //            pair shares one partner, delivered once.
    let cases: [(u8, &[u32], &[u32]); 5] = [
        (0, &[1], &[0]),
        (1, &[0, 2], &[0, 1]),
        (2, &[1], &[1, 2]),
        (4, &[], &[]),
        (5, &[40], &[3, 4]),
    ];

    for (source_row, partners, edge_rows) in cases {
        let source = atlas
            .resolve_source(&view, &entity_string_of(source_row))
            .expect("fixture node ids resolve");
        let subgraph = atlas.locate_subgraph(source, LocateLimits::default(), &view);
        assert!(subgraph.complete, "ego({source_row}) is under the cap");

        // Partners deliver ascending by wire row id; the expectation
        // recomputes the order through an independently constructed
        // codec.
        let mut expected_rows: Vec<u32> = partners.to_vec();
        expected_rows.sort_unstable_by_key(|&row| {
            node_codec
                .encode(NodeRowId::from_u32(row), atlas.node_universe())
                .get()
        });
        expected_rows.insert(0, u32::from(source_row));
        let delivered_rows: Vec<u32> = delivered_row_ids(&atlas, &subgraph)
            .iter()
            .map(|row| row.as_u32())
            .collect();
        assert_eq!(delivered_rows, expected_rows, "ego({source_row}) rows");
        let expected_vessels: Vec<ViewRow> = expected_rows
            .iter()
            .map(|&row| ViewRow::Base(atlas.positions_of_row()[NodeRowId::from_u32(row)]))
            .collect();
        assert_eq!(
            subgraph.delivered.as_raw(),
            expected_vessels,
            "ego({source_row}) positions",
        );

        // Edges deliver ascending by identity bytes - for the
        // fixture, ascending edge row - endpoints straight off the
        // fixture edge list.
        let delivered: Vec<u32> = subgraph
            .edges
            .iter()
            .map(|&(edge, _)| narrow_usize(fitted(edge).row.get().as_usize()))
            .collect();
        assert_eq!(delivered, edge_rows, "ego({source_row}) edges");
        for &(edge, id) in &subgraph.edges {
            let edge = fitted(edge);
            let (_, edge_source, edge_target) = FIXTURE_EDGES[edge.row.get().as_usize()];
            assert_eq!(edge.source.as_u64(), edge_source);
            assert_eq!(edge.target.as_u64(), edge_target);
            assert_eq!(
                id,
                edge_identity_of(narrow_usize(edge.row.get().as_usize()))
            );
        }
    }
}

/// The locate edge cap keeps the nearest partners, and their nodes leave with their edges.
///
/// The selection key is ascending (squared wire-frame distance to the partner, partner
/// first-visible zoom, link-entity identity bytes). Presentation stays ascending identity bytes.
/// Proven by hand on the self-loop - its partner is the source itself at distance zero, so it
/// survives every nonzero cap - and against an independent key derivation swept over every
/// fixture source and cap.
#[expect(
    clippy::too_many_lines,
    reason = "the hand-derived case and the swept key derivation share one publish"
)]
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_cap_nearest_partners() {
    use super::locate::LocateLimits;

    let (_generation, atlas) = publish("locate-truncation").await;
    let node_codec = test_codec(&atlas);
    let accepted = atlas.node_universe();
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);
    let distance_of = |from: u32, to: u32| {
        let positions = atlas.positions();
        let origin = positions[atlas.positions_of_row()[NodeRowId::from_u32(from)]];
        let point = positions[atlas.positions_of_row()[NodeRowId::from_u32(to)]];
        let (dx, dy) = (point.x() - origin.x(), point.y() - origin.y());
        // The derivation must mirror the selection key bit for bit:
        // a fused mul_add rounds differently and reorders near-ties.
        #[expect(
            clippy::suboptimal_flops,
            reason = "unfused arithmetic mirrors the selection key exactly"
        )]
        (dx * dx + dy * dy).to_bits()
    };

    // Row 2 carries the self-loop (edge 2, distance zero) and one
    // link to row 1 (edge 1). The rows occupy distinct wire
    // coordinates, which the case asserts so that the hand derivation
    // cannot degenerate into an unnoticed tie.
    assert_ne!(distance_of(2, 1), 0, "rows 1 and 2 are not co-located");
    let source = atlas
        .resolve_source(&view, &entity_string_of(2))
        .expect("fixture node ids resolve");
    let capped = atlas.locate_subgraph(
        source,
        LocateLimits {
            edges: 1,
            ..LocateLimits::default()
        },
        &view,
    );
    assert!(!capped.complete, "one of two incident edges truncated");
    assert_eq!(
        capped
            .edges
            .iter()
            .map(|&(edge, _)| narrow_usize(fitted(edge).row.get().as_usize()))
            .collect::<Vec<u32>>(),
        [2],
        "the self-loop is the nearest edge",
    );
    // Partner 1's only edge truncated, so partner 1 is not
    // delivered: the source stands alone.
    assert_eq!(delivered_row_ids(&atlas, &capped), [NodeRowId::new(2)]);
    assert_eq!(
        capped.delivered.as_raw(),
        [ViewRow::Base(atlas.positions_of_row()[NodeRowId::new(2)])]
    );

    // The general law, swept: survivors are the cap smallest under
    // the independent key, presented ascending by wire edge id, and
    // the delivered nodes are exactly the survivors' partners.
    for source_row in [0_u8, 1, 2, 3, 4, 5, 7, 40] {
        let source = atlas
            .resolve_source(&view, &entity_string_of(source_row))
            .expect("fixture node ids resolve");
        let full = atlas.locate_subgraph(source, LocateLimits::default(), &view);

        for cap in 0..=full.edges.len() {
            let limits = LocateLimits {
                edges: u32::try_from(cap).expect("fixture edge counts are small"),
                ..LocateLimits::default()
            };
            let subgraph = atlas.locate_subgraph(source, limits, &view);
            assert_eq!(
                subgraph.complete,
                full.edges.len() <= cap,
                "ego({source_row}) cap {cap}",
            );

            // The independent key runs distance bits, then the
            // partner's first visible zoom through the public resolve
            // path (the HEAD fly-to derivation), then the identity
            // bytes.
            let mut expected = full.edges.clone();
            expected.sort_unstable_by_key(|&(edge, id)| {
                let edge = fitted(edge);
                let partner = if edge.source.as_u32() == u32::from(source_row) {
                    edge.target.as_u32()
                } else {
                    edge.source.as_u32()
                };
                let zoom = atlas
                    .resolve_source(
                        &view,
                        &entity_string_of(u8::try_from(partner).expect("fixture rows fit u8")),
                    )
                    .expect("fixture partners resolve")
                    .zoom;
                (distance_of(u32::from(source_row), partner), zoom, id)
            });
            expected.truncate(cap);
            expected.sort_unstable_by_key(|&(_, id)| id);
            assert_eq!(subgraph.edges, expected, "ego({source_row}) cap {cap}");

            let mut partner_keys: Vec<(u32, u32)> = expected
                .iter()
                .flat_map(|&(edge, _)| {
                    let edge = fitted(edge);

                    [edge.source.as_u32(), edge.target.as_u32()]
                })
                .filter(|&row| row != u32::from(source_row))
                .map(|row| {
                    (
                        node_codec.encode(NodeRowId::from_u32(row), accepted).get(),
                        row,
                    )
                })
                .collect();
            partner_keys.sort_unstable();
            partner_keys.dedup();
            let mut expected_rows = vec![u32::from(source_row)];
            expected_rows.extend(partner_keys.iter().map(|&(_, row)| row));
            let delivered_rows: Vec<u32> = delivered_row_ids(&atlas, &subgraph)
                .iter()
                .map(|row| row.as_u32())
                .collect();
            assert_eq!(delivered_rows, expected_rows, "ego({source_row}) cap {cap}");

            // Determinism pair: identical assembly on repeat.
            assert_eq!(
                subgraph,
                atlas.locate_subgraph(source, limits, &view),
                "ego({source_row}) cap {cap}",
            );
        }
    }
}

#[test]
fn edges_body_contract() {
    let request: EdgesRequest =
        serde_json::from_str(r#"{ "tiles": [{ "z": 1, "x": 0, "y": 1 }] }"#)
            .expect("the minimal body parses");
    assert_eq!(request.tiles, vec![TileCoordinate { z: 1, x: 0, y: 1 }]);
    assert_eq!(request.detail, EdgesDetail::Minimal);

    let request: EdgesRequest = serde_json::from_str(
        r#"{
            "tiles": [],
            "detail": "auxiliary"
        }"#,
    )
    .expect("the full body parses");
    assert!(request.tiles.is_empty());
    assert_eq!(request.detail, EdgesDetail::Auxiliary);
}

/// A colored request mixing resolvable and unresolvable ids over the published fixture.
///
/// `TYPE_MASK` rides the request at full shape, unresolvable ids read 0 in every mask, and a
/// fixture type URL resolves to real bits.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn colored_types_zero_unknowns() {
    let (_generation, atlas) = publish("colored-masks-e2e").await;

    let mut colored = request(0, 0, 0, Mode::Delta);
    colored.query.colored_type_ids = vec![
        fixture_type_url(0).parse().expect("fixture urls parse"),
        "https://example.com/types/unknown/v/1"
            .parse()
            .expect("the literal is a versioned url"),
        "https://example.com/types/unknown/v/2"
            .parse()
            .expect("the literal is a versioned url"),
    ];
    let bytes = atlas
        .tile(
            &colored,
            TileLimits::default(),
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
        )
        .expect("a colored request serves");

    let rows = section(&bytes, ROW_IDS).expect("ROW_IDS is present");
    let mask = section(&bytes, TYPE_MASK).expect("TYPE_MASK rides colored requests");
    // With three requested ids the stride is ceil(3/8) = 1 byte per
    // point, so four row-id bytes stand behind every mask byte.
    assert_eq!(mask.len() * 4, rows.len());
    assert!(
        mask.iter().all(|&byte| byte & !0b1 == 0),
        "unresolvable ids read 0 in every mask",
    );
    assert!(
        mask.iter().any(|&byte| byte & 0b1 != 0),
        "the fixture type URL resolves to real membership bits",
    );
}

/// A generation carrying the memory dataset's positional ids does not serve.
///
/// The open fails on the key kind.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn foreign_key_kinds_fail_open() {
    use super::error::{IdentityDomain, OpenAtlasError};
    use crate::salt::fit::prepare::identity::InvalidIdentityFile;

    let (root, generation) = fit_fixture("foreign-kind-fails").await;
    let error = Atlas::open(&root, generation.id(), test_open_options())
        .expect_err("a foreign key kind must fail the open");
    assert!(
        matches!(
            error,
            OpenAtlasError::Identity {
                domain: IdentityDomain::Ontology,
                error: InvalidIdentityFile::KeyKind { .. },
            },
        ),
        "the open names the first identity table it rejects: {error}",
    );
}

/// Resolution and descendant expansion against hand-built artifacts.
///
/// Eight points, four types (`1 <- 0`, `2 <- 0`, `3 <- {1, 2}`), the postings fixture's dense/list
/// split.
#[test]
fn colored_masks_expand_descendants() {
    use type_system::ontology::id::VersionedUrl;

    use super::colour;
    use crate::{
        file::{identity::read::IdentityFile, postings::read::PostingsFile},
        postgres::id::ArchivedOntologyTypeUuid,
        salt::{
            fit::prepare::identity::{IdentityTable, IdentityTableArchive},
            postings::{artifact::PostingsArchive, build::Postings, closure::ClosureMap},
        },
    };

    let dir = scratch("colored-masks");
    std::fs::create_dir_all(&dir).expect("the scratch directory creates");

    // Row-order direct types and the gather permutation, copied from
    // the postings fixture; member positions per type, hand-derived:
    // type 0 [1, 2, 3, 6], type 1 [5, 7], type 2 [0, 1, 7], type 3 [].
    let types: IdVec<NodeRowId, smallvec::SmallVec<OntologyRowId, 2>> =
        [&[0_u64][..], &[0, 2], &[1], &[2], &[0], &[1, 2], &[], &[0]]
            .iter()
            .map(|list| list.iter().copied().map(OntologyRowId::new).collect())
            .collect();
    let parents: IdVec<OntologyRowId, smallvec::SmallVec<OntologyRowId, 2>> =
        [&[][..], &[0_u64], &[0], &[1, 2]]
            .iter()
            .map(|list| list.iter().copied().map(OntologyRowId::new).collect())
            .collect();
    let row_of_position: [u32; 8] = [3, 1, 4, 0, 6, 2, 7, 5];
    let row_of_position = row_of_position.map(NodeRowId::from_u32);

    let postings = Postings::build(&types, IdSlice::from_raw(&row_of_position), &parents)
        .expect("the fixture stays in domain");
    let postings_path = dir.join("fixture.post");
    let mut file = std::fs::File::create(&postings_path).expect("the postings file creates");
    postings
        .write_into(&mut file)
        .expect("the postings should write");
    drop(file);
    let postings =
        PostingsArchive::new(PostingsFile::open(&postings_path).expect("the postings file opens"))
            .expect("the postings validate");
    let closure = ClosureMap::new(&postings, []).expect("the parent graph is acyclic");

    // One versioned URL per type row; the table keys each row by the
    // uuid its URL derives, exactly as the store's identities would.
    let urls: Vec<String> = (0..4)
        .map(|row| format!("https://example.com/types/fixture-{row}/v/1"))
        .collect();
    let mut table = IdentityTable::<OntologyRowId, ArchivedOntologyTypeUuid>::new();
    for url in &urls {
        let parsed: VersionedUrl = url.parse().expect("the fixture URL parses");
        table.push(ArchivedOntologyTypeUuid::from_url(&parsed));
    }
    let identity_path = dir.join("fixture.idnt");
    let mut file = std::fs::File::create(&identity_path).expect("the identity file creates");
    let rows = usize::try_from(table.len()).expect("fixture row counts fit the address space");
    let empty =
        <crate::dataset::auxiliary::Icon as zerocopy::TryFromBytes>::try_ref_from_bytes(&[])
            .expect("every payload type admits the empty byte string");
    let _digest = table
        .write_into(core::iter::repeat_n(empty, rows), &mut file)
        .expect("the identities should write");
    drop(file);
    let table = IdentityTableArchive::<ArchivedOntologyTypeUuid, OntologyRowId>::new(
        IdentityFile::open(&identity_path).expect("the identity file opens"),
    )
    .expect("the identity table validates");

    let members = |ids: &[String]| -> Vec<Vec<u32>> {
        let urls: Vec<type_system::ontology::id::VersionedUrl> = ids
            .iter()
            .map(|id| id.parse().expect("test urls parse"))
            .collect();

        let set = colour::resolve_masks(&postings, &closure, &table, &colour::Palette::of(&urls));
        set.memberships(&postings)
            .iter()
            .map(|membership| {
                membership
                    .positions_in(BasePosition::from_u32(0)..BasePosition::from_u32(8))
                    .map(BasePosition::as_u32)
                    .collect()
            })
            .collect()
    };

    // Type 0's descendants are every type: the union covers every
    // typed position. Type 1 folds type 3's empty membership in.
    // Type 3 has no proper descendant and serves its stored (empty)
    // membership. A URL this generation never ingested reads empty.
    assert_eq!(members(&[urls[0].clone()]), vec![vec![0, 1, 2, 3, 5, 6, 7]],);
    assert_eq!(
        members(&[
            urls[1].clone(),
            urls[2].clone(),
            urls[3].clone(),
            "https://example.com/types/unknown/v/1".to_owned(),
        ]),
        vec![vec![5, 7], vec![0, 1, 7], vec![], vec![]],
    );
}

/// One synthetic entity identity per seed byte, plus its upstream string form.
fn entity_id_of(seed: u8) -> crate::postgres::id::ArchivedEntityId {
    crate::postgres::id::ArchivedEntityId {
        web_id: uuid::Uuid::from_bytes([seed; 16]).into(),
        entity_uuid: uuid::Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
    }
}

/// The `webId~entityUuid` string form of [`entity_id_of`]'s identity.
///
/// Narrows a fixture-sized index into the wire's `u32` row domain.
fn narrow_usize(value: usize) -> u32 {
    u32::try_from(value).expect("fixture indexes fit u32")
}

/// Derives the node wire codec of an atlas opened with the suite's secret.
///
/// The independent derivation the assembly's egress must agree with.
pub(crate) fn test_codec(atlas: &Atlas) -> codec::RowCodec<NodeRowId> {
    codec::RowCodec::derive(
        &WireSecret::new(TEST_WIRE_SECRET),
        atlas.generation(),
        codec::NODE_LABEL,
    )
}

/// Derives a fixture edge row's link-entity identity from the seeding rule.
///
/// Identity bytes ascend with the edge row, because `entity_id_of` leads with its seed byte.
/// Ascending internal row order is therefore the wire's ascending-identity delivery order for the
/// fixture.
fn edge_identity_of(row: u32) -> crate::postgres::id::ArchivedEntityId {
    entity_id_of(EDGE_SEED + u8::try_from(row).expect("fixture edge rows fit u8"))
}

fn entity_string_of(seed: u8) -> String {
    format!(
        "{}~{}",
        uuid::Uuid::from_bytes([seed; 16]),
        uuid::Uuid::from_bytes([seed ^ 0xFF; 16]),
    )
}

/// Writes and reopens one hand-built entity identity table.
fn entity_identity_table<R: Row>(
    path: &camino::Utf8PathBuf,
    ids: &[crate::postgres::id::ArchivedEntityId],
) -> crate::salt::fit::prepare::identity::IdentityTableArchive<
    crate::postgres::id::ArchivedEntityId,
    R,
> {
    use crate::{
        file::identity::read::IdentityFile, postgres::id::ArchivedEntityId,
        salt::fit::prepare::identity::IdentityTable,
    };

    let mut table = IdentityTable::<R, ArchivedEntityId>::new();
    for &id in ids {
        table.push(id);
    }
    let mut file = std::fs::File::create(path).expect("the identity file creates");
    let empty = crate::dataset::auxiliary::OwnedLegend::new(
        crate::identity::OntologyRowId::new(0),
        Label::EMPTY,
    );
    let _digest = table
        .write_into(core::iter::repeat_n(empty.as_ref(), ids.len()), &mut file)
        .expect("the identities should write");
    drop(file);
    crate::salt::fit::prepare::identity::IdentityTableArchive::new(
        IdentityFile::open(path).expect("the identity file opens"),
    )
    .expect("the identity table validates")
}

/// Translate resolution against hand-built identity tables.
///
/// Nodes answer row and wire position, edges answer their endpoints' node rows, and every
/// non-resolving shape - draft-suffixed, unparsable, unknown - reads as an absent key.
#[test]
fn translate_by_identity() {
    use super::translate::{
        TranslateColumns, TranslateLimits, TranslateRequest, TranslatedEdge, TranslatedNode,
        translate,
    };
    use crate::math::Vec2;

    let dir = scratch("translate-identity");
    std::fs::create_dir_all(&dir).expect("the scratch directory creates");

    // Three nodes, two edges. Node row 1 sits at base position 2.
    let nodes = entity_identity_table(
        &dir.join("nodes.idnt"),
        &[entity_id_of(1), entity_id_of(2), entity_id_of(3)],
    );
    let edges = entity_identity_table(
        &dir.join("edges.idnt"),
        &[entity_id_of(10), entity_id_of(11)],
    );
    let positions = [
        Vec2::new(0.0, 0.5),
        Vec2::new(-0.25, 1.0),
        Vec2::new(0.75, -0.5),
    ];
    let position_of_row = [1_u32, 2, 0].map(BasePosition::from_u32);

    let request = TranslateRequest {
        entity_ids: vec![
            entity_string_of(2),                           // node row 1
            entity_string_of(10),                          // edge row 0
            entity_string_of(2),                           // duplicate: collapses
            format!("{}~draft-tail", entity_string_of(3)), // draft-suffixed: absent
            "not an entity id".to_owned(),                 // unparsable: absent
            entity_string_of(0xAB),                        // unknown: absent
        ],
    };
    // The table's universe is three node rows, and the expectations
    // below encode through the same derivation.
    let universe = codec::Universe::new(NodeRowId::new(3));
    let node_codec = codec::RowCodec::derive(
        &WireSecret::new(TEST_WIRE_SECRET),
        codec_generation(),
        codec::NODE_LABEL,
    );
    // Edge row 0 joins nodes 0 and 1, edge row 1 joins 1 and 2:
    // arbitrary but in-universe, visible under the full proof.
    let endpoints = [
        [NodeRowId::new(0), NodeRowId::new(1)],
        [NodeRowId::new(1), NodeRowId::new(2)],
    ];
    let response = translate(
        request,
        TranslateLimits::default(),
        &FULL,
        None,
        crate::serve::delta::PlacementCohort::EMPTY,
        &TranslateColumns {
            node_ids: &nodes,
            edge_ids: &edges,
            positions: IdSlice::from_raw(&positions),
            position_of_row: IdSlice::from_raw(&position_of_row),
            endpoints: IdSlice::from_raw(&endpoints),
            node_codec: &node_codec,
            universe,
            fitted: universe,
        },
    )
    .expect("the request is under the cap");

    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(2),
            TranslatedNode {
                id: node_codec.encode(NodeRowId::new(1), universe),
                x: 0.75,
                y: -0.5,
            },
        )],
    );
    assert_eq!(
        response.edges.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(10),
            TranslatedEdge {
                source: node_codec.encode(NodeRowId::new(0), universe),
                target: node_codec.encode(NodeRowId::new(1), universe),
            },
        )],
    );
}

/// The cap rejects by count before any id lookup.
#[test]
fn translate_rejects_over_cap() {
    use super::translate::{
        TranslateColumns, TranslateError, TranslateLimits, TranslateRequest, translate,
    };

    let dir = scratch("translate-cap");
    std::fs::create_dir_all(&dir).expect("the scratch directory creates");
    let nodes = entity_identity_table(&dir.join("nodes.idnt"), &[entity_id_of(1)]);
    let edges = entity_identity_table(&dir.join("edges.idnt"), &[entity_id_of(10)]);

    let over = TranslateRequest {
        entity_ids: vec![String::new(); TranslateLimits::default().entity_ids as usize + 1],
    };
    let node_codec = codec::RowCodec::derive(
        &WireSecret::new(TEST_WIRE_SECRET),
        codec_generation(),
        codec::NODE_LABEL,
    );
    assert_eq!(
        translate(
            over,
            TranslateLimits::default(),
            &FULL,
            None,
            crate::serve::delta::PlacementCohort::EMPTY,
            &TranslateColumns {
                node_ids: &nodes,
                edge_ids: &edges,
                positions: IdSlice::from_raw(&[]),
                position_of_row: IdSlice::from_raw(&[]),
                endpoints: IdSlice::from_raw(&[]),
                node_codec: &node_codec,
                universe: codec::Universe::new(NodeRowId::new(1)),
                fitted: codec::Universe::new(NodeRowId::new(1)),
            },
        ),
        Err(TranslateError::Ids {
            count: TranslateLimits::default().entity_ids as usize + 1,
            maximum: TranslateLimits::default().entity_ids,
        }),
    );
}

/// Translate over the published fixture.
///
/// The rewritten store-width identities resolve end to end. Node row and wire position agree with
/// the serving columns. An edge id answers its row, and an unknown id reads absent.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_store_identities() {
    use super::translate::{TranslateLimits, TranslateRequest, TranslatedEdge, TranslatedNode};

    let (_generation, atlas) = publish("translate-e2e").await;

    let response = atlas
        .translate(
            TranslateRequest {
                entity_ids: vec![
                    entity_string_of(0),
                    entity_string_of(EDGE_SEED),
                    format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil()),
                ],
            },
            TranslateLimits::default(),
            &FULL,
            None,
            crate::serve::delta::PlacementCohort::EMPTY,
        )
        .expect("the request is under the cap");

    let position = atlas.positions_of_row()[NodeRowId::new(0)];
    let point = atlas.positions()[position];
    let node_codec = test_codec(&atlas);
    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(0),
            TranslatedNode {
                id: node_codec.encode(NodeRowId::new(0), atlas.node_universe()),
                x: point.x(),
                y: point.y(),
            },
        )],
    );
    // Fixture edge row 0 joins node rows 0 and 1.
    assert_eq!(
        response.edges.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(EDGE_SEED),
            TranslatedEdge {
                source: node_codec.encode(NodeRowId::new(0), atlas.node_universe()),
                target: node_codec.encode(NodeRowId::new(1), atlas.node_universe()),
            },
        )],
    );
}

/// Shorthand for a null-valued property entry.
fn property(name: &str) -> (BaseUrl, super::hydrate::ScalarValue) {
    (
        BaseUrl::new(name.to_owned()).expect("fixture keys are base URLs"),
        super::hydrate::ScalarValue::Null,
    )
}

#[test]
fn scalar_shapes_parse() {
    use super::hydrate::ScalarValue;

    // The store renders 2.5 and 1.0 with their points, so both read
    // as doubles; a number beyond i64 falls back to f64 (the wire's
    // integer is i64 - the scalar-value shapes carry no wider integral form).
    let object = serde_json::from_str(
        r#"{
            "https://x.test/f/": 2.5,
            "https://x.test/g/": 1.0,
            "https://x.test/i/": 7,
            "https://x.test/j/": -3,
            "https://x.test/n/": null,
            "https://x.test/t/": "text",
            "https://x.test/u/": 18446744073709551615,
            "https://x.test/y/": true
        }"#,
    )
    .expect("the fixture is JSON");
    let mut entries = super::hydrate::select::scalar_properties(object);
    entries.sort_by(|left, right| left.0.cmp(&right.0));

    let expected = [
        ("https://x.test/f/", ScalarValue::Float(2.5)),
        ("https://x.test/g/", ScalarValue::Float(1.0)),
        ("https://x.test/i/", ScalarValue::Integer(7)),
        ("https://x.test/j/", ScalarValue::Integer(-3)),
        ("https://x.test/n/", ScalarValue::Null),
        ("https://x.test/t/", ScalarValue::String("text".to_owned())),
        // u64::MAX itself is not an f64, so the fallback rounds to the
        // nearest double.
        (
            "https://x.test/u/",
            ScalarValue::Float(1.844_674_407_370_955_2e19),
        ),
        ("https://x.test/y/", ScalarValue::Bool(true)),
    ];
    assert_eq!(
        entries,
        expected
            .into_iter()
            .map(|(name, value)| {
                (
                    BaseUrl::new(name.to_owned()).expect("fixture keys are base URLs"),
                    value,
                )
            })
            .collect::<Vec<_>>(),
    );
}

#[test]
#[should_panic(expected = "the store aggregates a JSON object")]
fn scalar_properties_reject_non_objects() {
    let _entries = super::hydrate::select::scalar_properties(serde_json::json!([1, 2]));
}

#[test]
fn scalar_properties_skip_non_url_keys() {
    let entries = super::hydrate::select::scalar_properties(
        serde_json::json!({"not a url": null, "https://x.test/a/": true}),
    );

    // The malformed key skips its entry alone. The well-keyed sibling survives.
    assert_eq!(
        entries,
        vec![(
            BaseUrl::new("https://x.test/a/".to_owned()).expect("fixture keys are base URLs"),
            super::hydrate::ScalarValue::Bool(true),
        )],
    );
}

#[test]
fn select_properties_drop_reverse_lexicographically() {
    let entries = vec![
        property("https://x.test/b/"),
        property("https://x.test/d/"),
        property("https://x.test/a/"),
        property("https://x.test/c/"),
    ];

    // Under the cap: nothing drops, output ascends by name.
    assert_eq!(
        super::hydrate::select::select_properties(entries.clone(), None, 4),
        vec![
            property("https://x.test/a/"),
            property("https://x.test/b/"),
            property("https://x.test/c/"),
            property("https://x.test/d/")
        ],
    );

    // Over the cap: d drops first, then c - the largest names go.
    assert_eq!(
        super::hydrate::select::select_properties(entries, None, 2),
        vec![property("https://x.test/a/"), property("https://x.test/b/")],
    );
}

#[test]
fn select_properties_protect_label() {
    let entries = vec![
        property("https://x.test/a/"),
        property("https://x.test/b/"),
        property("https://x.test/z/"),
    ];
    let label = BaseUrl::new("https://x.test/z/".to_owned()).expect("fixture keys are base URLs");

    // z is reverse-lexicographically first to drop, but it is the
    // label property: it survives every cap that admits at least
    // one property, and the survivors still emit ascending.
    assert_eq!(
        super::hydrate::select::select_properties(entries.clone(), Some(&label), 2),
        vec![property("https://x.test/a/"), property("https://x.test/z/")],
    );
    assert_eq!(
        super::hydrate::select::select_properties(entries.clone(), Some(&label), 1),
        vec![property("https://x.test/z/")],
    );

    // A cap of zero admits nothing - even the label drops.
    assert_eq!(
        super::hydrate::select::select_properties(entries, Some(&label), 0),
        vec![],
    );
}

/// One locate request built directly.
fn locate_request(entity_id: String) -> super::LocateRequest {
    super::LocateRequest {
        entity_id: Some(entity_id),
        row: None,
        colored_type_ids: Vec::new(),
    }
}

/// A locate source names one subject in one of two identity domains.
///
/// A by-`row` request resolves through the wire codec's ingress, pure arithmetic with no store, and
/// answers the same response bytes as the by-`entityId` request for that node. A wire value outside
/// the encoded image collapses into `unknown-entity`, and assembly rejects a body carrying
/// both or neither source field by name with its count.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_by_wire_row_matches_by_entity() {
    let (_generation, atlas) = publish("locate-by-row").await;
    let limits = ServeLimits::default();

    // Row 7's wire id round-trips by construction (the codec is a
    // bijection); the equivalence under test is the two request
    // paths, whose agreement is the whole contract in one assertion.
    let node_codec = test_codec(&atlas);
    let wire = node_codec.encode(NodeRowId::new(7), atlas.node_universe());
    let by_entity = locate_request(entity_string_of(7));
    let mut by_row: super::LocateRequest =
        serde_json::from_value(serde_json::json!({ "row": wire.get() }))
            .expect("a by-row body deserializes");
    assert_eq!(by_row.row, Some(wire));
    assert_eq!(by_row.entity_id, None);
    let by_entity_bytes = atlas
        .locate(
            &by_entity,
            limits,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UnresolvedStore,
        )
        .expect("the entity resolves");
    let by_row_bytes = atlas
        .locate(
            &by_row,
            limits,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UnresolvedStore,
        )
        .expect("the wire row resolves");
    assert_eq!(
        by_entity_bytes, by_row_bytes,
        "one node, two source domains, identical bytes",
    );

    // Wire ids are sparse in the u32 range: a value outside the
    // encoded image collapses into the entity path's own rejection.
    // Neither probe collides with the 48-value image under the
    // fixture key - pinned here, not left to runtime luck.
    let image: HashSet<u32> = (0..48)
        .map(|row| {
            node_codec
                .encode(NodeRowId::from_u32(row), atlas.node_universe())
                .get()
        })
        .collect();
    assert!(
        !image.contains(&48) && !image.contains(&u32::MAX),
        "the probes lie outside the image",
    );
    for garbage in [48, u32::MAX] {
        by_row.row = Some(codec::WireRow::pinned(garbage));
        assert_matches!(
            atlas.locate(
                &by_row,
                limits,
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
                UntouchedStore
            ),
            Err(super::LocateError::UnknownEntity),
            "{garbage}",
        );
    }

    // Both sources or none: rejected by name, with the count.
    by_row.row = Some(wire);
    by_row.entity_id = Some(entity_string_of(7));
    assert_matches!(
        atlas.locate(
            &by_row,
            limits,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore
        ),
        Err(super::LocateError::Source { carried: 2 }),
    );
    by_row.row = None;
    by_row.entity_id = None;
    assert_matches!(
        atlas.locate(
            &by_row,
            limits,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UntouchedStore
        ),
        Err(super::LocateError::Source { carried: 0 }),
    );
}

/// The locate one-call path encodes byte-exactly against the derived wire document.
///
/// Assembly and encoding against the groundwork layers' own outputs, with a store answering that
/// nothing resolves: the mandatory trailer rides empty tables and null columns, and both source
/// completeness flags read `false` - an unresolved source can attest nothing.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_pinned_envelope() {
    use crate::salt::{
        postings::artifact::Membership,
        wire::locate::{LocateResponse, LocateTrailer},
    };

    let (generation, atlas) = publish("locate-endpoint").await;
    let limits = ServeLimits::default();
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);

    let mut request = locate_request(entity_string_of(0));
    let bytes = atlas
        .locate(
            &request,
            limits,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UnresolvedStore,
        )
        .expect("the request is well-formed");
    assert_eq!(bytes[0..8], *b"SALTILEL");

    // The groundwork layers derive the expectation independently;
    // their own tests pin their behaviour.
    let source = atlas
        .resolve_source(&view, &entity_string_of(0))
        .expect("row 0 is a node");
    let subgraph = atlas.locate_subgraph(source, limits.locate, &view);
    let node_codec = test_codec(&atlas);
    let wire_of = |row: NodeRowId| node_codec.encode(row, atlas.node_universe());
    let columns = EdgeColumns::pinned(subgraph.edges.iter().map(|&(edge, id)| {
        let edge = fitted(edge);

        (wire_of(edge.source).get(), wire_of(edge.target).get(), id)
    }));
    let wire_rows: Vec<WireRow<NodeRowId>> =
        atlas.row_ids().iter().map(|&row| wire_of(row)).collect();
    let nodes = subgraph.delivered.len();
    let edges = subgraph.edges.len();
    let no_labels: Vec<&Label> = vec![Label::EMPTY; nodes];
    let no_types: Vec<Option<super::TableIndex<VersionedUrl>>> = vec![None; nodes];
    let no_link_labels: Vec<&Label> = vec![Label::EMPTY; edges];
    let no_lists: Vec<Vec<super::TableIndex<VersionedUrl>>> = vec![Vec::new(); edges];
    let no_flags: Box<DenseBitSlice<EdgeSlot>> = DenseBitSlice::new_empty(edges);
    let no_maps: Vec<Option<&crate::salt::wire::locate::PropertyMap<'_>>> = vec![None; edges];
    let response = |masks: Option<&[Membership<'_>]>| {
        LocateResponse {
            generation: generation.id().digest(),
            variant: 0,
            cell: source.cell,
            complete: subgraph.complete,
            entity_id: entity_id_of(0),
            type_ids_complete: false,
            properties_complete: false,
            delivered: &subgraph.delivered,
            arrivals: IdSlice::from_raw(&[]),
            positions: atlas.positions(),
            rows: IdSlice::from_raw(&wire_rows),
            masks,
            edges: &columns,
            trailer: LocateTrailer {
                type_table: IdSlice::from_raw(&[]),
                property_table: IdSlice::from_raw(&[]),
                labels: IdSlice::from_raw(&no_labels),
                type_ids: IdSlice::from_raw(&no_types),
                properties: None,
                link_labels: IdSlice::from_raw(&no_link_labels),
                link_type_ids: IdSlice::from_raw(&no_lists),
                link_type_ids_complete: &no_flags,
                link_properties: IdSlice::from_raw(&no_maps),
                link_properties_complete: &no_flags,
            },
        }
        .encode()
    };
    assert_eq!(bytes, response(None), "the envelope matches the derivation");

    // An id resolving to no type is legal and reads zero bits; the
    // TYPE_MASK slot rides exactly the requests that colour.
    request.colored_type_ids = vec![
        "https://unknown.test/t/v/1"
            .parse()
            .expect("the literal is a versioned url"),
    ];
    let colored_bytes = atlas
        .locate(
            &request,
            limits,
            Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
            UnresolvedStore,
        )
        .expect("unresolvable colored ids are legal");
    assert_eq!(colored_bytes, response(Some(&[Membership::List(&[])])));
}

/// Every locate rejection carries its name.
///
/// The unknown-entity doctrine treats unparsable, unknown, and wrong-domain ids identically.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_rejection_names() {
    let (_generation, atlas) = publish("locate-rejects").await;
    let limits = ServeLimits::default();

    // Unparsable, unknown, and an EDGE id (wrong identity domain)
    // are one rejection: an id that cannot name a visible node.
    for id in [
        "not an entity id".to_owned(),
        entity_string_of(50),
        entity_string_of(EDGE_SEED),
    ] {
        assert_matches!(
            atlas.locate(
                &locate_request(id.clone()),
                limits,
                Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas),
                UntouchedStore,
            ),
            Err(super::LocateError::UnknownEntity),
            "{id}",
        );
    }

    // The coloredTypeIds cap is the tile endpoint's own.
    let mut colored = locate_request(entity_string_of(0));
    colored.colored_type_ids = vec![
        "https://example.com/types/thing/v/1"
            .parse()
            .expect("the literal is a versioned url");
        limits.tile.colored_type_ids as usize + 1
    ];
    assert_matches!(
        atlas.locate(&colored, limits, Bound::new(&atlas, &FULL, CutOffset::ZERO).view(&atlas), UntouchedStore),
        Err(super::LocateError::Types { count, maximum })
            if count == limits.tile.colored_type_ids as usize + 1
                && maximum == limits.tile.colored_type_ids,
    );
}

/// The intern tables are the sorted, deduplicated unions of every reference.
///
/// The property maps lead with the source's and keep each entity's ascending-name order as
/// ascending indexes; node type references take the representative type, link references keep
/// canonical order. `None` marks an unresolved entity, an empty list a resolved one without
/// surviving entries.
#[test]
fn intern_table_references() {
    use super::{
        TableIndex,
        hydrate::ScalarValue,
        locate::{intern_properties, intern_types},
    };
    use crate::salt::wire::locate::{PropertyMap, PropertyValue};

    let owned = |name: &str, value: ScalarValue| {
        (
            BaseUrl::new(format!("https://x.test/{name}/")).expect("fixture keys are base URLs"),
            value,
        )
    };
    let source = vec![
        owned("b", ScalarValue::String("t".to_owned())),
        owned("d", ScalarValue::Integer(7)),
    ];
    let links = vec![
        None,
        Some(vec![
            owned("a", ScalarValue::Null),
            owned("b", ScalarValue::Bool(true)),
        ]),
        Some(vec![]),
    ];

    let (names, maps) = intern_properties(Some(&source), IdSlice::from_raw(&links));
    assert_eq!(
        names.entries().as_raw(),
        [
            "https://x.test/a/",
            "https://x.test/b/",
            "https://x.test/d/"
        ],
    );
    assert_eq!(
        maps,
        vec![
            Some(PropertyMap::new_unchecked(vec![
                (TableIndex::new(1), PropertyValue::Text("t")),
                (TableIndex::new(2), PropertyValue::Integer(7)),
            ])),
            None,
            Some(PropertyMap::new_unchecked(vec![
                (TableIndex::new(0), PropertyValue::Null),
                (TableIndex::new(1), PropertyValue::Boolean(true)),
            ])),
            Some(PropertyMap::new_unchecked(vec![])),
        ],
    );

    // An absent source stays the leading entry.
    let (names, maps) = intern_properties(None, IdSlice::from_raw(&links[..2]));
    assert_eq!(
        names.entries().as_raw(),
        ["https://x.test/a/", "https://x.test/b/"]
    );
    assert_eq!(
        maps,
        vec![
            None,
            None,
            Some(PropertyMap::new_unchecked(vec![
                (TableIndex::new(0), PropertyValue::Null),
                (TableIndex::new(1), PropertyValue::Boolean(true)),
            ])),
        ],
    );

    // Types: nodes contribute their FIRST direct type, links their
    // whole capped lists in canonical (unsorted) order.
    let url = |name: &str| -> VersionedUrl {
        format!("https://t.test/{name}/v/1")
            .parse()
            .expect("test urls parse")
    };
    let nodes = vec![vec![url("m"), url("z")], Vec::new(), vec![url("a")]];
    let link_types = vec![vec![url("z"), url("a")], Vec::new()];
    let (table, type_ids, link_type_ids) =
        intern_types(IdSlice::from_raw(&nodes), IdSlice::from_raw(&link_types));
    // The node-only type "m" interns; the node-second "z" also
    // interns through the link list.
    assert_eq!(
        table.entries().as_raw(),
        [
            "https://t.test/a/v/1",
            "https://t.test/m/v/1",
            "https://t.test/z/v/1"
        ],
    );
    assert_eq!(
        type_ids.as_raw(),
        [Some(TableIndex::new(1)), None, Some(TableIndex::new(0))],
    );
    assert_eq!(
        link_type_ids.as_raw(),
        [vec![TableIndex::new(2), TableIndex::new(0)], Vec::new()],
    );
}

/// The source coverage predicate reads exactly the ratified rule.
///
/// `directTypes \u{2286} coloredTypeIds`, with `false` for a store-absent source, an unrecorded
/// type list, and an empty palette.
#[test]
fn source_type_subset_rule() {
    use super::{colour::Palette, locate::covers_source_types};

    let url = |name: &str| -> VersionedUrl {
        format!("https://t.test/{name}/v/1")
            .parse()
            .expect("test urls parse")
    };
    let colored = Palette::of(&[url("a"), url("b")]);

    // In the ratified example the source carries {a, c} and the
    // request colours {a, b}, so coverage fails because c is outside
    // the set.
    assert!(!covers_source_types(true, &[url("a"), url("c")], &colored));
    assert!(covers_source_types(true, &[url("a")], &colored));
    assert!(covers_source_types(true, &[url("b"), url("a")], &colored));

    // An empty palette covers nothing, and an unreadable or
    // unrecorded type list attests nothing. An unparsable direct
    // type cannot reach coverage: the store boundary parses every
    // URL before a hydration column exists.
    assert!(!covers_source_types(true, &[url("a")], &Palette::of(&[])));
    assert!(!covers_source_types(true, &[], &colored));
    assert!(!covers_source_types(false, &[url("a")], &colored));
}

/// A proof hiding exactly `hidden` among the atlas's node rows, and no link rows.
///
/// The link mask admits every link row of the generation, so a battery built on this helper varies
/// the node axis alone.
pub(crate) fn mask_hiding(atlas: &Atlas, hidden: &[u32]) -> VisibilityProof {
    mask_hiding_rows(atlas, hidden, &[])
}

/// A proof hiding `hidden_nodes` among the atlas's node rows and `hidden_edges` among its link
/// rows.
///
/// Exclusion over the generation's own domains builds both masks, so the proof differs from the
/// full-visibility proof in exactly the listed rows.
fn mask_hiding_rows(atlas: &Atlas, hidden_nodes: &[u32], hidden_edges: &[u32]) -> VisibilityProof {
    VisibilityProof::from_masks(
        domain_mask(atlas.row_ids().len(), hidden_nodes),
        domain_mask(atlas.endpoints.view().len(), hidden_edges),
        fast_hash_set(),
    )
}

/// A mask over the domain `[0, rows)` admitting every row except `hidden`.
fn domain_mask<T: Id>(rows: usize, hidden: &[u32]) -> CompressedBitSet<T> {
    let rows = u32::try_from(rows).expect("fixture domains fit u32");
    for &row in hidden {
        assert!(row < rows, "a fixture hides rows of the domain it masks");
    }

    CompressedBitSet::from_rows(
        (0..rows)
            .filter(|row| !hidden.contains(row))
            .map(T::from_u32),
    )
}

/// Folds one `Ended` feed event per seed into a published snapshot over `atlas`.
///
/// The events travel the consumer's own conversion, so the snapshot is the one publication
/// serving would read rather than a hand-assembled equivalent. Fixture node row `r` owns seed
/// `r`, so withdrawing a row is withdrawing its seed.
pub(crate) fn withdrawing(atlas: &Atlas, seeds: &[u8]) -> DeltaSnapshot {
    let mut register = DeltaRegister::new(
        atlas.node_universe(),
        atlas.edge_universe(),
        atlas.ontology_universe(),
    );
    for &seed in seeds {
        let event = EntityEvent::Ended(EntityEnd {
            entity: EntityId {
                web_id: WebId::new(Uuid::from_bytes([seed; 16])),
                entity_uuid: EntityUuid::new(Uuid::from_bytes([seed ^ 0xFF; 16])),
                draft_id: None,
            },
            ended_at: Timestamp::from_unix_timestamp(1),
        });
        register.apply(DeltaEvent::from(&event));
    }

    register.snapshot(
        atlas,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(1),
    )
}

/// Returns a fixed generation identity for codec derivation.
fn codec_generation() -> GenerationId {
    "1111111111111111111111111111111111111111111111111111111111111111"
        .parse()
        .expect("the literal is 64 hex digits")
}

/// Reads the delivered count and the per-bucket runs from a tile `HEAD`.
///
/// Panics on the retired fill key and on a head whose runs do not account for its delivered
/// count, the two laws the head owns for every caller of this helper.
fn head_counts(head: &[u8]) -> (u64, Vec<u64>) {
    let mut reader = CborReader { bytes: head, at: 0 };
    let entries = reader.head(5);
    let (mut delivered, mut runs) = (0, Vec::new());
    for _ in 0..entries {
        let key = reader.uint();
        match key {
            4 => delivered = reader.uint(),
            7 => {
                let count = usize::try_from(reader.head(4)).expect("run counts fit usize");
                runs = core::iter::repeat_with(|| reader.uint())
                    .take(count)
                    .collect();
            }
            11 => panic!("HEAD key 11 is retired: no response carries a fill tail"),
            _ => reader.skip(),
        }
    }

    assert_eq!(
        runs.iter().sum::<u64>(),
        delivered,
        "every delivered row belongs to a bucket the runs count",
    );

    (delivered, runs)
}

/// Asserts one tile head accounts for `delivered` points.
///
/// The runs-against-delivered law lives in [`head_counts`], which every head reader calls. This
/// adds the caller's own count, so a head agreeing with itself but not with the response still
/// fails.
fn assert_head_delivers(bytes: &[u8], delivered: u64) {
    let (counted, _runs) = head_counts(section(bytes, HEAD).expect("HEAD is present"));
    assert_eq!(counted, delivered, "the head counts the delivered rows");
}

/// Reads the occupied-child bitmask from a tile `HEAD`.
fn children_of(head: &[u8]) -> u64 {
    let mut reader = CborReader { bytes: head, at: 0 };
    let entries = reader.head(5);
    for _ in 0..entries {
        let key = reader.uint();
        if key == 9 {
            return reader.uint();
        }
        reader.skip();
    }

    0
}

/// Reads the root's global map from a tile `HEAD`, [`None`] when the head carries none.
///
/// The visible count of the root's schedule, the visible extent as `[minX, minY, maxX, maxY]`, and
/// the deepest visible bucket - `HEAD` key 8, whose value is the census the scope resolved.
fn head_global(head: &[u8]) -> Option<(u64, Option<[f32; 4]>, u64)> {
    let mut reader = CborReader { bytes: head, at: 0 };
    let entries = reader.head(5);
    for _ in 0..entries {
        if reader.uint() != 8 {
            reader.skip();
            continue;
        }

        let fields = reader.head(5);
        let (mut visible, mut bounds, mut min_resolution) = (0, None, 0);
        for _ in 0..fields {
            match reader.uint() {
                0 => visible = reader.uint(),
                1 => {
                    assert_eq!(reader.head(4), 4, "the extent is four wire floats");
                    bounds = Some([reader.f32(), reader.f32(), reader.f32(), reader.f32()]);
                }
                2 => min_resolution = reader.uint(),
                _ => reader.skip(),
            }
        }

        return Some((visible, bounds, min_resolution));
    }

    None
}

/// A minimal CBOR reader over the deterministic profile the tile `HEAD` uses.
struct CborReader<'bytes> {
    bytes: &'bytes [u8],
    at: usize,
}

impl CborReader<'_> {
    /// Reads one head, asserting the major type, and returns its argument.
    fn head(&mut self, major: u8) -> u64 {
        let byte = self.bytes[self.at];
        assert_eq!(
            byte >> 5,
            major,
            "the HEAD item at {} has major {major}",
            self.at
        );
        self.read_head().1
    }

    /// Reads one head, returning the major type and the argument.
    fn read_head(&mut self) -> (u8, u64) {
        let byte = self.bytes[self.at];
        self.at += 1;
        let (major, argument) = (byte >> 5, byte & 0x1F);
        let argument = match argument {
            0..24 => u64::from(argument),
            24..28 => {
                let width = 1 << (argument - 24);
                let mut value = 0_u64;
                for _ in 0..width {
                    value = (value << 8) | u64::from(self.bytes[self.at]);
                    self.at += 1;
                }
                value
            }
            _ => panic!("the deterministic profile emits definite lengths alone"),
        };

        (major, argument)
    }

    /// Reads one unsigned integer.
    fn uint(&mut self) -> u64 {
        let (major, value) = self.read_head();
        assert_eq!(major, 0, "expected a uint at {}", self.at);
        value
    }

    /// Reads one wire float.
    ///
    /// The profile emits coordinates as CBOR single-precision floats, so the head read consumed the
    /// four payload bytes as the argument.
    fn f32(&mut self) -> f32 {
        let (major, bits) = self.read_head();
        assert_eq!(major, 7, "expected a float at {}", self.at);
        f32::from_bits(u32::try_from(bits).expect("wire floats are single precision"))
    }

    /// Skips one item of any shape the tile `HEAD` carries.
    fn skip(&mut self) {
        let (major, argument) = self.read_head();
        match major {
            // Uints and simple values / floats: the head read already consumed the argument or
            // its trailing bytes.
            0 | 7 => {}
            // Byte and text strings carry their content inline.
            2 | 3 => self.at += usize::try_from(argument).expect("section lengths fit usize"),
            // Arrays and maps recurse per element.
            4 => {
                for _ in 0..argument {
                    self.skip();
                }
            }
            5 => {
                for _ in 0..argument * 2 {
                    self.skip();
                }
            }
            _ => panic!("the tile HEAD carries no major-{major} items"),
        }
    }
}
