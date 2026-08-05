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

use core::{assert_matches, num::NonZero};
use std::collections::{HashMap, HashSet};

use camino::Utf8PathBuf;
use futures::future::ready;
use hashql_core::id::{Id, IdSlice, IdVec};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{
    Atlas, CutOffset, EdgesError, EdgesLimits, EdgesRequest, Filter, GenerationId, GenerationRoot,
    Mode, OpenOptions, ServeLimits, TileCoordinate, TileError, TileLimits, TileQuery, TileRequest,
    View, ViewCensus, VisibilityLimits, VisibilityProof, WireRow, WireSecret, codec,
    error::OpenAtlasError, locate::LocateDocument, schedule::ViewSchedule,
};
use crate::{
    bitset::CompressedBitSet,
    identity::{BasePosition, CardRow, EdgeRowId, NodeRowId, OntologyRowId},
    salt::{
        embedding::{CardEmbedder, EmbedderFingerprint},
        landmark::select::SelectionOptions,
        policy::classifier,
    },
};

mod authorization;
mod comparator;
mod density;
mod frame_channel;
mod masking;
mod metadata_channel;
mod open;
mod row_codec;
mod schedule;

/// The tests' default authority.
///
/// The operator proof is byte-identical to the pre-visibility serve.
static FULL: VisibilityProof = VisibilityProof::full_visibility();
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node as CorpusNode, Ontology, PROJECTOR_DIMENSIONS, card::Card,
        memory::MemoryDataset,
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
    math::{AffinityCurve, AlignedVecN, BoxedVecN, Log2, VecN},
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
const FIXTURE_LOD: LodConfig = LodConfig {
    span: Log2::new(1).expect("1 lies below the shift width"),
    max_tile_depth: 3,
};

/// The tile payload's pinned slot indexes.
const HEAD: usize = 0;
const POSITIONS: usize = 1;
const ROW_IDS: usize = 2;
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

/// A fit-scale corpus.
///
/// Unit-norm pseudo-random representations whose canonical embeddings extend them with zeros, one
/// node type alternating between two ontology rows, and one link type.
fn fixture_dataset() -> MemoryDataset {
    fixture_dataset_extended(&[])
}

/// The fixture corpus with one appended node per entry of `duplicated`, joined in a ring.
///
/// Each entry names a corpus row whose embedding the appended node repeats exactly. A repeat is
/// the one addition that cannot move the layout. Landmark placement gives every row its assigned
/// landmark's coordinate, and a repeated embedding resolves to the landmark its original resolved
/// to. The appended rows therefore sit co-located with their originals, where they compete for the
/// same cells of the corpus schedule and perturb nothing else. Rows `0..NODES` keep their
/// embeddings, their row order and their identities, which is what lets a caller pair the two
/// corpora row by row.
///
/// The appended edges close a ring over the appended nodes alone. Delivery ranks by incident
/// degree, so a ring member outranks every corpus row the fixture leaves unlinked and claims its
/// shared cell first. Touching a corpus row with one of these edges would move that row's degree
/// and with it its rank, which is why the ring stays closed.
fn fixture_dataset_extended(duplicated: &[u64]) -> MemoryDataset {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x5E4E);
    let mut canonical = HashMap::new();

    let mut nodes: Vec<_> = (0..NODES)
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
                ontology: smallvec![OntologyRowId::from_usize(row & 1)],
                embedding: BoxedVecN::new(&VecN::new(components)),
                confidence: None,
            }
        })
        .collect();

    for (offset, &source) in duplicated.iter().enumerate() {
        let row = NODES as u64 + offset as u64;
        let original = &nodes[usize::try_from(source).expect("fixture rows fit usize")];
        canonical.insert(row, canonical[&source].clone());
        nodes.push(CorpusNode {
            id: U64::<LE>::new(row),
            ontology: original.ontology.clone(),
            embedding: original.embedding.clone(),
            confidence: None,
        });
    }

    let appended = duplicated.len() as u64;
    let closed_ring = (0..appended).map(|offset| {
        let next = if offset + 1 == appended {
            0
        } else {
            offset + 1
        };
        (200 + offset, NODES as u64 + offset, NODES as u64 + next)
    });

    let edges = FIXTURE_EDGES
        .into_iter()
        .chain(closed_ring)
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
        curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
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
fn store_identities(generation: &Generation) {
    use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};

    use crate::{
        dataset::postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
        file::identity::read::IdentityFile,
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

    let ontology_rows = rows_of(&files.ontology_identities.name);
    let mut ontology = IdentityTable::<OntologyRowId, ArchivedOntologyTypeUuid>::new();
    for row in 0..ontology_rows {
        let url: VersionedUrl = fixture_type_url(row)
            .parse()
            .expect("the fixture URL parses");
        ontology.push(ArchivedOntologyTypeUuid::from(
            OntologyTypeUuid::from_url(&url).into_uuid(),
        ));
    }

    let nodes = entity_table::<NodeRowId>(rows_of(&files.node_identities.name), 0);
    let edges = entity_table::<EdgeRowId>(rows_of(&files.edge_identities.name), EDGE_SEED);

    rewrite_identities(
        generation.path_of(&files.ontology_identities.name),
        &ontology,
    );
    rewrite_identities(generation.path_of(&files.node_identities.name), &nodes);
    rewrite_identities(generation.path_of(&files.edge_identities.name), &edges);
}

/// Overwrites one identity artifact with a hand-built table.
fn rewrite_identities<R, I>(
    path: camino::Utf8PathBuf,
    table: &crate::salt::fit::prepare::identity::IdentityTable<R, I>,
) where
    R: Row,
    I: Key,
{
    let rows = usize::try_from(table.len()).expect("fixture row counts fit the address space");
    let mut file = std::fs::File::create(path).expect("the identity artifact rewrites");
    let empty = <I::Payload as zerocopy::TryFromBytes>::try_ref_from_bytes(&[])
        .expect("every payload type admits the empty byte string");
    let _digest = table
        .write_into(core::iter::repeat_n(empty, rows), &mut file)
        .expect("the identities should write");
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
async fn publish(name: &str) -> (Generation, Atlas) {
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
struct Bound<'proof> {
    proof: &'proof VisibilityProof,
    census: ViewCensus,
    schedule: ViewSchedule,
    k: CutOffset,
}

impl<'proof> Bound<'proof> {
    /// Resolves `proof`'s census and schedule, the way a scope resolution would.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    fn new(atlas: &Atlas, proof: &'proof VisibilityProof, k: CutOffset) -> Self {
        Self {
            proof,
            census: atlas.census(proof),
            schedule: ViewSchedule::of(atlas, proof),
            k,
        }
    }

    /// Resolves `proof` at the zero offset, the corpus-equivalent cut.
    fn of(atlas: &Atlas, proof: &'proof VisibilityProof) -> Self {
        Self::new(atlas, proof, CutOffset::ZERO)
    }

    /// Binds the delivery view assembly reads.
    fn view(&self, atlas: &Atlas) -> View<'_> {
        atlas
            .view(self.proof, self.census, &self.schedule, self.k)
            .expect("the fixture's proof, schedule and offset pair")
    }
}

/// Binds `proof`'s delivery view at the zero offset and reads it once.
fn viewing<T>(atlas: &Atlas, proof: &VisibilityProof, body: impl FnOnce(&View<'_>) -> T) -> T {
    let bound = Bound::of(atlas, proof);

    body(&bound.view(atlas))
}

fn request(z: u8, x: u32, y: u32, mode: Mode) -> TileRequest {
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
struct Artifacts {
    morton: MortonFile,
    quad: QuadFile,
    coordinates: ArrayFile,
    rows: ArrayFile,
}

fn open_artifacts(generation: &Generation) -> Artifacts {
    let files = &generation.repository().files;
    Artifacts {
        morton: MortonFile::open(generation.path_of(&files.morton.name))
            .expect("the morton artifact should open"),
        quad: QuadFile::open(generation.path_of(&files.quad.name))
            .expect("the quad artifact should open"),
        coordinates: ArrayFile::open(generation.path_of(&files.wire_coordinates.name))
            .expect("the coordinate artifact should open"),
        rows: ArrayFile::open(generation.path_of(&files.row_of_position.name))
            .expect("the row artifact should open"),
    }
}

/// Reads the gather column narrowed to the fixture tests' `u32` row vocabulary.
fn fixture_row_ids(rows: &ArrayFile) -> Vec<u32> {
    rows.u64_le_elements()
        .expect("the row column is little-endian u64 rows")
        .iter()
        .map(|row| u32::try_from(row.get()).expect("fixture rows fit u32"))
        .collect()
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
async fn every_operator_head_accounts_for_its_delivery() {
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
                    &FULL,
                    CutOffset::ZERO,
                )
                .expect("the operator tile serves");
            let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));

            assert_head_delivers(&bytes, rows.len() as u64);
        }
    }
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn serves_tiles_from_a_published_generation() {
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
            &FULL,
            CutOffset::ZERO,
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
                .encode(NodeRowId::from_u32(row))
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
            &FULL,
            CutOffset::ZERO,
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
                &FULL,
                CutOffset::ZERO,
            )
            .expect("every node tile should serve");
        let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));

        let run = quad.nodes()[node as usize].run();
        assert_eq!(tile_rows.len() as u64, run.end - run.start);
        delivered_rows.extend(tile_rows);
    }

    let mut expected: Vec<u32> = row_ids
        .iter()
        .map(|&row| node_codec.encode(NodeRowId::from_u32(row)).get())
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
            visible: population(&morton, empty_cell),
            first_bucket: coordinate.z + FIXTURE_LOD.span.get(),
            runs: &[0],
            global: None,
            children: 0,
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&[]),
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
                &FULL,
                CutOffset::ZERO,
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
            &FULL,
            CutOffset::ZERO,
        )
        .expect("the deepest total tile should serve");
    let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
    assert_eq!(tile_rows.len() as u64, population(&morton, deep_cell));
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn rejects_and_reports_the_contract() {
    let (_generation, atlas) = publish("rejects").await;

    assert_eq!(
        atlas.tile(
            &request(4, 0, 0, Mode::Delta),
            TileLimits::default(),
            &FULL,
            CutOffset::ZERO
        ),
        Err(TileError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.tile(
            &request(2, 4, 0, Mode::Delta),
            TileLimits::default(),
            &FULL,
            CutOffset::ZERO
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
        atlas.tile(&colored, TileLimits::default(), &FULL, CutOffset::ZERO),
        Err(TileError::Types {
            count: TileLimits::default().colored_type_ids as usize + 1,
            maximum: TileLimits::default().colored_type_ids,
        }),
    );

    let mut filtered = request(0, 0, 0, Mode::Delta);
    filtered.query.filter = Some(
        serde_json::from_value::<Filter>(serde_json::json!({ "any": [] }))
            .expect("a filter document deserializes opaquely"),
    );
    assert_eq!(
        atlas.tile(&filtered, TileLimits::default(), &FULL, CutOffset::ZERO),
        Err(TileError::Unsupported("filter"))
    );

    let mut detailed = request(0, 0, 0, Mode::Delta);
    detailed.query.include_detailed_data = true;
    assert_eq!(
        atlas.tile(&detailed, TileLimits::default(), &FULL, CutOffset::ZERO),
        Err(TileError::Unsupported("includeDetailedData")),
    );

    let manifest = serde_json::to_value(atlas.manifest(
        ServeLimits::default().manifest_limits(VisibilityLimits::default()),
        CutOffset::ZERO,
    ))
    .expect("the manifest serializes");
    assert_eq!(
        manifest,
        serde_json::json!({
            "generation": atlas.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": { "span": 2, "cut": "z+1", "maxZoom": 3 },
            "scopeSchedule": { "k": 0, "cut": "z+1" },
            "limits": { "coloredTypeIds": 32, "edgesTiles": 256, "locateEdges": 512, "locateProperties": 10, "locateLinkProperties": 10, "locateLinkTypeIds": 5, "translateEntityIds": 1024, "authoritySoftSeconds": 480, "authorityHardSeconds": 600 },
            // No createdAt: the fixture dataset has no temporal axes.
        }),
    );
}

#[test]
fn tile_query_defaults_to_the_delta_contract() {
    let query: TileQuery = serde_json::from_str("{}").expect("the empty body parses");
    assert_eq!(query.mode, Mode::Delta);
    assert!(query.colored_type_ids.is_empty());
    assert!(query.filter.is_none());
    assert!(!query.include_detailed_data);

    let query: TileQuery = serde_json::from_str(
        r#"{
            "mode": "total",
            "coloredTypeIds": ["https://example.com/types/thing/v/1"],
            "filter": { "any": [] },
            "includeDetailedData": true
        }"#,
    )
    .expect("the full body parses");
    assert_eq!(query.mode, Mode::Total);
    assert_eq!(query.colored_type_ids.len(), 1);
    assert!(query.filter.is_some());
    assert!(query.include_detailed_data);
}

#[test]
fn atlas_is_shared_across_requests() {
    const fn shared<T: Send + Sync>() {}
    shared::<Atlas>();
}

#[test]
fn open_rejects_an_unpublished_generation() {
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
        endpoints: ArrayFile::open(generation.path_of(&files.edge_endpoints.name))
            .expect("the endpoint artifact should open"),
        ranks: ArrayFile::open(generation.path_of(&files.rank_of_position.name))
            .expect("the rank artifact should open"),
        positions: ArrayFile::open(generation.path_of(&files.position_of_row.name))
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
        filter: None,
        include_detailed_data: false,
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
fn wire_columns(
    atlas: &Atlas,
    sources: &[u32],
    targets: &[u32],
    rows: &[u32],
) -> (
    Vec<WireRow<NodeRowId>>,
    Vec<WireRow<NodeRowId>>,
    Vec<crate::dataset::postgres::id::ArchivedEntityId>,
) {
    let node_codec = test_codec(atlas);
    assert!(rows.is_sorted(), "the derivation supplies ascending rows");

    let wire_sources = sources
        .iter()
        .map(|&source| node_codec.encode(NodeRowId::from_u32(source)))
        .collect();
    let wire_targets = targets
        .iter()
        .map(|&target| node_codec.encode(NodeRowId::from_u32(target)))
        .collect();
    let edge_ids = rows.iter().map(|&row| edge_identity_of(row)).collect();

    (wire_sources, wire_targets, edge_ids)
}

fn expected_edges_bytes(
    generation: &Generation,
    complete: bool,
    sources: &[WireRow<NodeRowId>],
    targets: &[WireRow<NodeRowId>],
    edge_ids: &[crate::dataset::postgres::id::ArchivedEntityId],
) -> Vec<u8> {
    EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete,
        sources,
        targets,
        edge_ids,
        trailer: None,
    }
    .encode()
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_deliver_the_whole_graph_under_full_coverage() {
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
        .edges(&request, EdgesLimits::default(), &FULL, CutOffset::ZERO)
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
    let (sources, targets, rows) = wire_columns(&atlas, &sources, &targets, &rows);
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &sources, &targets, &rows),
    );

    // Identical requests yield identical bytes.
    assert_eq!(
        atlas
            .edges(&request, EdgesLimits::default(), &FULL, CutOffset::ZERO)
            .expect("the repeat should serve"),
        bytes,
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_serve_the_root_visible_subgraph() {
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
    let (sources, targets, edge_rows) = wire_columns(&atlas, &sources, &targets, &edge_rows);
    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let bytes = atlas
        .edges(
            &edges_request(vec![root]),
            EdgesLimits::default(),
            &FULL,
            CutOffset::ZERO,
        )
        .expect("the root should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &sources, &targets, &edge_rows),
    );

    // Listing a tile twice changes nothing: the delivered union
    // deduplicates before the outgoing walk.
    let doubled = atlas
        .edges(
            &edges_request(vec![root, root]),
            EdgesLimits::default(),
            &FULL,
            CutOffset::ZERO,
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
            &FULL,
            CutOffset::ZERO,
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
    let (sources, targets, edge_rows) = wire_columns(&atlas, &sources, &targets, &edge_rows);
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &sources, &targets, &edge_rows),
    );
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
    let mut ranked: Vec<(u32, crate::dataset::postgres::id::ArchivedEntityId, u32)> = endpoints
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
    let (sources, targets, kept) = wire_columns(&atlas, &sources, &targets, &kept);

    let capped = EdgesLimits {
        edges: 2,
        ..EdgesLimits::default()
    };
    let bytes = atlas
        .edges(&edges_request(full_grid()), capped, &FULL, CutOffset::ZERO)
        .expect("the capped request should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, false, &sources, &targets, &kept),
    );

    // A zero cap serves the honest empty truncation.
    let empty = atlas
        .edges(
            &edges_request(full_grid()),
            EdgesLimits {
                edges: 0,
                ..EdgesLimits::default()
            },
            &FULL,
            CutOffset::ZERO,
        )
        .expect("the zero cap should serve");
    assert_eq!(
        empty,
        expected_edges_bytes(&generation, false, &[], &[], &[])
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_reject_and_report_the_contract() {
    let (generation, atlas) = publish("edges-rejects").await;
    let root = TileCoordinate { z: 0, x: 0, y: 0 };

    let mut filtered = edges_request(vec![root]);
    filtered.filter = Some(
        serde_json::from_value::<Filter>(serde_json::json!({ "any": [] }))
            .expect("a filter document deserializes opaquely"),
    );
    assert_eq!(
        atlas.edges(&filtered, EdgesLimits::default(), &FULL, CutOffset::ZERO),
        Err(EdgesError::Unsupported("filter")),
    );

    let mut detailed = edges_request(vec![root]);
    detailed.include_detailed_data = true;
    assert_eq!(
        atlas.edges(&detailed, EdgesLimits::default(), &FULL, CutOffset::ZERO),
        Err(EdgesError::Unsupported("includeDetailedData")),
    );

    assert_eq!(
        atlas.edges(
            &edges_request(vec![root, root]),
            EdgesLimits {
                tiles: 1,
                ..EdgesLimits::default()
            },
            &FULL,
            CutOffset::ZERO,
        ),
        Err(EdgesError::Tiles {
            count: 2,
            maximum: 1,
        }),
    );
    assert_eq!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 4, x: 0, y: 0 }]),
            EdgesLimits::default(),
            &FULL,
            CutOffset::ZERO,
        ),
        Err(EdgesError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 2, x: 4, y: 0 }]),
            EdgesLimits::default(),
            &FULL,
            CutOffset::ZERO,
        ),
        Err(EdgesError::Grid { z: 2, x: 4, y: 0 }),
    );

    // An empty tile list serves the honest empty response, with every
    // column present-empty.
    let bytes = atlas
        .edges(
            &edges_request(Vec::new()),
            EdgesLimits::default(),
            &FULL,
            CutOffset::ZERO,
        )
        .expect("the empty request should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &[], &[], &[])
    );
    assert!(
        section(&bytes, EDGE_IDS)
            .expect("EDGE_IDS is present")
            .is_empty(),
    );
}

/// The edges convenience path rejects the trailer by name.
///
/// The transport path assembles and encodes byte-exactly against the directly built wire document
/// with the interned trailer. Hydration is the transport's store round trip, so the test supplies
/// all-`null` details directly (G6 pins the non-null trailer bytes).
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn detailed_edges_encode_the_hydrated_trailer() {
    use super::hydrate::EdgeLinkDetails;
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
    request.include_detailed_data = true;

    // The convenience path serves storeless deployments: it still
    // rejects the trailer by name.
    assert_eq!(
        atlas.edges(&request, EdgesLimits::default(), &FULL, CutOffset::ZERO),
        Err(EdgesError::Unsupported("includeDetailedData")),
    );

    // The transport path assembles, gathers, hydrates, encodes.
    let document = viewing(&atlas, &FULL, |view| {
        atlas
            .assemble_edges(&request, EdgesLimits::default(), view)
            .expect("assembly ignores the trailer flag")
    });

    let head: u64 = artifacts.morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();
    let (sources, targets, internal_edges) = qualifying_columns(endpoints, &delivered);
    let (sources, targets, edge_ids) = wire_columns(&atlas, &sources, &targets, &internal_edges);

    let entities = atlas.delivered_edge_entities(&document);
    assert_eq!(entities.count(), edge_ids.len());

    let details = EdgeLinkDetails::empty(entities.count());
    let bytes = atlas.encode_edges(&document, Some(&details));

    let no_labels: Vec<Option<&str>> = vec![None; edge_ids.len()];
    let no_types: Vec<Option<u32>> = vec![None; edge_ids.len()];
    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        sources: &sources,
        targets: &targets,
        edge_ids: &edge_ids,
        trailer: Some(EdgesTrailer {
            type_table: &[],
            link_labels: &no_labels,
            link_type_ids: &no_types,
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the trailer rides the pinned envelope");
}

/// Source resolution answers the delivery contract rather than a formula alone.
///
/// The resolved (zoom, cell) tile delivers the row under the cumulative schedule, and at zoom > 0
/// the parent tile's schedule does not. `zoom` is therefore the first visible zoom.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_sources_resolve_to_their_first_visible_tile() {
    let (_generation, atlas) = publish("locate-resolve").await;
    let node_codec = test_codec(&atlas);
    let wire_of = |row: u32| node_codec.encode(NodeRowId::from_u32(row)).get();
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
        assert_eq!(source.row.get(), NodeRowId::from_u32(u32::from(row)));
        assert_eq!(source.position, atlas.positions_of_row()[source.row.get()]);

        // The resolved tile delivers the row.
        let request = TileRequest {
            coordinate: source.cell,
            query: TileQuery {
                mode: Mode::Total,
                ..TileQuery::default()
            },
        };
        let bytes = atlas
            .tile(&request, TileLimits::default(), &FULL, CutOffset::ZERO)
            .expect("the resolved tile serves");
        assert!(
            row_of(&bytes).contains(&wire_of(source.row.get().as_u32())),
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
                .tile(&parent, TileLimits::default(), &FULL, CutOffset::ZERO)
                .expect("the parent tile serves");
            assert!(
                !row_of(&bytes).contains(&wire_of(source.row.get().as_u32())),
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
async fn locate_subgraph_delivers_the_ego_graph() {
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
        expected_rows
            .sort_unstable_by_key(|&row| node_codec.encode(NodeRowId::from_u32(row)).get());
        expected_rows.insert(0, u32::from(source_row));
        let delivered_rows: Vec<u32> = subgraph.rows.iter().map(|row| row.as_u32()).collect();
        assert_eq!(delivered_rows, expected_rows, "ego({source_row}) rows");
        let expected_positions: Vec<BasePosition> = expected_rows
            .iter()
            .map(|&row| atlas.positions_of_row()[NodeRowId::from_u32(row)])
            .collect();
        assert_eq!(
            subgraph.positions, expected_positions,
            "ego({source_row}) positions",
        );

        // Edges deliver ascending by identity bytes - for the
        // fixture, ascending edge row - endpoints straight off the
        // fixture edge list.
        let delivered: Vec<u32> = subgraph
            .edges
            .iter()
            .map(|&(edge, _)| narrow_usize(edge.row.get().as_usize()))
            .collect();
        assert_eq!(delivered, edge_rows, "ego({source_row}) edges");
        for &(edge, id) in &subgraph.edges {
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
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_edge_cap_keeps_the_nearest_partners() {
    use super::locate::LocateLimits;

    let (_generation, atlas) = publish("locate-truncation").await;
    let node_codec = test_codec(&atlas);
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
            .map(|&(edge, _)| narrow_usize(edge.row.get().as_usize()))
            .collect::<Vec<u32>>(),
        [2],
        "the self-loop is the nearest edge",
    );
    // Partner 1's only edge truncated, so partner 1 is not
    // delivered: the source stands alone.
    assert_eq!(capped.rows, [NodeRowId::new(2)]);
    assert_eq!(capped.positions, [source.position]);

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
                .flat_map(|&(edge, _)| [edge.source.as_u32(), edge.target.as_u32()])
                .filter(|&row| row != u32::from(source_row))
                .map(|row| (node_codec.encode(NodeRowId::from_u32(row)).get(), row))
                .collect();
            partner_keys.sort_unstable();
            partner_keys.dedup();
            let mut expected_rows = vec![u32::from(source_row)];
            expected_rows.extend(partner_keys.iter().map(|&(_, row)| row));
            let delivered_rows: Vec<u32> = subgraph.rows.iter().map(|row| row.as_u32()).collect();
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
fn edges_request_parses_the_body_contract() {
    let request: EdgesRequest =
        serde_json::from_str(r#"{ "tiles": [{ "z": 1, "x": 0, "y": 1 }] }"#)
            .expect("the minimal body parses");
    assert_eq!(request.tiles, vec![TileCoordinate { z: 1, x: 0, y: 1 }]);
    assert!(request.filter.is_none());
    assert!(!request.include_detailed_data);

    let request: EdgesRequest = serde_json::from_str(
        r#"{
            "tiles": [],
            "filter": { "any": [] },
            "includeDetailedData": true
        }"#,
    )
    .expect("the full body parses");
    assert!(request.tiles.is_empty());
    assert!(request.filter.is_some());
    assert!(request.include_detailed_data);
}

/// A colored request mixing resolvable and unresolvable ids over the published fixture.
///
/// `TYPE_MASK` rides the request at full shape, unresolvable ids read 0 in every mask, and a
/// fixture type URL resolves to real bits.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn colored_requests_resolve_fixture_types_and_zero_unknowns() {
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
        .tile(&colored, TileLimits::default(), &FULL, CutOffset::ZERO)
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
async fn foreign_key_kinds_fail_the_open() {
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
fn colored_masks_resolve_and_expand_descendants() {
    use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};

    use super::colour;
    use crate::{
        dataset::postgres::id::ArchivedOntologyTypeUuid,
        file::{identity::read::IdentityFile, postings::read::PostingsFile},
        salt::{
            fit::prepare::identity::{IdentityTable, IdentityTableArchive},
            postings::{
                artifact::PostingsArchive,
                build::{Postings, PostingsConfig},
                closure::ClosureMap,
            },
        },
    };

    /// The fixture's [`PostingsConfig::dense_threshold`].
    const FIXTURE_DENSE_THRESHOLD: Log2 = Log2::new(2).expect("2 lies below the shift width");

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

    let postings = Postings::build(
        &types,
        IdSlice::from_raw(&row_of_position),
        &parents,
        PostingsConfig {
            dense_threshold: FIXTURE_DENSE_THRESHOLD,
        },
    )
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
    let closure = ClosureMap::new(&postings).expect("the parent graph is acyclic");

    // One versioned URL per type row; the table keys each row by the
    // uuid its URL derives, exactly as the store's identities would.
    let urls: Vec<String> = (0..4)
        .map(|row| format!("https://example.com/types/fixture-{row}/v/1"))
        .collect();
    let mut table = IdentityTable::<OntologyRowId, ArchivedOntologyTypeUuid>::new();
    for url in &urls {
        let parsed: VersionedUrl = url.parse().expect("the fixture URL parses");
        table.push(ArchivedOntologyTypeUuid::from(
            OntologyTypeUuid::from_url(&parsed).into_uuid(),
        ));
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

/// The detailed-tile path.
///
/// Assembly, entity gathering, and encoding with a hydrated trailer, spliced where the transport
/// awaits the store.
///
/// The gathered entities carry the fixture's rewritten store-width ids; hydration itself is the
/// transport's store round trip, so the test supplies all-`null` details directly. The encoded
/// bytes must equal the wire document built directly with the trailer.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
#[expect(
    clippy::single_range_in_vec_init,
    reason = "an array of one range is what a root delta delivery IS"
)]
async fn detailed_tiles_encode_the_hydrated_trailer() {
    use super::hydrate::NodeDetails;
    use crate::{
        math::{Bounds2, Vec2},
        salt::wire::tile::{GlobalHead, TileTrailer},
    };

    let (generation, atlas) = publish("detailed-trailer").await;
    let Artifacts {
        quad,
        morton,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = fixture_row_ids(&rows);

    // The convenience path serves storeless deployments: it still
    // rejects the trailer by name.
    let mut detailed = request(0, 0, 0, Mode::Delta);
    detailed.query.include_detailed_data = true;
    assert_eq!(
        atlas.tile(&detailed, TileLimits::default(), &FULL, CutOffset::ZERO),
        Err(TileError::Unsupported("includeDetailedData")),
    );

    // The transport path assembles, gathers, hydrates, encodes.
    let document = viewing(&atlas, &FULL, |view| {
        atlas
            .assemble_tile(&detailed, TileLimits::default(), view)
            .expect("assembly ignores the trailer flag")
    });
    let entities = atlas.delivered_entities(&document);

    let delivered: u64 = morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
        .iter()
        .sum();
    let delivered = usize::try_from(delivered).expect("fixture counts fit usize");
    assert_eq!(entities.count(), delivered);

    // Hydration is the transport's store round trip; the encode path
    // under test takes its details directly, all-null here, and the
    // encoded envelope equals the directly built wire document.
    let details = NodeDetails::empty(entities.count());
    let bytes = atlas.encode_tile(&document, Some(&details));

    let nothing: Vec<Option<&str>> = vec![None; delivered];
    let end = u32::try_from(delivered).expect("fixture counts fit u32");
    let expected = TileResponse {
        head: TileHead {
            generation: atlas.generation().digest(),
            variant: 0,
            coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
            mode: Mode::Delta,
            visible: morton.count(),
            first_bucket: 0,
            runs: &morton.fenceposts().lengths()[..=usize::from(FIXTURE_LOD.span.get())]
                .iter()
                .map(|&length| u32::try_from(length).expect("fixture counts fit u32"))
                .collect::<Vec<_>>(),
            global: Some(GlobalHead {
                visible: delivered as u64,
                // The fixture's random points span both axes, so the
                // frame extent anchors at the full wire square.
                bounds: Some(
                    Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
                        .expect("the wire square is a valid extent"),
                ),
                min_resolution: morton
                    .fenceposts()
                    .lengths()
                    .iter()
                    .rposition(|&length| length > 0)
                    .map_or(0, |bucket| bucket as u64),
            }),
            children: (0..4).fold(0_u8, |bits, quadrant| {
                bits | (u8::from(quad.nodes()[0].child(quadrant).is_some()) << quadrant)
            }),
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[
            BasePosition::from_u32(0)..BasePosition::from_u32(end)
        ]),
        positions: IdSlice::from_raw(points),
        rows: IdSlice::from_raw(&{
            let node_codec = test_codec(&atlas);
            row_ids
                .iter()
                .map(|&row| node_codec.encode(NodeRowId::from_u32(row)))
                .collect::<Vec<_>>()
        }),
        masks: None,
        trailer: Some(TileTrailer {
            labels: &nothing,
            icons: &nothing,
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the trailer path is byte-exact");
}

/// One synthetic entity identity per seed byte, plus its upstream string form.
fn entity_id_of(seed: u8) -> crate::dataset::postgres::id::ArchivedEntityId {
    crate::dataset::postgres::id::ArchivedEntityId {
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
fn test_codec(atlas: &Atlas) -> codec::RowCodec<NodeRowId> {
    codec::RowCodec::derive(
        &WireSecret::new(TEST_WIRE_SECRET),
        atlas.generation(),
        codec::NODE_LABEL,
        narrow_usize(atlas.row_ids().len()),
    )
}

/// Derives a fixture edge row's link-entity identity from the seeding rule.
///
/// Identity bytes ascend with the edge row, because `entity_id_of` leads with its seed byte.
/// Ascending internal row order is therefore the wire's ascending-identity delivery order for the
/// fixture.
fn edge_identity_of(row: u32) -> crate::dataset::postgres::id::ArchivedEntityId {
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
    ids: &[crate::dataset::postgres::id::ArchivedEntityId],
) -> crate::salt::fit::prepare::identity::IdentityTableArchive<
    crate::dataset::postgres::id::ArchivedEntityId,
    R,
> {
    use crate::{
        dataset::postgres::id::ArchivedEntityId, file::identity::read::IdentityFile,
        salt::fit::prepare::identity::IdentityTable,
    };

    let mut table = IdentityTable::<R, ArchivedEntityId>::new();
    for &id in ids {
        table.push(id);
    }
    let mut file = std::fs::File::create(path).expect("the identity file creates");
    let empty =
        <crate::dataset::auxiliary::Label as zerocopy::TryFromBytes>::try_ref_from_bytes(&[])
            .expect("every payload type admits the empty byte string");
    let _digest = table
        .write_into(core::iter::repeat_n(empty, ids.len()), &mut file)
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
fn translate_resolves_nodes_and_edges_by_identity() {
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
    let node_codec = codec::RowCodec::derive(
        &WireSecret::new(TEST_WIRE_SECRET),
        codec_generation(),
        codec::NODE_LABEL,
        3,
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
        &TranslateColumns {
            node_ids: &nodes,
            edge_ids: &edges,
            positions: IdSlice::from_raw(&positions),
            position_of_row: IdSlice::from_raw(&position_of_row),
            endpoints: IdSlice::from_raw(&endpoints),
            node_codec: &node_codec,
        },
    )
    .expect("the request is under the cap");

    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(2),
            TranslatedNode {
                id: node_codec.encode(NodeRowId::new(1)),
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
                source: node_codec.encode(NodeRowId::new(0)),
                target: node_codec.encode(NodeRowId::new(1)),
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
        1,
    );
    assert_eq!(
        translate(
            over,
            TranslateLimits::default(),
            &FULL,
            &TranslateColumns {
                node_ids: &nodes,
                edge_ids: &edges,
                positions: IdSlice::from_raw(&[]),
                position_of_row: IdSlice::from_raw(&[]),
                endpoints: IdSlice::from_raw(&[]),
                node_codec: &node_codec,
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
async fn translate_resolves_store_identities_end_to_end() {
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
                id: node_codec.encode(NodeRowId::new(0)),
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
                source: node_codec.encode(NodeRowId::new(0)),
                target: node_codec.encode(NodeRowId::new(1)),
            },
        )],
    );
}

/// Shorthand for a null-valued property entry.
fn property(name: &str) -> (String, super::hydrate::SimpleValue) {
    (name.to_owned(), super::hydrate::SimpleValue::Null)
}

#[test]
fn simple_properties_parse_every_simple_shape() {
    use super::hydrate::SimpleValue;

    // The store renders 2.5 and 1.0 with their points, so both read
    // as doubles; a number beyond i64 falls back to f64 (the wire's
    // integer is i64 - the simple-value shapes carry no wider integral form).
    let mut entries = super::hydrate::select::simple_properties(
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
    );
    entries.sort_by(|left, right| left.0.cmp(&right.0));

    let expected = [
        ("https://x.test/f/", SimpleValue::Float(2.5)),
        ("https://x.test/g/", SimpleValue::Float(1.0)),
        ("https://x.test/i/", SimpleValue::Integer(7)),
        ("https://x.test/j/", SimpleValue::Integer(-3)),
        ("https://x.test/n/", SimpleValue::Null),
        ("https://x.test/t/", SimpleValue::Text("text".to_owned())),
        // u64::MAX itself is not an f64, so the fallback rounds to the
        // nearest double.
        (
            "https://x.test/u/",
            SimpleValue::Float(1.844_674_407_370_955_2e19),
        ),
        ("https://x.test/y/", SimpleValue::Boolean(true)),
    ];
    assert_eq!(
        entries,
        expected
            .into_iter()
            .map(|(name, value)| (name.to_owned(), value))
            .collect::<Vec<_>>(),
    );
}

#[test]
#[should_panic(expected = "the store renders a JSON object")]
fn simple_properties_reject_non_objects() {
    let _entries = super::hydrate::select::simple_properties("[1, 2]");
}

#[test]
fn select_properties_drop_reverse_lexicographically() {
    let entries = vec![
        property("b/"),
        property("d/"),
        property("a/"),
        property("c/"),
    ];

    // Under the cap: nothing drops, output ascends by name.
    assert_eq!(
        super::hydrate::select::select_properties(entries.clone(), None, 4),
        vec![
            property("a/"),
            property("b/"),
            property("c/"),
            property("d/")
        ],
    );

    // Over the cap: d/ drops first, then c/ - the largest names go.
    assert_eq!(
        super::hydrate::select::select_properties(entries, None, 2),
        vec![property("a/"), property("b/")],
    );
}

#[test]
fn select_properties_protect_the_label_to_the_end() {
    let entries = vec![property("a/"), property("b/"), property("z/")];

    // z/ is reverse-lexicographically first to drop, but it is the
    // label property: it survives every cap that admits at least
    // one property, and the survivors still emit ascending.
    assert_eq!(
        super::hydrate::select::select_properties(entries.clone(), Some("z/"), 2),
        vec![property("a/"), property("z/")],
    );
    assert_eq!(
        super::hydrate::select::select_properties(entries.clone(), Some("z/"), 1),
        vec![property("z/")],
    );

    // A cap of zero admits nothing - even the label drops.
    assert_eq!(
        super::hydrate::select::select_properties(entries, Some("z/"), 0),
        vec![],
    );
}

/// One locate request built directly.
fn locate_request(entity_id: String) -> super::LocateRequest {
    super::LocateRequest {
        entity_id: Some(entity_id),
        row: None,
        colored_type_ids: Vec::new(),
        filter: None,
    }
}

/// Encodes one assembled locate document with all-`null` details.
///
/// Hydration is the transport's store round trip; empty details stand in for it everywhere the
/// test subject is the assembly and envelope, not the hydrated content.
fn encode_unhydrated(atlas: &Atlas, document: &LocateDocument) -> Vec<u8> {
    let nodes = atlas.locate_node_entities(document);
    let links = atlas.locate_link_entities(document);
    let node_details = super::hydrate::LocateNodeDetails::empty(nodes.count());
    let link_details = super::hydrate::LocateLinkDetails::empty(links.count());
    atlas.encode_locate(document, &node_details, &link_details)
}

/// A locate source names one subject in one of two identity domains.
///
/// A by-`row` request resolves through the wire codec's ingress, pure arithmetic with no store, and
/// answers the same response bytes as the by-`entityId` request for that node. A wire value outside
/// the encoded image collapses into `unknown-entity`, and `assemble_locate` rejects a body carrying
/// both or neither source field by name with its count.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_by_wire_row_matches_by_entity() {
    let (_generation, atlas) = publish("locate-by-row").await;
    let limits = ServeLimits::default();
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);

    // Row 7's wire id round-trips by construction (the codec is a
    // bijection); the equivalence under test is the two request
    // paths, whose agreement is the whole contract in one assertion.
    let node_codec = test_codec(&atlas);
    let wire = node_codec.encode(NodeRowId::new(7));
    let by_entity = locate_request(entity_string_of(7));
    let mut by_row: super::LocateRequest =
        serde_json::from_value(serde_json::json!({ "row": wire.get() }))
            .expect("a by-row body deserializes");
    assert_eq!(by_row.row, Some(wire));
    assert_eq!(by_row.entity_id, None);
    let entity_document = atlas
        .assemble_locate(&by_entity, limits, &view)
        .expect("the entity resolves");
    let row_document = atlas
        .assemble_locate(&by_row, limits, &view)
        .expect("the wire row resolves");
    assert_eq!(
        encode_unhydrated(&atlas, &entity_document),
        encode_unhydrated(&atlas, &row_document),
        "one node, two source domains, identical bytes",
    );

    // Wire ids are sparse in the u32 range: a value outside the
    // encoded image collapses into the entity path's own rejection.
    // Neither probe collides with the 48-value image under the
    // fixture key - pinned here, not left to runtime luck.
    let image: HashSet<u32> = (0..48)
        .map(|row| node_codec.encode(NodeRowId::from_u32(row)).get())
        .collect();
    assert!(
        !image.contains(&48) && !image.contains(&u32::MAX),
        "the probes lie outside the image",
    );
    for garbage in [48, u32::MAX] {
        by_row.row = Some(codec::WireRow::pinned(garbage));
        assert_eq!(
            atlas
                .assemble_locate(&by_row, limits, &view)
                .expect_err("the value is outside the universe"),
            super::LocateError::UnknownEntity,
            "{garbage}",
        );
    }

    // Both sources or none: rejected by name, with the count.
    by_row.row = Some(wire);
    by_row.entity_id = Some(entity_string_of(7));
    assert_eq!(
        atlas
            .assemble_locate(&by_row, limits, &view)
            .expect_err("two sources are ambiguous"),
        super::LocateError::Source { carried: 2 },
    );
    by_row.row = None;
    by_row.entity_id = None;
    assert_eq!(
        atlas
            .assemble_locate(&by_row, limits, &view)
            .expect_err("no source names no subject"),
        super::LocateError::Source { carried: 0 },
    );
}

/// The locate transport path encodes byte-exactly against the derived wire document.
///
/// Assembly and encoding against the groundwork layers' own outputs, all-`null` details standing
/// in for hydration: the mandatory trailer rides empty tables and null columns, and both source
/// completeness flags read `false` - an unhydrated source can attest nothing.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_end_to_end_encodes_the_pinned_envelope() {
    use crate::salt::{
        postings::artifact::Membership,
        wire::locate::{LocateResponse, LocateTrailer},
    };

    let (generation, atlas) = publish("locate-endpoint").await;
    let limits = ServeLimits::default();
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);

    let mut request = locate_request(entity_string_of(0));
    let document = atlas
        .assemble_locate(&request, limits, &view)
        .expect("the request is well-formed");
    let bytes = encode_unhydrated(&atlas, &document);
    assert_eq!(bytes[0..8], *b"SALTILEL");

    // The groundwork layers derive the expectation independently;
    // their own tests pin their behaviour.
    let source = atlas
        .resolve_source(&view, &entity_string_of(0))
        .expect("row 0 is a node");
    let subgraph = atlas.locate_subgraph(source, limits.locate, &view);
    let node_codec = test_codec(&atlas);
    let wire_of = |row: NodeRowId| node_codec.encode(row);
    let sources: Vec<WireRow<NodeRowId>> = subgraph
        .edges
        .iter()
        .map(|&(edge, _)| wire_of(edge.source))
        .collect();
    let targets: Vec<WireRow<NodeRowId>> = subgraph
        .edges
        .iter()
        .map(|&(edge, _)| wire_of(edge.target))
        .collect();
    let edge_ids: Vec<crate::dataset::postgres::id::ArchivedEntityId> =
        subgraph.edges.iter().map(|&(_, id)| id).collect();
    let wire_rows: Vec<WireRow<NodeRowId>> =
        atlas.row_ids().iter().map(|&row| wire_of(row)).collect();
    let nodes = subgraph.rows.len();
    let edges = subgraph.edges.len();
    let no_labels: Vec<Option<&str>> = vec![None; nodes];
    let no_types: Vec<Option<u32>> = vec![None; nodes];
    let no_link_labels: Vec<Option<&str>> = vec![None; edges];
    let no_lists: Vec<Vec<u32>> = vec![Vec::new(); edges];
    let no_flags: Vec<bool> = vec![false; edges];
    let no_maps: Vec<Option<&[(u32, crate::salt::wire::locate::PropertyValue<'_>)]>> =
        vec![None; edges];
    let response = |masks: Option<&[Membership<'_>]>| {
        LocateResponse {
            generation: generation.id().digest(),
            variant: 0,
            cell: source.cell,
            complete: subgraph.complete,
            entity_id: entity_id_of(0),
            type_ids_complete: false,
            properties_complete: false,
            delivered: &subgraph.positions,
            positions: atlas.positions(),
            rows: IdSlice::from_raw(&wire_rows),
            masks,
            sources: &sources,
            targets: &targets,
            edge_ids: &edge_ids,
            trailer: LocateTrailer {
                type_table: &[],
                property_table: &[],
                labels: &no_labels,
                type_ids: &no_types,
                properties: None,
                link_labels: &no_link_labels,
                link_type_ids: &no_lists,
                link_type_ids_complete: &no_flags,
                link_properties: &no_maps,
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
    let colored_document = atlas
        .assemble_locate(&request, limits, &view)
        .expect("unresolvable colored ids are legal");
    assert_eq!(
        encode_unhydrated(&atlas, &colored_document),
        response(Some(&[Membership::List(&[])]))
    );
}

/// Every locate rejection carries its name.
///
/// The unknown-entity doctrine treats unparsable, unknown, and wrong-domain ids identically.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_rejections_carry_their_names() {
    let (_generation, atlas) = publish("locate-rejects").await;
    let limits = ServeLimits::default();
    let bound = Bound::of(&atlas, &FULL);
    let view = bound.view(&atlas);

    // Unparsable, unknown, and an EDGE id (wrong identity domain)
    // are one rejection: an id that cannot name a visible node.
    for id in [
        "not an entity id".to_owned(),
        entity_string_of(50),
        entity_string_of(EDGE_SEED),
    ] {
        assert_eq!(
            atlas
                .assemble_locate(&locate_request(id.clone()), limits, &view)
                .expect_err("the id names no visible node"),
            super::LocateError::UnknownEntity,
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
    assert_eq!(
        atlas
            .assemble_locate(&colored, limits, &view)
            .expect_err("the list is over the cap"),
        super::LocateError::Types {
            count: limits.tile.colored_type_ids as usize + 1,
            maximum: limits.tile.colored_type_ids,
        },
    );

    // Version 0 rejects filter by name.
    let filtered: super::LocateRequest = serde_json::from_value(serde_json::json!({
        "entityId": entity_string_of(0),
        "filter": {},
    }))
    .expect("a filter body deserializes");
    assert_eq!(
        atlas
            .assemble_locate(&filtered, limits, &view)
            .expect_err("filter is a version-0 deferral"),
        super::LocateError::Unsupported("filter"),
    );
}

/// The intern tables are the sorted, deduplicated unions of every reference.
///
/// The property maps lead with the source's and keep each entity's ascending-name order as
/// ascending indexes; node type references take the first direct type, link references keep
/// canonical order. `None` marks an unresolved entity, an empty list a resolved one without
/// surviving entries.
#[test]
fn intern_tables_build_the_references() {
    use super::{
        hydrate::SimpleValue,
        locate::{intern_properties, intern_types},
    };
    use crate::salt::wire::locate::PropertyValue;

    let owned = |name: &str, value: SimpleValue| (format!("https://x.test/{name}/"), value);
    let source = vec![
        owned("b", SimpleValue::Text("t".to_owned())),
        owned("d", SimpleValue::Integer(7)),
    ];
    let links = vec![
        None,
        Some(vec![
            owned("a", SimpleValue::Null),
            owned("b", SimpleValue::Boolean(true)),
        ]),
        Some(vec![]),
    ];

    let (names, maps) = intern_properties(Some(&source), &links);
    assert_eq!(
        names.entries(),
        [
            "https://x.test/a/",
            "https://x.test/b/",
            "https://x.test/d/"
        ],
    );
    assert_eq!(
        maps,
        vec![
            Some(vec![
                (1, PropertyValue::Text("t")),
                (2, PropertyValue::Integer(7)),
            ]),
            None,
            Some(vec![
                (0, PropertyValue::Null),
                (1, PropertyValue::Boolean(true)),
            ]),
            Some(vec![]),
        ],
    );

    // An absent source stays the leading entry.
    let (names, maps) = intern_properties(None, &links[..2]);
    assert_eq!(names.entries(), ["https://x.test/a/", "https://x.test/b/"]);
    assert_eq!(
        maps,
        vec![
            None,
            None,
            Some(vec![
                (0, PropertyValue::Null),
                (1, PropertyValue::Boolean(true)),
            ]),
        ],
    );

    // Types: nodes contribute their FIRST direct type, links their
    // whole capped lists in canonical (unsorted) order.
    let url = |name: &str| format!("https://t.test/{name}/v/1");
    let nodes = vec![vec![url("m"), url("z")], Vec::new(), vec![url("a")]];
    let link_types = vec![vec![url("z"), url("a")], Vec::new()];
    let (table, type_ids, link_type_ids) = intern_types(&nodes, &link_types);
    // The node-only type "m" interns; the node-second "z" also
    // interns through the link list.
    assert_eq!(
        table.entries(),
        [
            "https://t.test/a/v/1",
            "https://t.test/m/v/1",
            "https://t.test/z/v/1"
        ],
    );
    assert_eq!(type_ids, vec![Some(1), None, Some(0)]);
    assert_eq!(link_type_ids, vec![vec![2, 0], Vec::new()]);
}

/// The source coverage predicate reads exactly the ratified rule.
///
/// `directTypes \u{2286} coloredTypeIds`, with `false` for a store-absent source, an unrecorded
/// type list, and an empty palette.
#[test]
fn source_type_coverage_follows_the_subset_rule() {
    use super::{colour::Palette, locate::covers_source_types};

    let url = |name: &str| format!("https://t.test/{name}/v/1");
    let parsed = |name: &str| url(name).parse().expect("test urls parse");
    let colored = Palette::of(&[parsed("a"), parsed("b")]);

    // In the ratified example the source carries {a, c} and the
    // request colours {a, b}, so coverage fails because c is outside
    // the set.
    assert!(!covers_source_types(true, &[url("a"), url("c")], &colored));
    assert!(covers_source_types(true, &[url("a")], &colored));
    assert!(covers_source_types(true, &[url("b"), url("a")], &colored));

    // Coverage compares parsed identities: a non-canonical spelling
    // of a palette type still covers.
    assert!(covers_source_types(
        true,
        &["https://t.test/a/v/01".to_owned()],
        &colored,
    ));

    // An empty palette covers nothing, an unreadable or unrecorded
    // type list attests nothing, and nothing covers an unparsable
    // direct type.
    assert!(!covers_source_types(true, &[url("a")], &Palette::of(&[])));
    assert!(!covers_source_types(true, &[], &colored));
    assert!(!covers_source_types(false, &[url("a")], &colored));
    assert!(!covers_source_types(
        true,
        &["not a versioned url".to_owned()],
        &colored,
    ));
}

/// A proof hiding exactly `hidden` among the atlas's node rows, and no link rows.
///
/// The link mask admits every link row of the generation, so a battery built on this helper varies
/// the node axis alone.
fn mask_hiding(atlas: &Atlas, hidden: &[u32]) -> VisibilityProof {
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
