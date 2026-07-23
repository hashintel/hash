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
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;
use smallvec::smallvec;
use zerocopy::{LE, U64};

use super::{
    Atlas, EdgesCaps, EdgesError, EdgesRequest, Filter, GenerationId, GenerationRoot, Mode,
    ServeCaps, TileCaps, TileCoordinate, TileError, TileQuery, TileRequest, VisibilityProof, codec,
    error::OpenAtlasError,
};

/// The tests' default authority: the operator proof, byte-identical to the pre-visibility serve.
const FULL: VisibilityProof = VisibilityProof::full_visibility();
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node as CorpusNode, NodeRowId, Ontology, OntologyRowId,
        PROJECTOR_DIMENSIONS, card::Card, memory::MemoryDataset,
    },
    file::{
        WriteInto as _, array::ArrayFile, generation::Generation, morton::read::MortonFile,
        quad::read::QuadFile, region::ByteStable,
    },
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, Log2, VecN},
    morton::{Depth, MortonCell, MortonKey},
    salt::{
        CardEmbedder, ClassifierFitConfig, EmbedderFingerprint, SelectionOptions, TrainingRow,
        TrainingSet,
        fit::{ClassifierInput, FitConfig, PlacementOptions, fit},
        fit_classifier,
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
/// Row 2 carries a self-loop; rows 3 and 4 are a reciprocal pair sharing both endpoints.
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
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x5E4E);
    let mut canonical = HashMap::new();

    let nodes = (0..NODES)
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
                ontology: smallvec![OntologyRowId::from_index(row & 1)],
                embedding: BoxedVecN::new(&VecN::new(components)),
                confidence: None,
            }
        })
        .collect();

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
    let embeddings = AlignedVecN::from_slice(storage.as_array()).expect("boxed storage is aligned");

    let rows: Vec<TrainingRow> = [
        ([0.7, 0.2, 0.1], b"group-a" as &[u8]),
        ([0.2, 0.6, 0.2], b"group-b"),
        ([0.1, 0.2, 0.7], b"group-c"),
        ([0.3, 0.4, 0.3], b"group-d"),
    ]
    .into_iter()
    .map(|(target, group)| {
        let mut hasher = Sha256::new();
        hasher.update(group);
        TrainingRow {
            target,
            weight: 1.0,
            group: hasher.finalize(),
        }
    })
    .collect();

    let training = TrainingSet::new(embeddings, &rows).expect("the fixture corpus validates");
    let classifier = fit_classifier(training, ClassifierFitConfig { folds: 2, .. })
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
/// rejects loudly.
async fn fit_fixture(name: &str) -> (GenerationRoot, Generation) {
    let root = GenerationRoot::new(scratch(name)).expect("the root should open");
    let published = fit(
        &fixture_dataset(),
        &HashEmbedder,
        &fixture_config(),
        &fixture_classifier(),
        None,
        None,
        &root,
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
/// trusts the metadata document's hash, not per-file digests (those are verified by tooling), so
/// the rewritten artifacts serve.
fn store_identities(generation: &Generation) {
    use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};

    use crate::{
        dataset::{ArchivedEntityId, ArchivedOntologyTypeUuid},
        file::identity::read::IdentityFile,
        salt::fit::prepare::identity::IdentityTable,
    };

    let files = &generation.repository().files;
    let rows_of = |name: &crate::file::repository::FileName| {
        IdentityFile::open(generation.path_of(name))
            .expect("the published identity artifact opens")
            .rows()
    };

    let ontology_rows = rows_of(&files.ontology_identities.name);
    let mut ontology = IdentityTable::<ArchivedOntologyTypeUuid>::new();
    for row in 0..ontology_rows {
        let url: VersionedUrl = fixture_type_url(row)
            .parse()
            .expect("the fixture URL parses");
        ontology.push(ArchivedOntologyTypeUuid::from(
            OntologyTypeUuid::from_url(&url).into_uuid(),
        ));
    }

    let entity_table = |rows: u64, seed: u8| {
        let mut table = IdentityTable::<ArchivedEntityId>::new();
        for row in 0..rows {
            let row = u8::try_from(row).expect("fixture row counts fit u8");
            table.push(entity_id_of(seed + row));
        }
        table
    };
    let nodes = entity_table(rows_of(&files.node_identities.name), 0);
    let edges = entity_table(rows_of(&files.edge_identities.name), EDGE_SEED);

    rewrite_identities(
        generation.path_of(&files.ontology_identities.name),
        &ontology,
    );
    rewrite_identities(generation.path_of(&files.node_identities.name), &nodes);
    rewrite_identities(generation.path_of(&files.edge_identities.name), &edges);
}

/// Overwrites one identity artifact with a hand-built table.
fn rewrite_identities<I>(
    path: camino::Utf8PathBuf,
    table: &crate::salt::fit::prepare::identity::IdentityTable<I>,
) where
    I: ByteStable,
{
    let mut file = std::fs::File::create(path).expect("the identity artifact rewrites");
    let _digest = table
        .write_into(&mut file)
        .expect("the identities should write");
}

/// Publishes one fixture generation with store-width identities and opens its serving surface.
async fn publish(name: &str) -> (Generation, Atlas) {
    let (root, generation) = fit_fixture(name).await;
    store_identities(&generation);
    let atlas = Atlas::open(&root, generation.id()).expect("the atlas should open");

    (generation, atlas)
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
    let row_ids = rows.u32_elements().expect("the row column is u32");

    // The root delta delivers buckets 0..=m: the head of the base
    // order, sized by the fencepost lengths.
    let bytes = atlas
        .tile(&request(0, 0, 0, Mode::Delta), TileCaps::default(), &FULL)
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
        "TYPE_MASK is absent without coloring",
    );
    assert!(section(&bytes, MASS).is_none(), "MASS is reserved-absent");

    // The wire column carries the codec's ids: encode the head of
    // the base order through the independent derivation.
    let node_codec = test_codec(&atlas);
    let expected_rows: Vec<u8> = row_ids[..head]
        .iter()
        .flat_map(|&row| node_codec.encode(row).get().to_le_bytes())
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
        .tile(&request(0, 0, 0, Mode::Total), TileCaps::default(), &FULL)
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
                TileCaps::default(),
                &FULL,
            )
            .expect("every node tile should serve");
        let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));

        let run = quad.nodes()[node as usize].run();
        assert_eq!(tile_rows.len() as u64, run.end - run.start);
        delivered_rows.extend(tile_rows);
    }

    let mut expected: Vec<u32> = row_ids
        .iter()
        .map(|&row| node_codec.encode(row).get())
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
    let row_ids = rows.u32_elements().expect("the row column is u32");

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
            backfilled: 0,
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[]),
        positions: points,
        rows: row_ids,
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
                TileCaps::default(),
                &FULL,
            )
            .expect("the empty tile should serve"),
        expected,
    );

    // At the deepest zoom a total tile delivers its cell's whole
    // population: the cut reaches the catch-all bucket.
    let deep_cell = MortonKey::from_bits(morton.codes()[0].get())
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
            TileCaps::default(),
            &FULL,
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
        atlas.tile(&request(4, 0, 0, Mode::Delta), TileCaps::default(), &FULL),
        Err(TileError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.tile(&request(2, 4, 0, Mode::Delta), TileCaps::default(), &FULL),
        Err(TileError::Grid { z: 2, x: 4, y: 0 }),
    );

    let mut colored = request(0, 0, 0, Mode::Delta);
    colored.query.colored_type_ids = vec![
        "https://example.com/types/thing/v/1".to_owned();
        TileCaps::default().colored_type_ids as usize + 1
    ];
    assert_eq!(
        atlas.tile(&colored, TileCaps::default(), &FULL),
        Err(TileError::Types {
            count: TileCaps::default().colored_type_ids as usize + 1,
            maximum: TileCaps::default().colored_type_ids,
        }),
    );

    let mut filtered = request(0, 0, 0, Mode::Delta);
    filtered.query.filter = Some(
        serde_json::from_value::<Filter>(serde_json::json!({ "any": [] }))
            .expect("a filter document deserializes opaquely"),
    );
    assert_eq!(
        atlas.tile(&filtered, TileCaps::default(), &FULL),
        Err(TileError::Unsupported("filter"))
    );

    let mut detailed = request(0, 0, 0, Mode::Delta);
    detailed.query.include_detailed_data = true;
    assert_eq!(
        atlas.tile(&detailed, TileCaps::default(), &FULL),
        Err(TileError::Unsupported("includeDetailedData")),
    );

    let manifest = serde_json::to_value(atlas.manifest(ServeCaps::default().limits()))
        .expect("the manifest serializes");
    assert_eq!(
        manifest,
        serde_json::json!({
            "generation": atlas.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": { "span": 2, "cut": "z+1", "maxZoom": 3 },
            "limits": { "coloredTypeIds": 32, "edgesTiles": 256, "locateEdges": 512, "locateProperties": 10, "locateLinkProperties": 10, "locateLinkTypeIds": 5, "translateEntityIds": 1024, "sealSoftSeconds": 600, "sealHardSeconds": 900 },
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
        Atlas::open(&root, id),
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
) -> (Vec<u32>, Vec<u32>, Vec<[u8; 32]>) {
    let node_codec = test_codec(atlas);
    assert!(rows.is_sorted(), "the derivation supplies ascending rows");

    let wire_sources = sources
        .iter()
        .map(|&source| node_codec.encode(source).get())
        .collect();
    let wire_targets = targets
        .iter()
        .map(|&target| node_codec.encode(target).get())
        .collect();
    let edge_ids = rows.iter().map(|&row| edge_identity_of(row)).collect();

    (wire_sources, wire_targets, edge_ids)
}

fn expected_edges_bytes(
    generation: &Generation,
    complete: bool,
    sources: &[u32],
    targets: &[u32],
    edge_ids: &[[u8; 32]],
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
        .u64_pairs()
        .expect("the endpoint column is u64 pairs");

    // The endpoint artifact follows the dataset stream order, which
    // the derivations below lean on.
    assert_eq!(endpoints.len(), FIXTURE_EDGES.len());
    for (&(_, source, target), &actual) in FIXTURE_EDGES.iter().zip(endpoints) {
        assert_eq!([source, target], actual);
    }

    let request = edges_request(full_grid());
    let bytes = atlas
        .edges(&request, EdgesCaps::default(), &FULL)
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
            .edges(&request, EdgesCaps::default(), &FULL)
            .expect("the repeat should serve"),
        bytes,
    );
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_serve_the_root_visible_subgraph() {
    let (generation, atlas) = publish("edges-root").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_pairs()
        .expect("the endpoint column is u64 pairs");

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
        .edges(&edges_request(vec![root]), EdgesCaps::default(), &FULL)
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
            EdgesCaps::default(),
            &FULL,
        )
        .expect("the doubled root should serve");
    assert_eq!(doubled, bytes);
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn edges_exclude_partially_delivered_pairs() {
    let (generation, atlas) = publish("edges-cross").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let codes = artifacts.morton.codes();
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_pairs()
        .expect("the endpoint column is u64 pairs");
    let positions = edge_artifacts
        .positions
        .u32_elements()
        .expect("the position permutation is u32");

    let depth = Depth::new(FIXTURE_LOD.max_tile_depth).expect("the deepest tile depth is valid");
    let cell_of_row = |row: u64| {
        let position = positions[usize::try_from(row).expect("fixture rows fit usize")];
        MortonKey::from_bits(codes[position as usize].get()).cell(depth)
    };

    // An edge whose endpoints land in different deepest-zoom cells:
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
            EdgesCaps::default(),
            &FULL,
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
        .u64_pairs()
        .expect("the endpoint column is u64 pairs");
    let ranks = edge_artifacts
        .ranks
        .u32_elements()
        .expect("the rank column is u32");
    let positions = edge_artifacts
        .positions
        .u32_elements()
        .expect("the position permutation is u32");
    let rank_of_row =
        |row: u64| ranks[positions[usize::try_from(row).expect("fixture rows fit usize")] as usize];

    // Under full coverage every edge qualifies; the cap keeps the
    // two whose worse endpoint ranks best - ties on identity bytes,
    // which for the fixture ascend with the edge row - emitted in
    // ascending identity order.
    let mut ranked: Vec<(u32, [u8; 32], u32)> = endpoints
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

    let capped = EdgesCaps {
        edges: 2,
        ..EdgesCaps::default()
    };
    let bytes = atlas
        .edges(&edges_request(full_grid()), capped, &FULL)
        .expect("the capped request should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, false, &sources, &targets, &kept),
    );

    // A zero cap serves the honest empty truncation.
    let empty = atlas
        .edges(
            &edges_request(full_grid()),
            EdgesCaps {
                edges: 0,
                ..EdgesCaps::default()
            },
            &FULL,
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
        atlas.edges(&filtered, EdgesCaps::default(), &FULL),
        Err(EdgesError::Unsupported("filter")),
    );

    let mut detailed = edges_request(vec![root]);
    detailed.include_detailed_data = true;
    assert_eq!(
        atlas.edges(&detailed, EdgesCaps::default(), &FULL),
        Err(EdgesError::Unsupported("includeDetailedData")),
    );

    assert_eq!(
        atlas.edges(
            &edges_request(vec![root, root]),
            EdgesCaps {
                tiles: 1,
                ..EdgesCaps::default()
            },
            &FULL,
        ),
        Err(EdgesError::Tiles {
            count: 2,
            maximum: 1,
        }),
    );
    assert_eq!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 4, x: 0, y: 0 }]),
            EdgesCaps::default(),
            &FULL,
        ),
        Err(EdgesError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 2, x: 4, y: 0 }]),
            EdgesCaps::default(),
            &FULL,
        ),
        Err(EdgesError::Grid { z: 2, x: 4, y: 0 }),
    );

    // No tiles, no edges: the honest empty response with every column
    // present-empty.
    let bytes = atlas
        .edges(&edges_request(Vec::new()), EdgesCaps::default(), &FULL)
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
    use super::detail::EdgeLinkDetails;
    use crate::salt::wire::edges::EdgesTrailer;

    let (generation, atlas) = publish("detailed-edges").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let edge_artifacts = open_edge_artifacts(&generation);
    let endpoints = edge_artifacts
        .endpoints
        .u64_pairs()
        .expect("the endpoint column is u64 pairs");

    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let mut request = edges_request(vec![root]);
    request.include_detailed_data = true;

    // The convenience path serves storeless deployments: it still
    // rejects the trailer by name.
    assert_eq!(
        atlas.edges(&request, EdgesCaps::default(), &FULL),
        Err(EdgesError::Unsupported("includeDetailedData")),
    );

    // The transport path assembles, gathers, hydrates, encodes.
    let document = atlas
        .assemble_edges(&request, EdgesCaps::default(), &FULL)
        .expect("assembly ignores the trailer flag");

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

/// Source resolution answers the delivery contract, not just a formula.
///
/// The resolved (zoom, cell) tile delivers the row under the cumulative schedule, and at zoom > 0
/// the parent tile's schedule does not - so `zoom` really is the first visible zoom.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_sources_resolve_to_their_first_visible_tile() {
    let (_generation, atlas) = publish("locate-resolve").await;
    let node_codec = test_codec(&atlas);
    let wire_of = |row: u32| node_codec.encode(row).get();

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
        let Some(source) = atlas.resolve_source(&FULL, &entity_string_of(row)) else {
            panic!("fixture node ids resolve");
        };
        assert_eq!(source.row, u32::from(row));
        assert_eq!(
            source.position,
            atlas.positions_of_row()[source.row as usize],
        );

        // The resolved tile delivers the row.
        let request = TileRequest {
            coordinate: source.cell,
            query: TileQuery {
                mode: Mode::Total,
                ..TileQuery::default()
            },
        };
        let bytes = atlas
            .tile(&request, TileCaps::default(), &FULL)
            .expect("the resolved tile serves");
        assert!(
            row_of(&bytes).contains(&wire_of(source.row)),
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
                .tile(&parent, TileCaps::default(), &FULL)
                .expect("the parent tile serves");
            assert!(
                !row_of(&bytes).contains(&wire_of(source.row)),
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
        atlas.resolve_source(&FULL, &entity_string_of(EDGE_SEED)),
        None
    );
    assert_eq!(
        atlas.resolve_source(
            &FULL,
            &format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil())
        ),
        None,
    );
    assert_eq!(atlas.resolve_source(&FULL, "not an id"), None);
}

/// The locate delivered set answers the wire pin over hand-derived fixture ego-graphs.
///
/// Source first, then the delivered edges' partners ascending wire row id; edges are the source's
/// incident set - both directions, a self-loop exactly once - ascending link-entity identity
/// bytes (for the fixture, ascending edge row).
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_subgraph_delivers_the_ego_graph() {
    use super::locate::LocateCaps;

    let (_generation, atlas) = publish("locate-ego").await;
    let node_codec = test_codec(&atlas);

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
            .resolve_source(&FULL, &entity_string_of(source_row))
            .expect("fixture node ids resolve");
        let subgraph = atlas.locate_subgraph(source, LocateCaps::default(), &FULL);
        assert!(subgraph.complete, "ego({source_row}) is under the cap");

        // Partners deliver ascending by wire row id; the expectation
        // recomputes the order through an independently constructed
        // codec.
        let mut expected_rows: Vec<u32> = partners.to_vec();
        expected_rows.sort_unstable_by_key(|&row| node_codec.encode(row).get());
        expected_rows.insert(0, u32::from(source_row));
        assert_eq!(subgraph.rows, expected_rows, "ego({source_row}) rows");
        let expected_positions: Vec<u32> = expected_rows
            .iter()
            .map(|&row| atlas.positions_of_row()[row as usize])
            .collect();
        assert_eq!(
            subgraph.positions, expected_positions,
            "ego({source_row}) positions",
        );

        // Edges deliver ascending by identity bytes - for the
        // fixture, ascending edge row - endpoints straight off the
        // fixture edge list.
        let delivered: Vec<u32> = subgraph.edges.iter().map(|&(edge, _)| edge.row).collect();
        assert_eq!(delivered, edge_rows, "ego({source_row}) edges");
        for &(edge, id) in &subgraph.edges {
            let (_, edge_source, edge_target) = FIXTURE_EDGES[edge.row as usize];
            assert_eq!(u64::from(edge.source), edge_source);
            assert_eq!(u64::from(edge.target), edge_target);
            assert_eq!(id, edge_identity_of(edge.row));
        }
    }
}

/// The locate edge cap keeps the nearest partners, and their nodes leave with their edges.
///
/// The selection key is ascending (squared wire-frame distance to the partner, partner
/// first-visible zoom, link-entity identity bytes); presentation stays ascending identity bytes.
/// Proven by hand on the self-loop - its partner is the source itself at distance zero, so it
/// survives every nonzero cap - and against an independent key derivation swept over every
/// fixture source and cap.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_edge_cap_keeps_the_nearest_partners() {
    use super::locate::LocateCaps;

    let (_generation, atlas) = publish("locate-truncation").await;
    let node_codec = test_codec(&atlas);
    let distance_of = |from: u32, to: u32| {
        let positions = atlas.positions();
        let origin = positions[atlas.positions_of_row()[from as usize] as usize];
        let point = positions[atlas.positions_of_row()[to as usize] as usize];
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
    // link to row 1 (edge 1). The rows land on distinct wire
    // coordinates - asserted, so the hand derivation cannot silently
    // degenerate into a tie.
    assert_ne!(distance_of(2, 1), 0, "rows 1 and 2 are not co-located");
    let source = atlas
        .resolve_source(&FULL, &entity_string_of(2))
        .expect("fixture node ids resolve");
    let capped = atlas.locate_subgraph(
        source,
        LocateCaps {
            edges: 1,
            ..LocateCaps::default()
        },
        &FULL,
    );
    assert!(!capped.complete, "one of two incident edges truncated");
    assert_eq!(
        capped
            .edges
            .iter()
            .map(|&(edge, _)| edge.row)
            .collect::<Vec<u32>>(),
        [2],
        "the self-loop is the nearest edge",
    );
    // Partner 1's only edge truncated, so partner 1 is not
    // delivered: the source stands alone.
    assert_eq!(capped.rows, [2]);
    assert_eq!(capped.positions, [source.position]);

    // The general law, swept: survivors are the cap smallest under
    // the independent key, presented ascending by wire edge id, and
    // the delivered nodes are exactly the survivors' partners.
    for source_row in [0_u8, 1, 2, 3, 4, 5, 7, 40] {
        let source = atlas
            .resolve_source(&FULL, &entity_string_of(source_row))
            .expect("fixture node ids resolve");
        let full = atlas.locate_subgraph(source, LocateCaps::default(), &FULL);

        for cap in 0..=full.edges.len() {
            let caps = LocateCaps {
                edges: u32::try_from(cap).expect("fixture edge counts are small"),
                ..LocateCaps::default()
            };
            let subgraph = atlas.locate_subgraph(source, caps, &FULL);
            assert_eq!(
                subgraph.complete,
                full.edges.len() <= cap,
                "ego({source_row}) cap {cap}",
            );

            // The independent key: distance bits, then the partner's
            // first visible zoom through the public resolve path (the
            // HEAD fly-to derivation), then the identity bytes.
            let mut expected = full.edges.clone();
            expected.sort_unstable_by_key(|&(edge, id)| {
                let partner = if edge.source == u32::from(source_row) {
                    edge.target
                } else {
                    edge.source
                };
                let zoom = atlas
                    .resolve_source(
                        &FULL,
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
                .flat_map(|&(edge, _)| [edge.source, edge.target])
                .filter(|&row| row != u32::from(source_row))
                .map(|row| (node_codec.encode(row).get(), row))
                .collect();
            partner_keys.sort_unstable();
            partner_keys.dedup();
            let mut expected_rows = vec![u32::from(source_row)];
            expected_rows.extend(partner_keys.iter().map(|&(_, row)| row));
            assert_eq!(subgraph.rows, expected_rows, "ego({source_row}) cap {cap}");

            // Determinism pair: identical assembly on repeat.
            assert_eq!(
                subgraph,
                atlas.locate_subgraph(source, caps, &FULL),
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
        fixture_type_url(0),
        "not a versioned type url".to_owned(),
        "https://example.com/types/unknown/v/2".to_owned(),
    ];
    let bytes = atlas
        .tile(&colored, TileCaps::default(), &FULL)
        .expect("a colored request serves");

    let rows = section(&bytes, ROW_IDS).expect("ROW_IDS is present");
    let mask = section(&bytes, TYPE_MASK).expect("TYPE_MASK rides colored requests");
    // Three requested ids: stride ceil(3/8) = 1 byte per point, so
    // four row-id bytes stand behind every mask byte.
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

/// A generation carrying the memory dataset's 8-byte positional ids does not serve.
///
/// The open fails loudly on the key width.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn foreign_key_widths_fail_the_open() {
    use super::error::{IdentityDomain, OpenAtlasError};
    use crate::salt::fit::prepare::identity::InvalidIdentityFile;

    let (root, generation) = fit_fixture("foreign-width-fails").await;
    let error =
        Atlas::open(&root, generation.id()).expect_err("a foreign key width must fail the open");
    assert!(
        matches!(
            error,
            OpenAtlasError::Identity {
                domain: IdentityDomain::Ontology,
                error: InvalidIdentityFile::KeyWidth { .. },
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

    use super::color;
    use crate::{
        dataset::ArchivedOntologyTypeUuid,
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
    let types: Vec<smallvec::SmallVec<OntologyRowId, 2>> =
        [&[0_u64][..], &[0, 2], &[1], &[2], &[0], &[1, 2], &[], &[0]]
            .iter()
            .map(|list| list.iter().copied().map(OntologyRowId::new).collect())
            .collect();
    let parents: Vec<smallvec::SmallVec<OntologyRowId, 2>> = [&[][..], &[0_u64], &[0], &[1, 2]]
        .iter()
        .map(|list| list.iter().copied().map(OntologyRowId::new).collect())
        .collect();
    let row_of_position: [u32; 8] = [3, 1, 4, 0, 6, 2, 7, 5];

    let postings = Postings::build(
        &types,
        &row_of_position,
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
    let mut table = IdentityTable::<ArchivedOntologyTypeUuid>::new();
    for url in &urls {
        let parsed: VersionedUrl = url.parse().expect("the fixture URL parses");
        table.push(ArchivedOntologyTypeUuid::from(
            OntologyTypeUuid::from_url(&parsed).into_uuid(),
        ));
    }
    let identity_path = dir.join("fixture.idnt");
    let mut file = std::fs::File::create(&identity_path).expect("the identity file creates");
    let _digest = table
        .write_into(&mut file)
        .expect("the identities should write");
    drop(file);
    let table = IdentityTableArchive::<ArchivedOntologyTypeUuid>::new(
        IdentityFile::open(&identity_path).expect("the identity file opens"),
    )
    .expect("the identity table validates");

    let members = |ids: &[String]| -> Vec<Vec<u32>> {
        let set = color::resolve_masks(&postings, &closure, &table, ids);
        set.memberships(&postings)
            .iter()
            .map(|membership| membership.positions_in(0..8).collect())
            .collect()
    };

    // Type 0's descendants are every type: the union covers every
    // typed position. Type 1 folds type 3's empty membership in.
    // Type 3 has no proper descendant and serves its stored (empty)
    // membership. An unparsable id and an unknown URL read empty.
    assert_eq!(members(&[urls[0].clone()]), vec![vec![0, 1, 2, 3, 5, 6, 7]],);
    assert_eq!(
        members(&[
            urls[1].clone(),
            urls[2].clone(),
            urls[3].clone(),
            "not a versioned type url".to_owned(),
            "https://example.com/types/unknown/v/1".to_owned(),
        ]),
        vec![vec![5, 7], vec![0, 1, 7], vec![], vec![], vec![]],
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
    use super::detail::NodeDetails;
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
    let row_ids = rows.u32_elements().expect("the row column is u32");

    // The convenience path serves storeless deployments: it still
    // rejects the trailer by name.
    let mut detailed = request(0, 0, 0, Mode::Delta);
    detailed.query.include_detailed_data = true;
    assert_eq!(
        atlas.tile(&detailed, TileCaps::default(), &FULL),
        Err(TileError::Unsupported("includeDetailedData")),
    );

    // The transport path assembles, gathers, hydrates, encodes.
    let document = atlas
        .assemble_tile(&detailed, TileCaps::default(), &FULL)
        .expect("assembly ignores the trailer flag");
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
            backfilled: 0,
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[0..end]),
        positions: points,
        rows: &{
            let node_codec = test_codec(&atlas);
            row_ids
                .iter()
                .map(|&row| node_codec.encode(row).get())
                .collect::<Vec<u32>>()
        },
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
fn entity_id_of(seed: u8) -> crate::dataset::ArchivedEntityId {
    crate::dataset::ArchivedEntityId {
        web_id: uuid::Uuid::from_bytes([seed; 16]).into(),
        entity_uuid: uuid::Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
    }
}

/// The wire `bstr(32)` form of [`entity_id_of`]'s identity: the web uuid then the entity uuid.
fn identity_bytes_of(seed: u8) -> [u8; 32] {
    let mut bytes = [seed; 32];
    bytes[16..].fill(seed ^ 0xFF);
    bytes
}

/// The `webId~entityUuid` string form of [`entity_id_of`]'s identity.
///
/// Narrows a fixture-sized index into the wire's `u32` row domain.
fn narrow_usize(value: usize) -> u32 {
    u32::try_from(value).expect("fixture indexes fit u32")
}

/// Derives the node and edge wire codecs of an atlas opened with default options.
///
/// The independent derivation the assembly's egress must agree with.
fn test_codec(atlas: &Atlas) -> codec::RowCodec {
    codec::RowCodec::derive(
        b"atlas-dev-wire-secret",
        atlas.generation(),
        codec::NODE_LABEL,
        narrow_usize(atlas.row_ids().len()),
    )
}

/// Derives a fixture edge row's link-entity identity from the seeding rule.
///
/// Identity bytes ascend with the edge row - `identity_bytes_of` leads with its seed byte - so
/// ascending internal row order IS the wire's ascending-identity delivery order for the fixture.
fn edge_identity_of(row: u32) -> [u8; 32] {
    identity_bytes_of(EDGE_SEED + u8::try_from(row).expect("fixture edge rows fit u8"))
}

fn entity_string_of(seed: u8) -> String {
    format!(
        "{}~{}",
        uuid::Uuid::from_bytes([seed; 16]),
        uuid::Uuid::from_bytes([seed ^ 0xFF; 16]),
    )
}

/// Writes and reopens one hand-built entity identity table.
fn entity_identity_table(
    path: &camino::Utf8PathBuf,
    ids: &[crate::dataset::ArchivedEntityId],
) -> crate::salt::fit::prepare::identity::IdentityTableArchive<crate::dataset::ArchivedEntityId> {
    use crate::{
        dataset::ArchivedEntityId, file::identity::read::IdentityFile,
        salt::fit::prepare::identity::IdentityTable,
    };

    let mut table = IdentityTable::<ArchivedEntityId>::new();
    for &id in ids {
        table.push(id);
    }
    let mut file = std::fs::File::create(path).expect("the identity file creates");
    let _digest = table
        .write_into(&mut file)
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
        TranslateCaps, TranslateRequest, TranslatedEdge, TranslatedNode, translate,
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
    let position_of_row = [1_u32, 2, 0];

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
    // Three node rows are the table's universe; the expectations
    // below encode through the same derivation.
    let node_codec = codec::RowCodec::derive(
        b"atlas-dev-wire-secret",
        codec_generation(),
        codec::NODE_LABEL,
        3,
    );
    // Edge row 0 joins nodes 0 and 1, edge row 1 joins 1 and 2:
    // arbitrary but in-universe, visible under the full proof.
    let endpoints = [[0_u64, 1], [1, 2]];
    let response = translate(
        &request,
        TranslateCaps::default(),
        &FULL,
        &nodes,
        &edges,
        &positions,
        &position_of_row,
        &endpoints,
        &node_codec,
    )
    .expect("the request is under the cap");

    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(2),
            TranslatedNode {
                id: node_codec.encode(1).get(),
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
                source: node_codec.encode(0).get(),
                target: node_codec.encode(1).get(),
            },
        )],
    );
}

/// The cap rejects by count before any id is looked up.
#[test]
fn translate_rejects_over_cap() {
    use super::translate::{TranslateCaps, TranslateError, TranslateRequest, translate};

    let dir = scratch("translate-cap");
    std::fs::create_dir_all(&dir).expect("the scratch directory creates");
    let nodes = entity_identity_table(&dir.join("nodes.idnt"), &[entity_id_of(1)]);
    let edges = entity_identity_table(&dir.join("edges.idnt"), &[entity_id_of(10)]);

    let over = TranslateRequest {
        entity_ids: vec![String::new(); TranslateCaps::default().entity_ids as usize + 1],
    };
    let node_codec = codec::RowCodec::derive(
        b"atlas-dev-wire-secret",
        codec_generation(),
        codec::NODE_LABEL,
        1,
    );
    assert_eq!(
        translate(
            &over,
            TranslateCaps::default(),
            &FULL,
            &nodes,
            &edges,
            &[],
            &[],
            &[],
            &node_codec,
        ),
        Err(TranslateError::Ids {
            count: TranslateCaps::default().entity_ids as usize + 1,
            maximum: TranslateCaps::default().entity_ids,
        }),
    );
}

/// Translate over the published fixture.
///
/// The rewritten store-width identities resolve end to end - node row and wire position agree with
/// the serving columns, an edge id answers its row, and an unknown id reads absent.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_resolves_store_identities_end_to_end() {
    use super::translate::{TranslateCaps, TranslateRequest, TranslatedEdge, TranslatedNode};

    let (_generation, atlas) = publish("translate-e2e").await;

    let response = atlas
        .translate(
            &TranslateRequest {
                entity_ids: vec![
                    entity_string_of(0),
                    entity_string_of(EDGE_SEED),
                    format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil()),
                ],
            },
            TranslateCaps::default(),
            &FULL,
        )
        .expect("the request is under the cap");

    let position = atlas.positions_of_row()[0] as usize;
    let point = atlas.positions()[position];
    let node_codec = test_codec(&atlas);
    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(0),
            TranslatedNode {
                id: node_codec.encode(0).get(),
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
                source: node_codec.encode(0).get(),
                target: node_codec.encode(1).get(),
            },
        )],
    );
}

/// Shorthand for a null-valued property entry.
fn property(name: &str) -> (String, super::detail::SimpleValue) {
    (name.to_owned(), super::detail::SimpleValue::Null)
}

#[test]
fn simple_properties_parse_every_simple_shape() {
    use super::detail::SimpleValue;

    // The store renders 2.5 and 1.0 with their points, so both read
    // as doubles; a number beyond i64 falls back to f64 (the wire's
    // integer is i64 - the simple-value shapes carry no wider integral form).
    let mut entries = super::detail::simple_properties(
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
        // u64::MAX itself is not an f64; the fallback lands on the
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
    let _entries = super::detail::simple_properties("[1, 2]");
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
        super::detail::select_properties(entries.clone(), None, 4),
        vec![
            property("a/"),
            property("b/"),
            property("c/"),
            property("d/")
        ],
    );

    // Over the cap: d/ drops first, then c/ - the largest names go.
    assert_eq!(
        super::detail::select_properties(entries, None, 2),
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
        super::detail::select_properties(entries.clone(), Some("z/"), 2),
        vec![property("a/"), property("z/")],
    );
    assert_eq!(
        super::detail::select_properties(entries.clone(), Some("z/"), 1),
        vec![property("z/")],
    );

    // A cap of zero admits nothing - even the label drops.
    assert_eq!(
        super::detail::select_properties(entries, Some("z/"), 0),
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
fn encode_unhydrated(atlas: &Atlas, document: &super::LocateDocument) -> Vec<u8> {
    let nodes = atlas.locate_node_entities(document);
    let links = atlas.locate_link_entities(document);
    let node_details = super::detail::LocateNodeDetails::empty(nodes.count());
    let link_details = super::detail::LocateLinkDetails::empty(links.count());
    atlas.encode_locate(document, &node_details, &link_details)
}

/// A locate source names one subject in one of two identity domains.
///
/// A by-`row` request resolves through the wire codec's ingress - pure arithmetic, no store - to
/// the same response bytes as the by-`entityId` request for that node, a wire value outside the
/// encoded image collapses into `unknown-entity`, and a body carrying both or neither source field
/// is rejected by name with its count.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_by_wire_row_matches_by_entity() {
    let (_generation, atlas) = publish("locate-by-row").await;
    let caps = ServeCaps::default();

    // Row 7's wire id round-trips by construction (the codec is a
    // bijection); the equivalence under test is the two request
    // paths, whose agreement is the whole contract in one assertion.
    let node_codec = test_codec(&atlas);
    let wire = node_codec.encode(7).get();
    let by_entity = locate_request(entity_string_of(7));
    let mut by_row: super::LocateRequest =
        serde_json::from_value(serde_json::json!({ "row": wire }))
            .expect("a by-row body deserializes");
    assert_eq!(by_row.row, Some(wire));
    assert_eq!(by_row.entity_id, None);
    let entity_document = atlas
        .assemble_locate(&by_entity, caps, &FULL)
        .expect("the entity resolves");
    let row_document = atlas
        .assemble_locate(&by_row, caps, &FULL)
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
    let image: HashSet<u32> = (0..48).map(|row| node_codec.encode(row).get()).collect();
    assert!(
        !image.contains(&48) && !image.contains(&u32::MAX),
        "the probes lie outside the image",
    );
    for garbage in [48, u32::MAX] {
        by_row.row = Some(garbage);
        assert_eq!(
            atlas
                .assemble_locate(&by_row, caps, &FULL)
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
            .assemble_locate(&by_row, caps, &FULL)
            .expect_err("two sources are ambiguous"),
        super::LocateError::Source { carried: 2 },
    );
    by_row.row = None;
    by_row.entity_id = None;
    assert_eq!(
        atlas
            .assemble_locate(&by_row, caps, &FULL)
            .expect_err("no source names no subject"),
        super::LocateError::Source { carried: 0 },
    );
}

/// The locate transport path encodes byte-exactly against the derived wire document.
///
/// Assembly and encoding against the groundwork layers' own outputs, all-`null` details standing
/// in for hydration: the mandatory trailer rides empty tables and null columns, and both source
/// completeness flags read `false` - nothing can be attested for an unhydrated source.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_end_to_end_encodes_the_pinned_envelope() {
    use crate::salt::{
        postings::artifact::Membership,
        wire::locate::{LocateResponse, LocateTrailer},
    };

    let (generation, atlas) = publish("locate-endpoint").await;
    let caps = ServeCaps::default();

    let mut request = locate_request(entity_string_of(0));
    let document = atlas
        .assemble_locate(&request, caps, &FULL)
        .expect("the request is well-formed");
    let bytes = encode_unhydrated(&atlas, &document);
    assert_eq!(bytes[0..8], *b"SALTILEL");

    // The groundwork layers derive the expectation independently;
    // their own tests pin their behaviour.
    let source = atlas
        .resolve_source(&FULL, &entity_string_of(0))
        .expect("row 0 is a node");
    let subgraph = atlas.locate_subgraph(source, caps.locate, &FULL);
    let node_codec = test_codec(&atlas);
    let wire_of = |row: u32| node_codec.encode(row).get();
    let sources: Vec<u32> = subgraph
        .edges
        .iter()
        .map(|&(edge, _)| wire_of(edge.source))
        .collect();
    let targets: Vec<u32> = subgraph
        .edges
        .iter()
        .map(|&(edge, _)| wire_of(edge.target))
        .collect();
    let edge_ids: Vec<[u8; 32]> = subgraph.edges.iter().map(|&(_, id)| id).collect();
    let wire_rows: Vec<u32> = atlas.row_ids().iter().map(|&row| wire_of(row)).collect();
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
            entity_id: identity_bytes_of(0),
            type_ids_complete: false,
            properties_complete: false,
            delivered: &subgraph.positions,
            positions: atlas.positions(),
            rows: &wire_rows,
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
    // TYPE_MASK slot rides exactly the requests that color.
    request.colored_type_ids = vec!["https://unknown.test/t/v/1".to_owned()];
    let colored_document = atlas
        .assemble_locate(&request, caps, &FULL)
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
    let caps = ServeCaps::default();

    // Unparsable, unknown, and an EDGE id (wrong identity domain)
    // are one rejection: an id that cannot name a visible node.
    for id in [
        "not an entity id".to_owned(),
        entity_string_of(50),
        entity_string_of(EDGE_SEED),
    ] {
        assert_eq!(
            atlas
                .assemble_locate(&locate_request(id.clone()), caps, &FULL)
                .expect_err("the id names no visible node"),
            super::LocateError::UnknownEntity,
            "{id}",
        );
    }

    // The coloredTypeIds cap is the tile endpoint's own.
    let mut colored = locate_request(entity_string_of(0));
    colored.colored_type_ids = vec![String::new(); caps.tile.colored_type_ids as usize + 1];
    assert_eq!(
        atlas
            .assemble_locate(&colored, caps, &FULL)
            .expect_err("the list is over the cap"),
        super::LocateError::Types {
            count: caps.tile.colored_type_ids as usize + 1,
            maximum: caps.tile.colored_type_ids,
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
            .assemble_locate(&filtered, caps, &FULL)
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
        detail::SimpleValue,
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
        names,
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
    assert_eq!(names, ["https://x.test/a/", "https://x.test/b/"]);
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
        table,
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
    use super::locate::covers_source_types;

    let url = |name: &str| format!("https://t.test/{name}/v/1");
    let colored = vec![url("a"), url("b")];

    // The ratified example: the source carries {a, c}, the request
    // colors {a, b} - c is not in the set, so coverage fails.
    assert!(!covers_source_types(true, &[url("a"), url("c")], &colored));
    assert!(covers_source_types(true, &[url("a")], &colored));
    assert!(covers_source_types(true, &[url("b"), url("a")], &colored));

    // An empty palette covers nothing; an unreadable or unrecorded
    // type list is never attested.
    assert!(!covers_source_types(true, &[url("a")], &[]));
    assert!(!covers_source_types(true, &[], &colored));
    assert!(!covers_source_types(false, &[url("a")], &colored));
}

/// Returns a fixed generation identity for codec derivation.
fn codec_generation() -> GenerationId {
    "1111111111111111111111111111111111111111111111111111111111111111"
        .parse()
        .expect("the literal is 64 hex digits")
}

#[test]
fn codec_round_trips_every_small_universe() {
    for universe in [
        1_u32, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 48, 100, 257, 1000,
    ] {
        let codec = codec::RowCodec::derive(b"secret", codec_generation(), b"test", universe);

        let image: Vec<u32> = (0..universe).map(|row| codec.encode(row).get()).collect();
        for (row, &wire) in (0..universe).zip(&image) {
            assert_eq!(
                codec.decode(wire),
                Some(row),
                "decode inverts encode at N={universe}",
            );
        }
        let distinct: HashSet<u32> = image.iter().copied().collect();
        assert_eq!(
            u32::try_from(distinct.len()).expect("the universe fits u32"),
            universe,
            "encoded ids stay distinct at N={universe}",
        );
        assert!(
            image.iter().any(|&wire| wire >= universe),
            "the image escapes [0, {universe}): ids no longer bound the universe",
        );
    }
}

#[test]
fn codec_round_trips_a_large_universe_sample() {
    let universe = 500_000;
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);

    let mut seen = HashSet::new();
    for row in (0..universe).step_by(631) {
        let wire = codec.encode(row).get();
        assert!(seen.insert(wire), "sampled wire values stay distinct");
        assert_eq!(codec.decode(wire), Some(row));
    }
}

#[test]
fn codec_decodes_only_the_encoded_image() {
    let universe = 48_u32;
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), b"test", universe);
    let image: HashSet<u32> = (0..universe).map(|row| codec.encode(row).get()).collect();

    // A probe sweep outside the image answers None - including the
    // low dense range the retired [0, N) codec would have occupied.
    for wire in (0..10_000).chain([1 << 31, u32::MAX - 1, u32::MAX]) {
        match codec.decode(wire) {
            Some(row) => {
                assert!(row < universe, "decoded rows lie in the universe");
                assert_eq!(
                    codec.encode(row).get(),
                    wire,
                    "a decoding wire value is its row's encoding",
                );
                assert!(image.contains(&wire), "decoding values lie in the image");
            }
            None => assert!(!image.contains(&wire), "image values decode"),
        }
    }
}

#[test]
fn codec_degenerate_universes_stay_closed() {
    let empty = codec::RowCodec::derive(b"secret", codec_generation(), b"test", 0);
    for wire in [0, 1, u32::MAX] {
        assert_eq!(
            empty.decode(wire),
            None,
            "an empty universe decodes nothing"
        );
    }

    let single = codec::RowCodec::derive(b"secret", codec_generation(), b"test", 1);
    let wire = single.encode(0);
    assert_eq!(single.decode(wire.get()), Some(0));
    assert_eq!(single.decode(wire.get().wrapping_add(1)), None);
}

#[test]
#[should_panic(expected = "the codec encodes rows of its own universe")]
fn codec_encode_rejects_out_of_universe_rows() {
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), b"test", 48);
    _ = codec.encode(48);
}

#[test]
fn codec_separates_secrets_generations_and_labels() {
    let universe = 4096;
    let base = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);
    let other_secret =
        codec::RowCodec::derive(b"another", codec_generation(), codec::NODE_LABEL, universe);
    let other_generation = codec::RowCodec::derive(
        b"secret",
        "2222222222222222222222222222222222222222222222222222222222222222"
            .parse()
            .expect("the literal is 64 hex digits"),
        codec::NODE_LABEL,
        universe,
    );
    let other_label =
        codec::RowCodec::derive(b"secret", codec_generation(), b"another-label", universe);

    for (name, other) in [
        ("secret", &other_secret),
        ("generation", &other_generation),
        ("label", &other_label),
    ] {
        let differing = (0..universe)
            .filter(|&row| base.encode(row) != other.encode(row))
            .count();
        assert!(differing > 0, "a changed {name} changes the mapping");
    }
}

#[test]
fn codec_derivation_is_deterministic() {
    let universe = 4096;
    let first = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);
    let second =
        codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);

    for row in 0..universe {
        assert_eq!(first.encode(row), second.encode(row));
    }
}

/// The full-range codec written a second time.
///
/// From the documented construction and pinned parameter picks rather than from `serve::codec`.
///
/// Agreement between the two freezes the wire mapping itself - a refactor that changes any derived
/// bit fails loudly.
mod codec_reference {
    use core::hash::Hasher as _;

    use hkdf::Hkdf;
    use sha2::Sha256;
    use siphasher::sip::SipHasher24;

    use crate::file::generation::GenerationId;

    /// The pinned Feistel round count.
    const ROUNDS: usize = 8;

    /// One universe's reference codec.
    pub(super) struct Reference {
        /// The universe size `N`.
        universe: u32,
        /// The per-round SipHash-2-4 keys.
        keys: [[u8; 16]; ROUNDS],
    }

    impl Reference {
        /// Derives the reference codec of one universe.
        pub(super) fn derive(
            secret: &[u8],
            generation: GenerationId,
            label: &[u8],
            universe: u32,
        ) -> Self {
            let salt = generation.digest().to_bytes();
            let mut material = [0_u8; 16 * ROUNDS];
            Hkdf::<Sha256>::new(Some(&salt), secret)
                .expand(label, &mut material)
                .expect("128 octets stay within HKDF-SHA256's expansion bound");

            let mut keys = [[0_u8; 16]; ROUNDS];
            for (key, chunk) in keys.iter_mut().zip(material.as_chunks::<16>().0) {
                *key = *chunk;
            }

            Self { universe, keys }
        }

        /// Encodes `row`.
        pub(super) fn encode(&self, row: u32) -> u32 {
            assert!(
                row < self.universe,
                "the reference shares the producer contract"
            );
            self.permute(row)
        }

        /// Decodes `wire`: the inverse pass, then the bounds check against the universe.
        pub(super) fn decode(&self, wire: u32) -> Option<u32> {
            let row = self.unpermute(wire);
            (row < self.universe).then_some(row)
        }

        /// Applies the network once.
        ///
        /// Round `i` maps `(L, R)` to `(R, L xor F_i(R))` over two 16-bit halves.
        fn permute(&self, mut state: u32) -> u32 {
            for key in &self.keys {
                let left = state >> 16;
                let right = state & 0xFFFF;
                state = (right << 16) | (left ^ (round(key, right) & 0xFFFF));
            }

            state
        }

        /// Applies the inverse network once.
        ///
        /// Derived from the round's own algebra: the output `(L', R')` of round `i` determines
        /// its input as `R = L'` and `L = R' xor F_i(L')`, so the inverse walks the keys in
        /// reverse, recovering each round's input from its output.
        fn unpermute(&self, mut state: u32) -> u32 {
            for key in self.keys.iter().rev() {
                let out_left = state >> 16;
                let out_right = state & 0xFFFF;
                let left = out_right ^ (round(key, out_left) & 0xFFFF);
                state = (left << 16) | out_left;
            }

            state
        }
    }

    /// Evaluates one round function.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the caller masks to the half width; the narrowing keeps the used bits"
    )]
    fn round(key: &[u8; 16], half: u32) -> u32 {
        let mut hasher = SipHasher24::new_with_key(key);
        hasher.write(&half.to_le_bytes());
        hasher.finish() as u32
    }
}

#[test]
fn codec_agrees_with_the_spec_reference() {
    for universe in [2_u32, 3, 5, 48, 100, 257, 1025, 4096] {
        let codec =
            codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);
        let model = codec_reference::Reference::derive(
            b"secret",
            codec_generation(),
            codec::NODE_LABEL,
            universe,
        );

        for row in 0..universe {
            let wire = codec.encode(row).get();
            assert_eq!(
                wire,
                model.encode(row),
                "both expressions of the codec agree at N={universe}, row {row}",
            );
            assert_eq!(
                model.decode(wire),
                Some(row),
                "the reference inverts the production encoding at N={universe}, row {row}",
            );
        }

        // Both expressions agree on the misses too: decode exactness
        // holds across implementations, not merely within one.
        for wire in (0..2_048).chain([1 << 31, u32::MAX]) {
            assert_eq!(
                codec.decode(wire),
                model.decode(wire),
                "both expressions agree on decode at N={universe}, wire {wire}",
            );
        }
    }
}

#[test]
fn codec_mappings_survive_universe_growth() {
    // The permutation is universe-independent: growing the universe
    // leaves every existing wire id fixed, so rows appended within a
    // generation never move ids already on the wire.
    let small = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, 1_000);
    let grown = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, 500_000);

    for row in 0..1_000 {
        let wire = small.encode(row);
        assert_eq!(wire, grown.encode(row), "row {row} is stable under growth");
        assert_eq!(grown.decode(wire.get()), Some(row));
    }
}

#[test]
fn codec_stays_injective_at_scale() {
    let universe = 300_000;
    let codec = codec::RowCodec::derive(b"secret", codec_generation(), codec::NODE_LABEL, universe);

    let image: HashSet<u32> = (0..universe).map(|row| codec.encode(row).get()).collect();
    assert_eq!(
        u32::try_from(image.len()).expect("the universe fits u32"),
        universe,
        "encoded ids stay distinct at scale",
    );
}

#[test]
fn codec_wire_ids_estimate_the_full_range_never_the_universe() {
    let universe = 10_000_u32;
    let sample = 100_u32;
    let trials = 128_u32;

    // Two selections a mapping bias would separate: the first block
    // of assignment order, and a stride spanning the universe.
    let block: Vec<u32> = (0..sample).collect();
    let spread: Vec<u32> = (0..sample).map(|index| index * 97).collect();

    let mut block_total = 0_u64;
    let mut spread_total = 0_u64;
    for trial in 0..trials {
        let secret = trial.to_le_bytes();
        let codec =
            codec::RowCodec::derive(&secret, codec_generation(), codec::NODE_LABEL, universe);
        let widest = |rows: &[u32]| {
            rows.iter()
                .map(|&row| u64::from(codec.encode(row).get()))
                .max()
                .expect("the selection is nonempty")
        };
        block_total += widest(&block);
        spread_total += widest(&spread);
    }

    // Averaged over trials, the German-tank estimate m(1 + 1/k) - 1
    // applied to full-range ids recovers the u32 range - never N.
    // Comparisons stay in the scale of 2^32 · k · trials -
    // multiplied out, never divided. This is regression evidence
    // against gross mapping bias - a codec issuing [0, N) or
    // assignment-ordered ids fails both selections by orders of
    // magnitude. A distribution smoke at 128 keys cannot establish
    // indistinguishability from a random permutation or bound
    // leakage at corpus observation volume; the stronger property
    // stays a design target.
    //
    // The tolerance derives from the estimator's own spread. The
    // maximum of k uniform draws on [0, M) has variance
    // M^2 k / ((k+1)^2 (k+2)); the scaled per-trial statistic
    // (k+1) · max has standard deviation M · √(k / (k+2)), and
    // the sum over t independent trials spreads by √(t) of that.
    // Twelve standard deviations never flakes and still binds the
    // distribution two-sidedly - about four times tighter than the
    // loose bound it replaces, and five orders of magnitude away
    // from what the retired [0, N) codec would have produced.
    let scaled = |total: u64| total * u64::from(sample + 1);
    let target = (1_u64 << 32) * u64::from(sample) * u64::from(trials);
    let deviation =
        2.0_f64.powi(32) * (f64::from(trials) * f64::from(sample) / f64::from(sample + 2)).sqrt();
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the tolerance is a positive count far below u64::MAX"
    )]
    let tolerance = (12.0 * deviation) as u64;
    for (name, total) in [("block", block_total), ("spread", spread_total)] {
        assert!(
            scaled(total).abs_diff(target) < tolerance,
            "the {name} selection estimates the full range: {total} total",
        );
    }
    // The difference of the two sums doubles the variance; its
    // tolerance widens by √(2).
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the tolerance is a positive count far below u64::MAX"
    )]
    let difference_tolerance = (12.0 * core::f64::consts::SQRT_2 * deviation) as u64;
    assert!(
        scaled(block_total.abs_diff(spread_total)) < difference_tolerance,
        "the selections' range estimates agree: {block_total} vs {spread_total}",
    );
}

/// A proof hiding exactly `hidden` among the atlas's node rows.
fn mask_hiding(atlas: &Atlas, hidden: &[u32]) -> VisibilityProof {
    let universe = atlas.row_ids().len();
    let mut bitmap = crate::bitset::BitSet::new(universe);
    for row in 0..universe {
        let as_u32 = u32::try_from(row).expect("fixture universes fit u32");
        if !hidden.contains(&as_u32) {
            bitmap.insert(row);
        }
    }

    VisibilityProof::from_bitmap(bitmap)
}

/// The resolve seam collapses every failure to one [`None`].
///
/// Under the full proof every in-universe wire id resolves to its row; under a mask the hidden
/// row's wire id answers exactly the [`None`] an out-of-universe value answers, so forbidden and
/// nonexistent are indistinguishable downstream of the seam.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn resolve_collapses_every_failure_to_one_none() {
    use super::VisibleRow;

    let (_generation, atlas) = publish("resolve-seam").await;
    let node_codec = test_codec(&atlas);
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    let masked = mask_hiding(&atlas, &[7]);
    for row in 0..universe {
        let wire = node_codec.encode(row).get();
        assert_eq!(atlas.resolve(&FULL, wire).map(VisibleRow::get), Some(row),);
        assert_eq!(
            atlas.resolve(&masked, wire).map(VisibleRow::get),
            (row != 7).then_some(row),
        );
    }
    assert!(atlas.resolve(&FULL, universe).is_none());
    assert!(atlas.resolve(&masked, universe).is_none());
}

/// The composition law on the tile path: `S = X ∩ V_u`, order preserved, in both modes.
///
/// The masked tile's columns are exactly the unmasked columns with the hidden rows' entries
/// removed (the mask never reorders and never over-drops), and a fully masked
/// populated
/// tile answers byte-identically to a tile that never had rows (empty is empty: the head's
/// occupancy fields carry no evidence of hidden points).
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_masked_tile_serves_exactly_the_visible_intersection() {
    let (generation, atlas) = publish("masked-tile").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let node_codec = test_codec(&atlas);

    // Hide every third row; the hidden set crosses every bucket of
    // the 48-point fixture.
    let hidden: Vec<u32> = (0..universe).filter(|row| row.is_multiple_of(3)).collect();
    let hidden_wire: HashSet<u32> = hidden
        .iter()
        .map(|&row| node_codec.encode(row).get())
        .collect();
    let proof = mask_hiding(&atlas, &hidden);

    for mode in [Mode::Delta, Mode::Total] {
        let full_bytes = atlas
            .tile(&request(0, 0, 0, mode), TileCaps::default(), &FULL)
            .expect("the unmasked root serves");
        let masked_bytes = atlas
            .tile(&request(0, 0, 0, mode), TileCaps::default(), &proof)
            .expect("the masked root serves");

        let full_rows = decode_rows(section(&full_bytes, ROW_IDS).expect("ROW_IDS is present"));
        let masked_rows = decode_rows(section(&masked_bytes, ROW_IDS).expect("ROW_IDS is present"));
        let expected: Vec<u32> = full_rows
            .iter()
            .copied()
            .filter(|wire| !hidden_wire.contains(wire))
            .collect();
        assert_eq!(
            masked_rows, expected,
            "the {mode:?} root masks by intersection"
        );

        // The positions column drops the same entries at the same indexes.
        let full_positions = section(&full_bytes, POSITIONS).expect("POSITIONS is present");
        let masked_positions = section(&masked_bytes, POSITIONS).expect("POSITIONS is present");
        let expected_positions: Vec<u8> = full_positions
            .as_chunks::<8>()
            .0
            .iter()
            .zip(&full_rows)
            .filter(|&(_, wire)| !hidden_wire.contains(wire))
            .flat_map(|(chunk, _)| chunk.iter().copied())
            .collect();
        assert_eq!(masked_positions, expected_positions);
    }

    // A fully masked populated cell answers byte-identically to a
    // cell that never had rows: same empty runs, zero visible count,
    // zero children bits.
    let Artifacts {
        morton: _,
        quad,
        coordinates,
        rows,
    } = open_artifacts(&generation);
    let points = coordinates.points().expect("wire coordinates are points");
    let row_ids = rows.u32_elements().expect("the row column is u32");
    let root_cell = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");
    let mut nodes = Vec::new();
    walk(&quad, 0, root_cell, &mut nodes);
    let (_, populated_cell) = nodes[1..]
        .iter()
        .copied()
        .find(|&(node, _)| {
            let run = quad.nodes()[node as usize].run();
            run.end > run.start
        })
        .expect("the fixture quadtree has a populated non-root node");
    let coordinate = coordinate_of(populated_cell);
    let nothing = mask_hiding(&atlas, &(0..universe).collect::<Vec<u32>>());
    let expected = TileResponse {
        head: TileHead {
            generation: generation.id().digest(),
            variant: 0,
            coordinate,
            mode: Mode::Delta,
            visible: 0,
            first_bucket: coordinate.z + FIXTURE_LOD.span.get(),
            runs: &[0],
            global: None,
            children: 0,
            backfilled: 0,
        },
        delivered: crate::salt::wire::tile::DeliveredSet::Ranges(&[]),
        positions: points,
        rows: row_ids,
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
                TileCaps::default(),
                &nothing,
            )
            .expect("the fully masked tile serves"),
        expected,
        "a fully masked tile is a tile that never had rows",
    );
}

/// The edges path inherits the mask through its endpoints.
///
/// Hiding one node removes exactly the edges incident to it - the delivered sets intersect the
/// proof before edges qualify, so the response is byte-identical to the qualifying computation over
/// the visible row set.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_edges_inherit_endpoint_visibility() {
    let (generation, atlas) = publish("masked-edges").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    // Row 5 is an endpoint of the reciprocal fixture pair (edge rows
    // 3 and 4); hiding it must remove exactly those two edges.
    let hidden = 5_u32;
    let proof = mask_hiding(&atlas, &[hidden]);
    let endpoints: Vec<[u64; 2]> = FIXTURE_EDGES
        .iter()
        .map(|&(_, source, target)| [source, target])
        .collect();
    let delivered: HashSet<u32> = (0..universe).filter(|&row| row != hidden).collect();
    let (sources, targets, rows) = qualifying_columns(&endpoints, &delivered);
    assert_eq!(
        rows.len(),
        FIXTURE_EDGES.len() - 2,
        "two edges hide with row 5"
    );
    let (sources, targets, rows) = wire_columns(&atlas, &sources, &targets, &rows);

    assert_eq!(
        atlas
            .edges(&edges_request(full_grid()), EdgesCaps::default(), &proof)
            .expect("the masked grid serves"),
        expected_edges_bytes(&generation, true, &sources, &targets, &rows),
    );
}

/// Translate answers missing for denied, in both identity domains.
///
/// A hidden node's id is an absent key exactly like a nonexistent id; an edge is absent when either
/// endpoint hides (edge visibility derives) and present while both endpoints show.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn translate_answers_missing_for_denied() {
    use super::translate::{TranslateCaps, TranslateRequest};

    let (_generation, atlas) = publish("masked-translate").await;

    // Row 5 endpoints fixture edge rows 3 and 4; edge row 0 joins
    // rows 0 and 1, untouched by the mask.
    let proof = mask_hiding(&atlas, &[5]);
    let request = TranslateRequest {
        entity_ids: vec![
            entity_string_of(5),             // hidden node: absent
            entity_string_of(6),             // visible node: present
            entity_string_of(EDGE_SEED + 3), // edge with hidden endpoint: absent
            entity_string_of(EDGE_SEED),     // edge with visible endpoints: present
        ],
    };
    let masked = atlas
        .translate(&request, TranslateCaps::default(), &proof)
        .expect("the request is under the cap");
    assert!(!masked.nodes.contains_key(&entity_string_of(5)));
    assert!(masked.nodes.contains_key(&entity_string_of(6)));
    assert!(!masked.edges.contains_key(&entity_string_of(EDGE_SEED + 3)));
    assert!(masked.edges.contains_key(&entity_string_of(EDGE_SEED)));

    // The full proof answers all four: the absences above are the
    // mask's, not the identity tables'.
    let full = atlas
        .translate(&request, TranslateCaps::default(), &FULL)
        .expect("the request is under the cap");
    assert_eq!(full.nodes.len(), 2);
    assert_eq!(full.edges.len(), 2);
}

/// Locate filters partners under the mask and hides its source like a missing one.
///
/// A hidden source answers the same `UnknownEntity` in both ingress domains; a hidden partner
/// drops with its edges BEFORE the cap selects - `complete` stays `true`, so the response never
/// discloses that anything was withheld.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_filters_partners_under_the_mask() {
    let (_generation, atlas) = publish("masked-locate").await;
    let caps = ServeCaps::default();

    // Ground truth: ego(5) = partner 40 over the reciprocal pair,
    // edge rows 3 and 4.
    let source = atlas
        .resolve_source(&FULL, &entity_string_of(5))
        .expect("row 5 resolves");
    let full = atlas.locate_subgraph(source, caps.locate, &FULL);
    assert_eq!(full.rows, [5, 40], "the source and its one partner");
    assert_eq!(full.edges.len(), 2);

    // Hiding the partner removes it and both its edges: the source
    // stands alone, honestly complete - a masked ego-graph answers
    // exactly like one where the partner never existed.
    let proof = mask_hiding(&atlas, &[40]);
    let masked = atlas.locate_subgraph(source, caps.locate, &proof);
    assert_eq!(masked.rows, [5], "the hidden partner is not delivered");
    assert!(masked.edges.is_empty(), "its edges leave with it");
    assert!(masked.complete, "visibility is not truncation");

    // Hidden partners drop BEFORE selection: under a cap of one, the
    // masked response still answers from visible edges alone.
    let capped = super::locate::LocateCaps {
        edges: 1,
        ..caps.locate
    };
    let capped_masked = atlas.locate_subgraph(source, capped, &proof);
    assert!(capped_masked.complete, "zero visible edges fit any cap");
    assert!(capped_masked.edges.is_empty());

    // A hidden source is a missing source, in both ingress domains.
    let hidden_source = mask_hiding(&atlas, &[0]);
    assert_eq!(
        atlas
            .assemble_locate(&locate_request(entity_string_of(0)), caps, &hidden_source)
            .map(|_| ())
            .expect_err("the hidden source rejects"),
        super::LocateError::UnknownEntity,
    );
    let node_codec = test_codec(&atlas);
    let by_row = super::LocateRequest {
        entity_id: None,
        row: Some(node_codec.encode(0).get()),
        colored_type_ids: Vec::new(),
        filter: None,
    };
    assert_eq!(
        atlas
            .assemble_locate(&by_row, caps, &hidden_source)
            .map(|_| ())
            .expect_err("the hidden source rejects by row too"),
        super::LocateError::UnknownEntity,
    );
}

/// The proof's membership algebra is fail-closed at every boundary.
///
/// Rows beyond a bitmap's capacity read hidden, edge visibility requires both endpoints, and the
/// intersection removes exactly the hidden rows.
#[test]
fn visibility_proof_is_fail_closed() {
    use crate::bitset::BitSet;

    let mut bitmap = BitSet::new(4);
    bitmap.insert(1);
    bitmap.insert(2);
    let proof = VisibilityProof::from_bitmap(bitmap);

    assert!(!proof.contains(0));
    assert!(proof.contains(1));
    assert!(!proof.contains(3));
    // Beyond the bitmap's capacity: hidden, never a panic.
    assert!(!proof.contains(4));
    assert!(!proof.contains(u32::MAX));

    assert!(proof.edge_visible(1, 2));
    assert!(!proof.edge_visible(1, 3));
    assert!(!proof.edge_visible(0, 1));

    let mut set = crate::bitset::BitSet::new(6);
    for index in 0..6 {
        set.insert(index);
    }
    proof.intersect(&mut set);
    assert_eq!(set.iter().collect::<Vec<_>>(), [1, 2]);

    assert_eq!(proof.visible_below(4), 2);
    assert_eq!(FULL.visible_below(48), 48);
    assert!(FULL.contains(u32::MAX));
}

/// Two visible rows: the root's fill delivers what survives and spends the pool, so every
/// deeper tile is dry - delivered empty, children complete, the one delta run keeping its
/// positional slot, no backfill key.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn spent_subtrees_read_dry_and_complete() {
    let (_generation, atlas) = publish("backfill-dry").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");

    let hidden: Vec<u32> = (2..universe).collect();
    let proof = mask_hiding(&atlas, &hidden);

    let root = atlas
        .tile(&request(0, 0, 0, Mode::Delta), TileCaps::default(), &proof)
        .expect("the masked root serves");
    let root_rows = decode_rows(section(&root, ROW_IDS).expect("ROW_IDS is present"));
    assert_eq!(root_rows.len(), 2, "the root delivers both survivors");

    for (z, x, y) in [(1, 0, 0), (1, 1, 1), (2, 2, 1), (3, 5, 6)] {
        let bytes = atlas
            .tile(&request(z, x, y, Mode::Delta), TileCaps::default(), &proof)
            .expect("the masked tile serves");
        let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
        let (delivered, runs, backfilled) =
            head_counts(section(&bytes, HEAD).expect("HEAD is present"));

        assert_eq!(rows.len(), 0, "the {z}/{x}/{y} subtree is spent");
        assert_eq!(delivered, 0, "the {z}/{x}/{y} HEAD counts nothing");
        assert_eq!(runs, vec![0], "the {z}/{x}/{y} delta run keeps its slot");
        assert_eq!(backfilled, 0, "the {z}/{x}/{y} tail is empty");
        assert_eq!(
            children_of(section(&bytes, HEAD).expect("HEAD is present")),
            0,
            "the {z}/{x}/{y} children read complete",
        );
    }
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

    panic!("every tile HEAD carries the children bitmask")
}

/// The composition sweep: masked responses obey the backfill law on every endpoint. Exactness
/// is per endpoint: tiles follow the chain-fill contract; edges, translate, and locate equal
/// the unmasked response with the hidden rows' entries removed - the mask never leaks and never
/// over-drops. The fixture serves without capacity pressure on the non-tile endpoints, so their
/// filtered-full comparison is the law verbatim; locate's ground truth is the fixture edge list
/// itself - the visible ego-graph, derived edge by edge.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn composition_law_holds_under_random_masks() {
    let (generation, atlas) = publish("composition-sweep").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x51CA);

    for _ in 0..8 {
        let hidden: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
        let proof = mask_hiding(&atlas, &hidden);

        assert_tiles_mask_by_intersection(&atlas, &proof, &hidden);
        assert_edges_mask_by_intersection(&generation, &atlas, &proof, &hidden);
        assert_translate_masks_by_visibility(&atlas, &proof, &hidden);
        assert_locate_delivers_the_visible_ego_graph(&atlas, &proof, &hidden);
    }
}

/// Every tile coordinate, both modes: the masked rows are the unmasked rows with the hidden
/// entries removed, order preserved.
fn assert_tiles_mask_by_intersection(atlas: &Atlas, proof: &VisibilityProof, hidden: &[u32]) {
    let node_codec = test_codec(atlas);
    let hidden_wire: HashSet<u32> = hidden
        .iter()
        .map(|&row| node_codec.encode(row).get())
        .collect();

    // Delta row lists by coordinate; the z-ascending sweep guarantees every ancestor is present
    // when its descendants assert against the chain.
    let mut deltas: HashMap<(u8, u32, u32), Vec<u32>> = HashMap::new();

    for z in 0..=FIXTURE_LOD.max_tile_depth {
        let cells = 1_u32 << z;
        for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
            let chain: HashSet<u32> = (0..z)
                .flat_map(|level| {
                    let shift = z - level;
                    deltas[&(level, x >> shift, y >> shift)].iter().copied()
                })
                .collect();

            for mode in [Mode::Delta, Mode::Total] {
                let full_bytes = atlas
                    .tile(&request(z, x, y, mode), TileCaps::default(), &FULL)
                    .expect("the unmasked tile serves");
                let masked_bytes = atlas
                    .tile(&request(z, x, y, mode), TileCaps::default(), proof)
                    .expect("the masked tile serves");
                let full_rows =
                    decode_rows(section(&full_bytes, ROW_IDS).expect("ROW_IDS is present"));
                let masked_rows =
                    decode_rows(section(&masked_bytes, ROW_IDS).expect("ROW_IDS is present"));
                let (_, _, backfilled) =
                    head_counts(section(&masked_bytes, HEAD).expect("HEAD is present"));
                let backfilled = usize::try_from(backfilled).expect("tail counts fit usize");

                let at = format!("the {mode:?} tile {z}/{x}/{y}");
                let full_set: HashSet<u32> = full_rows.iter().copied().collect();
                let visible_full: Vec<u32> = full_rows
                    .iter()
                    .copied()
                    .filter(|wire| !hidden_wire.contains(wire))
                    .collect();

                assert!(backfilled <= masked_rows.len(), "{at} sizes its tail");
                let (naturals, tail) = masked_rows.split_at(masked_rows.len() - backfilled);
                assert_eq!(
                    masked_rows.iter().collect::<HashSet<_>>().len(),
                    masked_rows.len(),
                    "{at} delivers every point once",
                );
                for &row in tail {
                    assert!(
                        !full_set.contains(&row),
                        "{at} pulls its tail up from below"
                    );
                    assert!(!hidden_wire.contains(&row), "{at} keeps hidden rows hidden");
                }

                match mode {
                    Mode::Delta => {
                        // The natural segment is the schedule's visible survivors less the
                        // chain's earlier pull-ups, order preserved; nothing repeats down the
                        // ladder; the tail is chain-fresh. The fill stops at the schedule's own
                        // count; a total may exceed it where the chain concentrated pull-ups
                        // inside this extent.
                        assert!(
                            masked_rows.len() <= full_rows.len(),
                            "{at} stays within the schedule's budget",
                        );
                        assert!(
                            is_subsequence(naturals, &visible_full),
                            "{at} delivers natural survivors in schedule order",
                        );
                        let natural_set: HashSet<u32> = naturals.iter().copied().collect();
                        for row in &visible_full {
                            assert!(
                                natural_set.contains(row) || chain.contains(row),
                                "{at} accounts for every visible scheduled point",
                            );
                        }
                        for &row in &masked_rows {
                            assert!(!chain.contains(&row), "{at} never re-delivers the chain");
                        }

                        deltas.insert((z, x, y), masked_rows.clone());
                    }
                    Mode::Total => {
                        // The cumulative natural segment is the intersection law verbatim; the
                        // tail is exactly what the chain pulled up within this extent.
                        assert_eq!(
                            naturals, visible_full,
                            "{at} delivers the visible schedule cumulatively",
                        );
                        let own_delta: HashSet<u32> = deltas[&(z, x, y)].iter().copied().collect();
                        for &row in tail {
                            assert!(
                                chain.contains(&row) || own_delta.contains(&row),
                                "{at} totals exactly the chain's pull-ups",
                            );
                        }
                    }
                }
            }
        }
    }
}

/// Returns whether `part` appears in `whole` in order.
fn is_subsequence(part: &[u32], whole: &[u32]) -> bool {
    let mut candidates = whole.iter();
    part.iter()
        .all(|target| candidates.any(|candidate| candidate == target))
}

/// Reads the delivered count, the runs, and the backfill count from a tile `HEAD`.
fn head_counts(head: &[u8]) -> (u64, Vec<u64>, u64) {
    let mut reader = CborReader { bytes: head, at: 0 };
    let entries = reader.head(5);
    let (mut delivered, mut runs, mut backfilled) = (0, Vec::new(), 0);
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
            11 => backfilled = reader.uint(),
            _ => reader.skip(),
        }
    }

    (delivered, runs, backfilled)
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

    /// Skips one item of any shape the tile `HEAD` carries.
    fn skip(&mut self) {
        let (major, argument) = self.read_head();
        match major {
            // Uints and simple values / floats: the argument or its trailing bytes were consumed
            // by the head read already.
            0 | 7 => {}
            // Byte and text strings carry their content inline.
            2 | 3 => self.at += usize::try_from(argument).expect("section lengths fit usize"),
            // Arrays and maps recurse per element.
            4 => (0..argument).for_each(|_| self.skip()),
            5 => (0..argument * 2).for_each(|_| self.skip()),
            _ => panic!("the tile HEAD carries no major-{major} items"),
        }
    }
}

/// The masked grid answers the qualifying computation over the visible row set, byte for byte.
fn assert_edges_mask_by_intersection(
    generation: &Generation,
    atlas: &Atlas,
    proof: &VisibilityProof,
    hidden: &[u32],
) {
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let endpoints: Vec<[u64; 2]> = FIXTURE_EDGES
        .iter()
        .map(|&(_, source, target)| [source, target])
        .collect();
    let delivered: HashSet<u32> = (0..universe).filter(|row| !hidden.contains(row)).collect();
    let (sources, targets, rows) = qualifying_columns(&endpoints, &delivered);
    let (sources, targets, rows) = wire_columns(atlas, &sources, &targets, &rows);
    assert_eq!(
        atlas
            .edges(&edges_request(full_grid()), EdgesCaps::default(), proof)
            .expect("the masked grid serves"),
        expected_edges_bytes(generation, true, &sources, &targets, &rows),
    );
}

/// Every fixture identity translates exactly when visible (nodes) or when both endpoints are
/// (edges).
fn assert_translate_masks_by_visibility(atlas: &Atlas, proof: &VisibilityProof, hidden: &[u32]) {
    use super::translate::{TranslateCaps, TranslateRequest};

    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let every_identity: Vec<String> = (0..universe)
        .map(|row| entity_string_of(u8::try_from(row).expect("fixture rows fit u8")))
        .chain((0..FIXTURE_EDGES.len()).map(|row| {
            entity_string_of(EDGE_SEED + u8::try_from(row).expect("fixture edge rows fit u8"))
        }))
        .collect();
    let translated = atlas
        .translate(
            &TranslateRequest {
                entity_ids: every_identity,
            },
            TranslateCaps::default(),
            proof,
        )
        .expect("the request is under the cap");
    for row in 0..universe {
        let id = entity_string_of(u8::try_from(row).expect("fixture rows fit u8"));
        assert_eq!(
            translated.nodes.contains_key(&id),
            !hidden.contains(&row),
            "node {row} translates exactly when visible"
        );
    }
    for (row, &(_, source, target)) in FIXTURE_EDGES.iter().enumerate() {
        let id = entity_string_of(EDGE_SEED + u8::try_from(row).expect("edge rows fit u8"));
        let visible = !hidden.contains(&u32::try_from(source).expect("fixture rows fit u32"))
            && !hidden.contains(&u32::try_from(target).expect("fixture rows fit u32"));
        assert_eq!(
            translated.edges.contains_key(&id),
            visible,
            "edge {row} translates exactly when both endpoints show"
        );
    }
}

/// Every visible source's masked ego-graph is the fixture edge list filtered to visible partners.
///
/// Edges ascend by link-entity identity bytes (for the fixture, edge row), partners derive from
/// the delivered edges ascending wire row id, and `complete` stays `true`: visibility is not
/// truncation. Wherever the mask shrinks a
/// source's incident set, a second probe caps the query at exactly the visible cardinality:
/// hidden partners drop before selection, so the tight cap truncates nothing and delivers the
/// whole visible set, complete - independent of the truncation key. Selecting first and masking
/// after would come up short in exactly these configurations.
fn assert_locate_delivers_the_visible_ego_graph(
    atlas: &Atlas,
    proof: &VisibilityProof,
    hidden: &[u32],
) {
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let caps = ServeCaps::default();
    let node_codec = test_codec(atlas);

    for source_row in (0..universe).filter(|row| !hidden.contains(row)) {
        let source_id = entity_string_of(u8::try_from(source_row).expect("fixture rows fit u8"));
        let masked = atlas.locate_subgraph(
            atlas
                .resolve_source(proof, &source_id)
                .expect("a visible source resolves under the mask"),
            caps.locate,
            proof,
        );
        assert!(masked.complete, "visibility is not truncation");

        // Ground truth off the fixture edge list: incident to the
        // source, each edge once, partner visible.
        let mut expected_edges: Vec<u32> = FIXTURE_EDGES
            .iter()
            .enumerate()
            .filter(|&(_, &(_, edge_source, edge_target))| {
                let incident =
                    edge_source == u64::from(source_row) || edge_target == u64::from(source_row);
                let partner = if edge_source == u64::from(source_row) {
                    edge_target
                } else {
                    edge_source
                };
                incident && !hidden.contains(&u32::try_from(partner).expect("fixture rows fit u32"))
            })
            .map(|(row, _)| narrow_usize(row))
            .collect();
        expected_edges.sort_unstable();
        let delivered: Vec<u32> = masked.edges.iter().map(|&(edge, _)| edge.row).collect();
        assert_eq!(delivered, expected_edges, "ego({source_row}) edges");

        let mut partner_keys: Vec<(u32, u32)> = expected_edges
            .iter()
            .flat_map(|&row| {
                let (_, edge_source, edge_target) = FIXTURE_EDGES[row as usize];
                [
                    u32::try_from(edge_source).expect("fixture rows fit u32"),
                    u32::try_from(edge_target).expect("fixture rows fit u32"),
                ]
            })
            .filter(|&row| row != source_row)
            .map(|row| (node_codec.encode(row).get(), row))
            .collect();
        partner_keys.sort_unstable();
        partner_keys.dedup();
        let mut expected_rows = vec![source_row];
        expected_rows.extend(partner_keys.iter().map(|&(_, row)| row));
        assert_eq!(masked.rows, expected_rows, "ego({source_row}) rows");
        for &row in &masked.rows {
            assert!(!hidden.contains(&row), "every delivered row is visible");
        }

        // Drop-before-cap, key-independent: whenever the mask shrank
        // this source's incident set, a cap of exactly the visible
        // cardinality still delivers every visible edge.
        let incident = FIXTURE_EDGES
            .iter()
            .filter(|&&(_, edge_source, edge_target)| {
                edge_source == u64::from(source_row) || edge_target == u64::from(source_row)
            })
            .count();
        if !expected_edges.is_empty() && expected_edges.len() < incident {
            let tight = super::locate::LocateCaps {
                edges: u32::try_from(expected_edges.len()).expect("the fixture edge count fits"),
                ..caps.locate
            };
            let capped = atlas.locate_subgraph(
                atlas
                    .resolve_source(proof, &source_id)
                    .expect("a visible source resolves under the mask"),
                tight,
                proof,
            );
            assert!(
                capped.complete,
                "a cap at the visible cardinality truncates nothing"
            );
            let capped_edges: Vec<u32> = capped.edges.iter().map(|&(edge, _)| edge.row).collect();
            assert_eq!(
                capped_edges, expected_edges,
                "ego({source_row}) under the tight cap"
            );
        }
    }
}

/// Hidden and nonexistent answer identically at every id-bearing ingress, under any mask.
///
/// Eight seeded random proofs sweep every hidden row through the three ingresses that accept an
/// identifier: locate by entity id, locate by wire row id, and translate. Each denied request is
/// compared against the same request naming something that never existed - an unknown entity seed,
/// a wire value outside the codec's image - and the answers are equal values at the seam. The
/// renderers downstream are deterministic functions of those values, so equal values are equal
/// response bytes: the collapse law, swept rather than sampled.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn hidden_and_nonexistent_collapse_at_every_id_bearing_ingress() {
    use super::translate::{TranslateCaps, TranslateRequest};

    let (_generation, atlas) = publish("p8-collapse").await;
    let universe = u32::try_from(atlas.row_ids().len()).expect("the fixture universe fits u32");
    let node_codec = test_codec(&atlas);
    let caps = ServeCaps::default();

    // Identifiers that never existed: an entity seed no fixture row
    // or edge carries, and the first wire value outside the image.
    let ghost_id = entity_string_of(203);
    let ghost_wire = (0..=u32::MAX)
        .find(|&wire| atlas.resolve(&FULL, wire).is_none())
        .expect("the image has forty-eight values; almost everything is outside it");
    let by_row = |wire: u32| super::LocateRequest {
        entity_id: None,
        row: Some(wire),
        colored_type_ids: Vec::new(),
        filter: None,
    };
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x9A08);

    for _ in 0..8 {
        let hidden: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
        assert!(!hidden.is_empty(), "the seeded masks hide at least one row");
        let proof = mask_hiding(&atlas, &hidden);

        // The nonexistent baselines, once per proof.
        let missing_entity = atlas
            .assemble_locate(&locate_request(ghost_id.clone()), caps, &proof)
            .map(|_| ())
            .expect_err("an unknown entity rejects");
        let missing_row = atlas
            .assemble_locate(&by_row(ghost_wire), caps, &proof)
            .map(|_| ())
            .expect_err("an out-of-image wire value rejects");
        let missing_translated = atlas
            .translate(
                &TranslateRequest {
                    entity_ids: vec![ghost_id.clone()],
                },
                TranslateCaps::default(),
                &proof,
            )
            .expect("the request is under the cap");

        for &row in &hidden {
            let id = entity_string_of(u8::try_from(row).expect("fixture rows fit u8"));

            let denied = atlas
                .assemble_locate(&locate_request(id.clone()), caps, &proof)
                .map(|_| ())
                .expect_err("a hidden source rejects");
            assert_eq!(denied, missing_entity, "denied and missing are one error");
            assert_eq!(denied, super::LocateError::UnknownEntity);

            let denied = atlas
                .assemble_locate(&by_row(node_codec.encode(row).get()), caps, &proof)
                .map(|_| ())
                .expect_err("a hidden row's wire id rejects");
            assert_eq!(
                denied, missing_row,
                "the row ingress collapses the same way"
            );

            let denied = atlas
                .translate(
                    &TranslateRequest {
                        entity_ids: vec![id],
                    },
                    TranslateCaps::default(),
                    &proof,
                )
                .expect("the request is under the cap");
            assert_eq!(
                denied, missing_translated,
                "a denied id translates exactly like one that never existed"
            );
        }
    }
}

/// A fixed set of seal bindings for the blob tests.
///
/// `issued_at` is `1_000_000` seconds; the generation is a synthetic digest, never a published
/// root.
fn seal_bindings() -> super::seal::SealBindings {
    super::seal::SealBindings {
        purpose: super::seal::SealPurpose::Authorization,
        scope: [7; 32],
        generation: "1111111111111111111111111111111111111111111111111111111111111111"
            .parse()
            .expect("the synthetic digest parses"),
        issued_at: core::time::Duration::from_secs(1_000_000),
    }
}

/// Sealing and opening are exact inverses under equal bindings.
///
/// The recovered bitmap is bit-identical, sealing is deterministic under a fixed
/// nonce (restart survival: equal inputs, equal bytes), and the empty bitmap round-trips.
#[test]
fn sealed_blob_round_trips_bit_identical() {
    let bindings = seal_bindings();
    let secret = b"test-secret";
    let nonce = [3; 24];

    let mut bitmap = roaring::RoaringBitmap::new();
    for row in [0, 1, 5, 100_000] {
        bitmap.insert(row);
    }
    let blob = super::seal::seal(&bitmap, &bindings, secret, &nonce);
    assert_eq!(
        super::seal::seal(&bitmap, &bindings, secret, &nonce),
        blob,
        "equal inputs seal to equal bytes",
    );

    let opened = super::seal::open(
        &blob,
        bindings.purpose,
        bindings.scope,
        bindings.generation,
        secret,
        bindings.issued_at + core::time::Duration::from_secs(1),
        ServeCaps::default().seal,
    )
    .expect("the authentic blob opens");
    assert_eq!(opened, bitmap);

    let empty = super::seal::seal(&roaring::RoaringBitmap::new(), &bindings, secret, &nonce);
    assert_eq!(
        super::seal::open(
            &empty,
            bindings.purpose,
            bindings.scope,
            bindings.generation,
            secret,
            bindings.issued_at,
            ServeCaps::default().seal,
        )
        .expect("the empty bitmap opens"),
        roaring::RoaringBitmap::new(),
    );
}

/// Every foreign binding refuses, and malformed envelopes never reach the key.
#[test]
fn sealed_blob_refuses_every_foreign_binding() {
    use super::seal::{SealError, SealPurpose};

    let bindings = seal_bindings();
    let secret = b"test-secret";
    let caps = ServeCaps::default().seal;
    let now = bindings.issued_at + core::time::Duration::from_secs(1);

    let mut bitmap = roaring::RoaringBitmap::new();
    bitmap.insert_range(0..48);
    let blob = super::seal::seal(&bitmap, &bindings, secret, &nonce_of(9));

    let open = |blob: &[u8], purpose, scope, generation: &str, secret: &[u8], now| {
        super::seal::open(
            blob,
            purpose,
            scope,
            generation.parse().expect("the digest parses"),
            secret,
            now,
            caps,
        )
    };
    let ours = "1111111111111111111111111111111111111111111111111111111111111111";
    let theirs = "2222222222222222222222222222222222222222222222222222222222222222";

    // Foreign bindings: cross-generation, cross-purpose, cross-scope,
    // wrong secret - authentication failures, never remaps.
    for (case, result) in [
        (
            "cross-generation",
            open(&blob, bindings.purpose, bindings.scope, theirs, secret, now),
        ),
        (
            "cross-purpose",
            open(
                &blob,
                SealPurpose::Filter,
                bindings.scope,
                ours,
                secret,
                now,
            ),
        ),
        (
            "cross-scope",
            open(&blob, bindings.purpose, [8; 32], ours, secret, now),
        ),
        (
            "wrong secret",
            open(&blob, bindings.purpose, bindings.scope, ours, b"other", now),
        ),
    ] {
        assert_eq!(result, Err(SealError::Authentication), "{case}");
    }

    // Tampered bytes: one ciphertext byte, one tag byte, and the
    // clear issue time (bound by the associated data) all refuse.
    for index in [40, blob.len() - 1, 2] {
        let mut tampered = blob.clone();
        tampered[index] ^= 1;
        assert_eq!(
            open(
                &tampered,
                bindings.purpose,
                bindings.scope,
                ours,
                secret,
                now
            ),
            Err(SealError::Authentication),
            "tampering byte {index} refuses",
        );
    }

    // Malformed envelopes: truncation, a foreign format version, and
    // an unknown key id refuse before any cryptography runs.
    for (case, mangled) in [
        ("truncated", blob[..33].to_vec()),
        ("foreign version", {
            let mut foreign = blob.clone();
            foreign[0] = 2;
            foreign
        }),
        ("unknown key id", {
            let mut foreign = blob.clone();
            foreign[1] = 1;
            foreign
        }),
    ] {
        assert_eq!(
            open(
                &mangled,
                bindings.purpose,
                bindings.scope,
                ours,
                secret,
                now
            ),
            Err(SealError::Envelope),
            "{case}",
        );
    }
}

/// The clock rule accepts through the hard cap and refuses beyond it, in both directions.
///
/// Age equal to the cap is the last accepted instant (`now - issued_at ≤ T_hard`); one
/// second past refuses, and a future-dated blob refuses outright.
#[test]
fn sealed_blob_clock_accepts_through_the_hard_cap() {
    use core::time::Duration;

    use super::seal::SealError;

    let bindings = seal_bindings();
    let secret = b"test-secret";
    let caps = ServeCaps::default().seal;
    let mut bitmap = roaring::RoaringBitmap::new();
    bitmap.insert(1);
    let blob = super::seal::seal(&bitmap, &bindings, secret, &nonce_of(1));

    let open_at = |now| {
        super::seal::open(
            &blob,
            bindings.purpose,
            bindings.scope,
            bindings.generation,
            secret,
            now,
            caps,
        )
    };

    assert_eq!(caps.hard, Duration::from_mins(15));
    assert_eq!(caps.soft, Duration::from_mins(10));
    assert!(open_at(bindings.issued_at).is_ok(), "age zero accepts");
    assert!(
        open_at(bindings.issued_at + Duration::from_mins(15)).is_ok(),
        "age at the hard cap accepts",
    );
    assert_eq!(
        open_at(bindings.issued_at + Duration::from_secs(901)),
        Err(SealError::Stale),
        "age past the hard cap refuses",
    );
    assert_eq!(
        open_at(
            bindings
                .issued_at
                .checked_sub(Duration::from_secs(1))
                .expect("the fixture issue time is past the epoch")
        ),
        Err(SealError::Stale),
        "a future-dated blob refuses",
    );
}

/// Padding quantizes serialized-size leakage to a power-of-two bucket.
///
/// Every bitmap in the floor bucket seals to the same 1074 bytes (34-byte header + 1 KiB padded
/// plaintext + 16-byte tag), hiding one row of a larger set moves nothing, and
/// every padded width is a power of two at or above the floor. Bucket transitions remain
/// correlated with cardinality and container layout - the 502/503 boundary below is that
/// correlation made exact - so the certificate is quantization, never length-hiding.
///
/// The sets scatter their rows (step 3) so roaring stores array containers - contiguous ranges
/// collapse to run containers a few bytes wide and would never leave the floor bucket. One
/// scattered container serializes to `16 + 2n` bytes, so with the 4-byte length prefix the floor
/// bucket holds exactly the cardinalities through 502.
#[test]
fn sealed_blob_length_quantizes_to_the_padding_bucket() {
    let bindings = seal_bindings();
    let secret = b"test-secret";

    let scattered = |cardinality: u32| {
        (0..cardinality)
            .map(|index| index * 3)
            .collect::<roaring::RoaringBitmap>()
    };
    let of_cardinality = |cardinality: u32| {
        super::seal::seal(&scattered(cardinality), &bindings, secret, &nonce_of(5)).len()
    };

    // Cardinalities 0 through the 502 boundary: one floor bucket.
    assert_eq!(of_cardinality(0), 34 + 1024 + 16);
    assert_eq!(of_cardinality(1), 34 + 1024 + 16);
    assert_eq!(of_cardinality(300), 34 + 1024 + 16);
    assert_eq!(of_cardinality(502), 34 + 1024 + 16, "the last floor row");

    // One more row crosses the bucket edge; hiding one row of the
    // larger set moves nothing.
    assert_eq!(of_cardinality(503), 34 + 2048 + 16, "the first row past");
    let mut perturbed = scattered(700);
    assert_eq!(of_cardinality(700), 34 + 2048 + 16);
    perturbed.remove(3 * 17);
    assert_eq!(
        super::seal::seal(&perturbed, &bindings, secret, &nonce_of(5)).len(),
        34 + 2048 + 16,
    );

    // A thirty-thousand-row scattered bitmap still pads to a power
    // of two.
    let padded = of_cardinality(30_000) - 34 - 16;
    assert!(padded.is_power_of_two() && padded >= 1024);
}

/// Builds a distinct 24-byte nonce for the seal tests.
fn nonce_of(tag: u8) -> [u8; 24] {
    [tag; 24]
}

/// A second expression of the sealed-blob construction.
///
/// Envelope layout, key derivation, the associated-data map, framing, and padding are all
/// expressed a second time from the pinned construction, with the CBOR hand-encoded rather than
/// shared with the production writer. Agreement between this module and [`super::seal`] freezes
/// the blob format as two implementations, not one; disagreement fails the pin, whichever side
/// drifted.
mod seal_reference {
    use chacha20poly1305::{
        Key, KeyInit as _, XChaCha20Poly1305, XNonce,
        aead::{Aead as _, Payload},
    };
    use hkdf::Hkdf;
    use sha2::Sha256;

    use super::super::seal::{SealBindings, SealPurpose};

    /// The envelope's fixed format version.
    const VERSION: u8 = 1;

    /// The envelope's fixed key id.
    const KEY_ID: u8 = 0;

    /// The padding bucket floor in bytes.
    const PAD_FLOOR: usize = 1024;

    /// Derives one purpose key: HKDF-SHA256 salted by the generation digest over the secret.
    fn key(bindings: &SealBindings, secret: &[u8]) -> [u8; 32] {
        let label: &[u8] = match bindings.purpose {
            SealPurpose::Authorization => b"atlas.seal.authz.v0",
            SealPurpose::Filter => b"atlas.seal.filter.v0",
        };
        let mut key = [0_u8; 32];
        Hkdf::<Sha256>::new(Some(&bindings.generation.digest().to_bytes()), secret)
            .expand(label, &mut key)
            .expect("thirty-two bytes is a valid HKDF-SHA256 output length");
        key
    }

    /// Appends one canonical-CBOR unsigned integer: shortest form, big-endian.
    #[expect(
        clippy::big_endian_bytes,
        reason = "canonical CBOR is pinned big-endian"
    )]
    fn cbor_uint(out: &mut Vec<u8>, value: u64) {
        match value {
            0..24 => out.push(u8::try_from(value).expect("the value is below 24")),
            24..=0xFF => {
                out.push(0x18);
                out.push(u8::try_from(value).expect("the value fits one byte"));
            }
            0x100..=0xFFFF => {
                out.push(0x19);
                out.extend_from_slice(&u16::try_from(value).expect("two bytes").to_be_bytes());
            }
            0x1_0000..=0xFFFF_FFFF => {
                out.push(0x1A);
                out.extend_from_slice(&u32::try_from(value).expect("four bytes").to_be_bytes());
            }
            _ => {
                out.push(0x1B);
                out.extend_from_slice(&value.to_be_bytes());
            }
        }
    }

    /// Encodes the associated data: a five-entry map, integer keys ascending, definite lengths.
    fn associated_data(bindings: &SealBindings) -> Vec<u8> {
        let purpose = match bindings.purpose {
            SealPurpose::Authorization => 0_u64,
            SealPurpose::Filter => 1_u64,
        };
        let mut out = vec![0xA5];
        cbor_uint(&mut out, 0);
        cbor_uint(&mut out, purpose);
        cbor_uint(&mut out, 1);
        out.push(0x58);
        out.push(32);
        out.extend_from_slice(&bindings.scope);
        cbor_uint(&mut out, 2);
        out.push(0x58);
        out.push(32);
        out.extend_from_slice(&bindings.generation.digest().to_bytes());
        cbor_uint(&mut out, 3);
        cbor_uint(&mut out, bindings.issued_at.as_secs());
        cbor_uint(&mut out, 4);
        cbor_uint(&mut out, u64::from(VERSION));
        out
    }

    /// Seals an arbitrary plaintext under the bindings - malformed bodies included.
    ///
    /// The production seal cannot produce a malformed plaintext; this path exists so the format
    /// negatives are reachable at all.
    pub(super) fn seal_raw(
        plaintext: &[u8],
        bindings: &SealBindings,
        secret: &[u8],
        nonce: &[u8; 24],
    ) -> Vec<u8> {
        let cipher = XChaCha20Poly1305::new(Key::from_slice(&key(bindings, secret)));
        let sealed = cipher
            .encrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: plaintext,
                    aad: &associated_data(bindings),
                },
            )
            .expect("encryption of an in-memory payload succeeds");

        let mut blob = vec![VERSION, KEY_ID];
        blob.extend_from_slice(&bindings.issued_at.as_secs().to_le_bytes());
        blob.extend_from_slice(nonce);
        blob.extend_from_slice(&sealed);
        blob
    }

    /// Seals a bitmap: length-prefixed roaring portable bytes, zero-padded to the bucket.
    pub(super) fn seal(
        bitmap: &roaring::RoaringBitmap,
        bindings: &SealBindings,
        secret: &[u8],
        nonce: &[u8; 24],
    ) -> Vec<u8> {
        seal_raw(&frame(bitmap), bindings, secret, nonce)
    }

    /// Frames a bitmap: `u32 LE` length, portable bytes, zero padding to the power-of-two bucket.
    pub(super) fn frame(bitmap: &roaring::RoaringBitmap) -> Vec<u8> {
        let mut body = Vec::new();
        bitmap
            .serialize_into(&mut body)
            .expect("serializing into a vector cannot fail");
        let mut framed = Vec::from(
            u32::try_from(body.len())
                .expect("the bitmap fits u32")
                .to_le_bytes(),
        );
        framed.extend_from_slice(&body);
        let padded = framed.len().next_power_of_two().max(PAD_FLOOR);
        framed.resize(padded, 0);
        framed
    }

    /// Opens one blob independently: envelope parse, decrypt, strict unframe.
    ///
    /// Panics on any malformation - the reference opens known-good blobs; refusal taxonomy is the
    /// production `open`'s contract, not this module's.
    pub(super) fn open(
        blob: &[u8],
        bindings: &SealBindings,
        secret: &[u8],
    ) -> roaring::RoaringBitmap {
        assert!(blob.len() > 34, "the envelope holds its header and a tag");
        assert_eq!(blob[0], VERSION, "the version leads the envelope");
        assert_eq!(blob[1], KEY_ID, "the key id follows");
        let issued = u64::from_le_bytes(blob[2..10].try_into().expect("eight issued-at bytes"));
        assert_eq!(
            issued,
            bindings.issued_at.as_secs(),
            "issued-at travels in the clear"
        );
        let nonce = &blob[10..34];
        let cipher = XChaCha20Poly1305::new(Key::from_slice(&key(bindings, secret)));
        let plaintext = cipher
            .decrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: &blob[34..],
                    aad: &associated_data(bindings),
                },
            )
            .expect("the tag authenticates");
        let length =
            u32::from_le_bytes(plaintext[..4].try_into().expect("four length bytes")) as usize;
        let framed = 4 + length;
        assert!(
            plaintext[framed..].iter().all(|&byte| byte == 0),
            "padding is zero"
        );
        assert_eq!(plaintext.len(), framed.next_power_of_two().max(PAD_FLOOR));
        roaring::RoaringBitmap::deserialize_from(&plaintext[4..framed])
            .expect("the body is portable roaring")
    }
}

/// The production seal and the independent reference agree, byte for byte, both ways.
///
/// Equal inputs give equal blobs across purposes, scopes, generations, issue times, and bitmap
/// shapes - the pinned construction is the format, witnessed by two implementations. The
/// reference also opens the production blobs independently, and the production `open` accepts
/// the reference's: the refusal negatives' positive complement, and the round-trip's
/// bit-identity in a second expression.
#[test]
fn sealed_blob_agrees_with_the_spec_reference() {
    let secret = b"reference-seal-secret";
    let mut scattered = roaring::RoaringBitmap::new();
    for row in 0..600_u32 {
        scattered.insert(row * 97);
    }
    let mut small = roaring::RoaringBitmap::new();
    for row in [3_u32, 44, 1_000_000] {
        small.insert(row);
    }
    let cases: [(roaring::RoaringBitmap, super::seal::SealBindings, [u8; 24]); 3] = [
        (roaring::RoaringBitmap::new(), seal_bindings(), [1; 24]),
        (
            small,
            {
                let mut bindings = seal_bindings();
                bindings.purpose = super::seal::SealPurpose::Filter;
                bindings.scope = [9; 32];
                bindings
            },
            [2; 24],
        ),
        (
            scattered,
            {
                let mut bindings = seal_bindings();
                bindings.generation =
                    "2222222222222222222222222222222222222222222222222222222222222222"
                        .parse()
                        .expect("the synthetic digest parses");
                bindings.issued_at = core::time::Duration::from_secs(123_456_789);
                bindings
            },
            [3; 24],
        ),
    ];

    for (bitmap, bindings, nonce) in &cases {
        let production = super::seal::seal(bitmap, bindings, secret, nonce);
        let reference = seal_reference::seal(bitmap, bindings, secret, nonce);
        assert_eq!(production, reference, "two expressions, one blob");

        assert_eq!(
            &seal_reference::open(&production, bindings, secret),
            bitmap,
            "the reference opens the production blob"
        );
        assert_eq!(
            &super::seal::open(
                &reference,
                bindings.purpose,
                bindings.scope,
                bindings.generation,
                secret,
                bindings.issued_at,
                super::seal::SealCaps::default(),
            )
            .expect("the production open accepts the reference blob"),
            bitmap,
        );
    }
}

/// Malformed plaintexts refuse as `Format`, reachable only through the reference.
///
/// The production seal cannot emit them, so the reference seals them by hand: a length prefix
/// claiming more than the body holds, an undecodable roaring body, and nonzero padding. A control
/// case seals a well-formed frame through the same raw path and opens - the negatives fail on
/// format alone, nothing else in the pipeline.
#[test]
fn sealed_blob_refuses_malformed_plaintexts() {
    let secret = b"reference-seal-secret";
    let bindings = seal_bindings();
    let nonce = [4_u8; 24];
    let open = |plaintext: &[u8]| {
        super::seal::open(
            &seal_reference::seal_raw(plaintext, &bindings, secret, &nonce),
            bindings.purpose,
            bindings.scope,
            bindings.generation,
            secret,
            bindings.issued_at,
            super::seal::SealCaps::default(),
        )
    };

    // The length prefix claims more than the plaintext holds.
    let mut overclaim = vec![0_u8; 1024];
    overclaim[..4].copy_from_slice(&2000_u32.to_le_bytes());
    assert_eq!(open(&overclaim), Err(super::seal::SealError::Format));

    // The prefix is honest, the body is not portable roaring.
    let mut garbage = vec![0_u8; 1024];
    garbage[..4].copy_from_slice(&64_u32.to_le_bytes());
    garbage[4..68].fill(0xDE);
    assert_eq!(open(&garbage), Err(super::seal::SealError::Format));

    // A well-formed frame whose padding carries a nonzero byte.
    let mut unpadded = seal_reference::frame(&roaring::RoaringBitmap::new());
    *unpadded.last_mut().expect("the frame is padded") = 0xFF;
    assert_eq!(open(&unpadded), Err(super::seal::SealError::Format));

    // Control: the same raw path with a canonical frame opens.
    assert_eq!(
        open(&seal_reference::frame(&roaring::RoaringBitmap::new())),
        Ok(roaring::RoaringBitmap::new()),
    );
}

/// The restricted-view selection law, written a second time.
///
/// From the card's construction and the independently opened artifacts rather than from
/// `serve::tile`: extents narrow by scanning the raw code column against
/// [`MortonCell::contains`], the schedule rule, the ancestor chain, and the fill order re-derive
/// from the documented law alone. The chain replays every level in full - the production dry
/// short-circuit is absent by design, so agreement across the battery proves that shortcut
/// behavior-preserving. Agreement freezes the delivered rows, their order, the per-bucket
/// recounts, and the tail length at once.
mod backfill_reference {
    use std::collections::HashSet;

    use super::super::VisibilityProof;
    use crate::{
        file::morton::read::MortonFile,
        morton::{Depth, MortonCell, MortonKey},
    };

    /// One delivery as the law states it: positions in wire order plus the head counts.
    pub(super) struct Delivery {
        /// Delivered base positions: the natural segment first, the tail after, order preserved.
        pub positions: Vec<u64>,
        /// The natural segment's per-bucket recounts.
        pub runs: Vec<u64>,
        /// The tail's length.
        pub backfilled: u64,
        /// The schedule's unmasked count: the fill target.
        pub budget: u64,
    }

    /// Returns the cell one tile coordinate addresses.
    pub(super) fn cell(z: u8, x: u32, y: u32) -> MortonCell {
        MortonCell::new(
            Depth::new(z).expect("tile zooms lie within the key width"),
            x,
            y,
        )
        .expect("the sweep stays on each zoom's grid")
    }

    /// The extent's positions inside `bucket`, in base order.
    ///
    /// A whole-segment membership scan: no fencepost run arithmetic and no contiguity
    /// assumption, so the reference cannot inherit a run-derivation defect.
    pub(super) fn extent_positions(morton: &MortonFile, bucket: u8, cell: MortonCell) -> Vec<u64> {
        morton
            .fenceposts()
            .segment(Depth::new(bucket).expect("every bucket index names a valid depth"))
            .filter(|&position| cell.contains(morton.code(position)))
            .collect()
    }

    /// The deepest bucket holding any point.
    fn deepest(morton: &MortonFile) -> u8 {
        let lengths = morton.fenceposts().lengths();
        let last = lengths
            .iter()
            .rposition(|&length| length > 0)
            .expect("the fixture corpus is nonempty");
        u8::try_from(last).expect("bucket indexes fit u8")
    }

    /// One corpus as the reference walks it: extent scans, depth, schedule, and visibility.
    ///
    /// The law's replay below is corpus-agnostic: it reads extents, the deepest bucket, the
    /// schedule's span, and per-position visibility through this surface, so the fixture's
    /// opened artifacts and a plain-columns corpus replay through the same loops.
    pub(super) struct Corpus<P, V> {
        /// Returns the extent's positions inside a bucket, in base order.
        pub positions: P,
        /// The deepest bucket holding any point.
        pub deepest: u8,
        /// The schedule's span exponent.
        pub span: u8,
        /// Returns whether a position's row is visible.
        pub visible: V,
    }

    /// The fixture corpus: independently opened artifacts under a serving-side proof.
    pub(super) fn fixture<'c>(
        morton: &'c MortonFile,
        row_ids: &'c [u32],
        proof: &'c VisibilityProof,
    ) -> Corpus<impl Fn(u8, MortonCell) -> Vec<u64> + 'c, impl Fn(u64) -> bool + 'c> {
        Corpus {
            positions: move |bucket, cell| extent_positions(morton, bucket, cell),
            deepest: deepest(morton),
            span: super::FIXTURE_LOD.span.get(),
            visible: move |position| {
                let index = usize::try_from(position).expect("fixture positions fit usize");
                proof.contains(row_ids[index])
            },
        }
    }

    /// A plain-columns corpus under a per-row visibility column.
    ///
    /// The mirror of the fixture shape for a corpus that exists only as columns; `span` names
    /// the schedule the corpus was cascaded under.
    pub(super) fn columns<'c>(
        codes: &'c [u64],
        segments: &'c [(usize, usize)],
        rows: &'c [u32],
        span: u8,
        visible: &'c [bool],
    ) -> Corpus<impl Fn(u8, MortonCell) -> Vec<u64> + 'c, impl Fn(u64) -> bool + 'c> {
        let deepest = segments
            .iter()
            .rposition(|&(start, end)| end > start)
            .expect("the corpus is nonempty");
        Corpus {
            positions: move |bucket: u8, cell: MortonCell| {
                let (start, end) = segments[usize::from(bucket)];
                (start..end)
                    .filter(|&position| cell.contains(MortonKey::from_bits(codes[position])))
                    .map(|position| u64::try_from(position).expect("positions fit u64"))
                    .collect()
            },
            deepest: u8::try_from(deepest).expect("bucket indexes fit u8"),
            span,
            visible: move |position| {
                let index = usize::try_from(position).expect("positions fit usize");
                visible[usize::try_from(rows[index]).expect("row ids fit usize")]
            },
        }
    }

    /// Delivers one level per the law: naturals per scheduled bucket, then the fill.
    fn level<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        z: u8,
        x: u32,
        y: u32,
        taken: &mut HashSet<u64>,
    ) -> Delivery {
        let cell = cell(z, x, y);
        let cut = z + corpus.span;
        let first = if z == 0 { 0 } else { cut };

        let mut delivery = Delivery {
            positions: Vec::new(),
            runs: Vec::new(),
            backfilled: 0,
            budget: 0,
        };
        for bucket in first..=cut {
            let candidates = (corpus.positions)(bucket, cell);
            delivery.budget += u64::try_from(candidates.len()).expect("corpus counts fit u64");
            let before = delivery.positions.len();
            for position in candidates {
                if (corpus.visible)(position) && taken.insert(position) {
                    delivery.positions.push(position);
                }
            }
            delivery.runs.push(
                u64::try_from(delivery.positions.len() - before).expect("corpus counts fit u64"),
            );
        }

        let mut count = u64::try_from(delivery.positions.len()).expect("corpus counts fit u64");
        'fill: for bucket in (cut + 1)..=corpus.deepest {
            if count == delivery.budget {
                break;
            }
            for position in (corpus.positions)(bucket, cell) {
                if (corpus.visible)(position) && taken.insert(position) {
                    delivery.positions.push(position);
                    delivery.backfilled += 1;
                    count += 1;
                    if count == delivery.budget {
                        break 'fill;
                    }
                }
            }
        }

        delivery
    }

    /// The delta response: every ancestor replayed top-down, then the level itself.
    ///
    /// Returns the delivery and the chain's whole taken set, the level included.
    pub(super) fn delta<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        z: u8,
        x: u32,
        y: u32,
    ) -> (Delivery, HashSet<u64>) {
        let mut taken = HashSet::new();
        for ancestor in 0..z {
            let shift = z - ancestor;
            // The ancestor's delivery matters only through `taken`.
            level(corpus, ancestor, x >> shift, y >> shift, &mut taken);
        }
        let own = level(corpus, z, x, y, &mut taken);

        (own, taken)
    }

    /// The total response: the cumulative visible schedule, then the chain's pull-ups.
    pub(super) fn total<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        z: u8,
        x: u32,
        y: u32,
    ) -> Delivery {
        let (_, taken) = delta(corpus, z, x, y);

        let cell = cell(z, x, y);
        let cut = z + corpus.span;

        let mut delivery = Delivery {
            positions: Vec::new(),
            runs: Vec::new(),
            backfilled: 0,
            budget: 0,
        };
        // Every visible scheduled point is delivered by its own level of the chain, so the
        // cumulative natural segment is the schedule's visible survivors verbatim.
        for bucket in 0..=cut {
            let candidates = (corpus.positions)(bucket, cell);
            delivery.budget += u64::try_from(candidates.len()).expect("corpus counts fit u64");
            let before = delivery.positions.len();
            for position in candidates {
                if (corpus.visible)(position) {
                    delivery.positions.push(position);
                }
            }
            delivery.runs.push(
                u64::try_from(delivery.positions.len() - before).expect("corpus counts fit u64"),
            );
        }
        // The tail: deeper extent points some level of the chain pulled up, in bucket-major
        // base order.
        for bucket in (cut + 1)..=corpus.deepest {
            for position in (corpus.positions)(bucket, cell) {
                if taken.contains(&position) {
                    delivery.positions.push(position);
                    delivery.backfilled += 1;
                }
            }
        }

        delivery
    }

    /// Replays a root-anchored descent path, returning each coordinate's delta delivery.
    ///
    /// Along a descent path every coordinate's ancestor chain is exactly the path's prefix, so
    /// one shared taken set replays each tile's chain without re-walking it: entry `i` equals
    /// [`delta`] at `path[i]`.
    ///
    /// # Panics
    ///
    /// Panics when the path is not root-anchored or skips a generation.
    pub(super) fn path_deliveries<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        path: &[(u8, u32, u32)],
    ) -> Vec<Delivery> {
        assert_eq!(
            path.first(),
            Some(&(0, 0, 0)),
            "a chain replay is root-anchored"
        );
        for (&(z, x, y), &(below, cx, cy)) in path.iter().zip(&path[1..]) {
            assert!(
                below == z + 1 && cx >> 1 == x && cy >> 1 == y,
                "the path descends one child at a time",
            );
        }

        let mut taken = HashSet::new();
        path.iter()
            .map(|&(z, x, y)| level(corpus, z, x, y, &mut taken))
            .collect()
    }
}

/// Proof shapes that exercise the fill: the operator proof, independent hiding at two rates, the
/// root schedule hidden whole, the densest `z = 1` subtree hidden whole, and near-total hiding.
fn backfill_battery(
    atlas: &Atlas,
    morton: &MortonFile,
    row_ids: &[u32],
) -> Vec<(&'static str, VisibilityProof)> {
    let universe = u32::try_from(row_ids.len()).expect("the fixture universe fits u32");
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x0BAC_F111);
    let row_at = |position: u64| row_ids[usize::try_from(position).expect("positions fit usize")];

    let quarter: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
    let most: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(4, 5)).collect();

    // The root's whole schedule: every fill starts from a dead standstill.
    let mut scheduled = Vec::new();
    for bucket in 0..=FIXTURE_LOD.span.get() {
        let root = backfill_reference::cell(0, 0, 0);
        scheduled.extend(
            backfill_reference::extent_positions(morton, bucket, root)
                .into_iter()
                .map(row_at),
        );
    }

    // The densest z = 1 subtree, hidden whole: its tiles exhaust, its neighbors fill.
    let densest = (0..2_u32)
        .flat_map(|x| (0..2_u32).map(move |y| (x, y)))
        .max_by_key(|&(x, y)| {
            (0..=32_u8)
                .map(|bucket| {
                    backfill_reference::extent_positions(
                        morton,
                        bucket,
                        backfill_reference::cell(1, x, y),
                    )
                    .len()
                })
                .sum::<usize>()
        })
        .expect("the z = 1 grid is nonempty");
    let subtree: Vec<u32> = (0..=32_u8)
        .flat_map(|bucket| {
            backfill_reference::extent_positions(
                morton,
                bucket,
                backfill_reference::cell(1, densest.0, densest.1),
            )
        })
        .map(row_at)
        .collect();

    let sparse: Vec<u32> = (0..universe)
        .filter(|&row| !row.is_multiple_of(16))
        .collect();

    vec![
        ("operator", VisibilityProof::full_visibility()),
        ("quarter-hidden", mask_hiding(atlas, &quarter)),
        ("most-hidden", mask_hiding(atlas, &most)),
        ("schedule-hidden", mask_hiding(atlas, &scheduled)),
        ("subtree-hidden", mask_hiding(atlas, &subtree)),
        ("three-visible", mask_hiding(atlas, &sparse)),
    ]
}

/// The base-position map of the delivered wire ids, decode-verified.
fn delivered_positions(
    bytes: &[u8],
    node_codec: &codec::RowCodec,
    position_of: &HashMap<u32, u64>,
) -> Vec<u64> {
    decode_rows(section(bytes, ROW_IDS).expect("ROW_IDS is present"))
        .iter()
        .map(|&wire| {
            let row = node_codec.decode(wire).expect("delivered wire ids decode");
            position_of[&row]
        })
        .collect()
}

/// The two expressions of the selection law agree on every delivery.
///
/// The wire response against the spec reference, per proof shape, per coordinate of every zoom,
/// in both modes: the delivered wire ids in order, the per-bucket recounts, the tail length, and
/// the HEAD's delivered count are one assertion each. The reference replays the whole chain, so
/// every agreement under an exhausting mask also certifies the production dry short-circuit.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_delivery_agrees_with_the_selection_reference() {
    let (generation, atlas) = publish("backfill-reference").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);

    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        let corpus = backfill_reference::fixture(&artifacts.morton, row_ids, &proof);
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                for mode in [Mode::Delta, Mode::Total] {
                    let bytes = atlas
                        .tile(&request(z, x, y, mode), TileCaps::default(), &proof)
                        .expect("the masked tile serves");
                    let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
                    let (delivered, runs, backfilled) =
                        head_counts(section(&bytes, HEAD).expect("HEAD is present"));

                    let expected = match mode {
                        Mode::Delta => backfill_reference::delta(&corpus, z, x, y).0,
                        Mode::Total => backfill_reference::total(&corpus, z, x, y),
                    };
                    let expected_rows: Vec<u32> = expected
                        .positions
                        .iter()
                        .map(|&position| {
                            let index =
                                usize::try_from(position).expect("fixture positions fit usize");
                            node_codec.encode(row_ids[index]).get()
                        })
                        .collect();

                    let at = format!("{name}: the {mode:?} tile {z}/{x}/{y}");
                    assert_eq!(rows, expected_rows, "{at} delivers the law's rows in order");
                    assert_eq!(runs, expected.runs, "{at} recounts the law's runs");
                    assert_eq!(backfilled, expected.backfilled, "{at} sizes the law's tail");
                    assert_eq!(
                        usize::try_from(delivered).expect("fixture counts fit usize"),
                        rows.len(),
                        "{at} heads its own count",
                    );
                }
            }
        }
    }
}

/// A fill that stops short certifies exhaustion: the strong form of saturation.
///
/// Wherever a masked delta delivers fewer points than its schedule's budget, every visible
/// position of the whole extent is accounted for by the chain through that tile - the fill never
/// under-delivers while visible candidates remain. The chain derives from the wire itself and
/// the pool from the raw code column, so the certificate is independent of both expressions of
/// the selection law. The battery must reach the short-fill regime for the pin to bind, and the
/// sweep asserts that it does.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_short_fill_certifies_the_extent_exhausted() {
    let (generation, atlas) = publish("backfill-exhaustion").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<u32, u64> = row_ids
        .iter()
        .enumerate()
        .map(|(position, &row)| {
            (
                row,
                u64::try_from(position).expect("fixture positions fit u64"),
            )
        })
        .collect();

    let mut shorts = 0_u32;
    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        let visible = |position: u64| {
            let index = usize::try_from(position).expect("fixture positions fit usize");
            proof.contains(row_ids[index])
        };

        // Wire-derived chain state: the z-ascending sweep guarantees every ancestor's delta is
        // present when its descendants read it.
        let mut deltas: HashMap<(u8, u32, u32), Vec<u64>> = HashMap::new();
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let bytes = atlas
                    .tile(&request(z, x, y, Mode::Delta), TileCaps::default(), &proof)
                    .expect("the masked tile serves");
                let positions = delivered_positions(&bytes, &node_codec, &position_of);

                let cell = backfill_reference::cell(z, x, y);
                let span = FIXTURE_LOD.span.get();
                let scheduled = if z == 0 {
                    0..=span
                } else {
                    (z + span)..=(z + span)
                };
                let budget: usize = scheduled
                    .map(|bucket| {
                        backfill_reference::extent_positions(&artifacts.morton, bucket, cell).len()
                    })
                    .sum();

                if positions.len() < budget {
                    shorts += 1;
                    let taken: HashSet<u64> = (0..z)
                        .flat_map(|level| {
                            let shift = z - level;
                            deltas[&(level, x >> shift, y >> shift)].iter().copied()
                        })
                        .chain(positions.iter().copied())
                        .collect();
                    for bucket in 0..=32_u8 {
                        for position in
                            backfill_reference::extent_positions(&artifacts.morton, bucket, cell)
                        {
                            assert!(
                                !visible(position) || taken.contains(&position),
                                "{name}: the short {z}/{x}/{y} leaves position {position} visible \
                                 and undelivered",
                            );
                        }
                    }
                }

                deltas.insert((z, x, y), positions);
            }
        }
    }

    assert!(shorts > 0, "the battery reaches the short-fill regime");
}

/// The fill saturates at the boundary, and a partial fill is a base-order prefix.
///
/// At the root, proofs sized one below, at, and one above the schedule's budget pin
/// `delivered = min(budget, pool)` at the boundary, and the surviving candidate order pins the
/// morton tie-break: the one undelivered candidate at `budget + 1` is exactly the base-order
/// last.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_fill_saturates_at_the_boundary_in_base_order() {
    let (generation, atlas) = publish("backfill-boundary").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<u32, u64> = row_ids
        .iter()
        .enumerate()
        .map(|(position, &row)| {
            (
                row,
                u64::try_from(position).expect("fixture positions fit u64"),
            )
        })
        .collect();
    let row_at = |position: u64| row_ids[usize::try_from(position).expect("positions fit usize")];

    // The root's candidates in bucket-major base order, and its schedule's budget.
    let root = backfill_reference::cell(0, 0, 0);
    let candidates: Vec<u64> = (0..=32_u8)
        .flat_map(|bucket| backfill_reference::extent_positions(&artifacts.morton, bucket, root))
        .collect();
    let budget: usize = (0..=FIXTURE_LOD.span.get())
        .map(|bucket| backfill_reference::extent_positions(&artifacts.morton, bucket, root).len())
        .sum();
    assert!(
        budget < candidates.len() - budget,
        "the fixture's deep pool covers the boundary sweep",
    );

    for excess in [-1_i64, 0, 1] {
        let pool = usize::try_from(i64::try_from(budget).expect("budgets fit i64") + excess)
            .expect("the boundary sizes are positive");
        // The deep end of the base order: the schedule is hidden whole, so the delivery is all
        // fill and the fill order is nakedly observable.
        let visible = &candidates[candidates.len() - pool..];
        let visible_rows: HashSet<u32> = visible.iter().map(|&position| row_at(position)).collect();
        let hidden: Vec<u32> = row_ids
            .iter()
            .copied()
            .filter(|row| !visible_rows.contains(row))
            .collect();
        let proof = mask_hiding(&atlas, &hidden);

        let bytes = atlas
            .tile(&request(0, 0, 0, Mode::Delta), TileCaps::default(), &proof)
            .expect("the masked root serves");
        let positions = delivered_positions(&bytes, &node_codec, &position_of);

        let expected: Vec<u64> = visible[..budget.min(pool)].to_vec();
        assert_eq!(
            positions, expected,
            "a pool of budget {excess:+} delivers min(budget, pool) in base order",
        );
        if excess == 1 {
            assert!(
                !positions.contains(visible.last().expect("the pool is nonempty")),
                "the one undelivered candidate is the base-order last",
            );
        }
    }
}

/// The delivered count is a function of the masked view alone.
///
/// Across the whole battery and every tile, the count law
/// `delivered = min(budget, |visible ∩ extent| - |chain takes|)` holds with the chain read off
/// the wire: the budget is the schedule's public count and the pool is the raw code column's
/// visible extent, so the cardinality discloses nothing a masked view does not already imply.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn delivered_count_is_a_function_of_the_masked_view_alone() {
    let (generation, atlas) = publish("backfill-count-law").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<u32, u64> = row_ids
        .iter()
        .enumerate()
        .map(|(position, &row)| {
            (
                row,
                u64::try_from(position).expect("fixture positions fit u64"),
            )
        })
        .collect();

    // The count law across the battery: every tile, chain read off the wire.
    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        let mut deltas: HashMap<(u8, u32, u32), Vec<u64>> = HashMap::new();
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let bytes = atlas
                    .tile(&request(z, x, y, Mode::Delta), TileCaps::default(), &proof)
                    .expect("the masked tile serves");
                let positions = delivered_positions(&bytes, &node_codec, &position_of);

                let cell = backfill_reference::cell(z, x, y);
                let span = FIXTURE_LOD.span.get();
                let scheduled = if z == 0 {
                    0..=span
                } else {
                    (z + span)..=(z + span)
                };
                let budget: usize = scheduled
                    .map(|bucket| {
                        backfill_reference::extent_positions(&artifacts.morton, bucket, cell).len()
                    })
                    .sum();

                let chain: HashSet<u64> = (0..z)
                    .flat_map(|level| {
                        let shift = z - level;
                        deltas[&(level, x >> shift, y >> shift)].iter().copied()
                    })
                    .collect();
                let pool = (0..=32_u8)
                    .flat_map(|bucket| {
                        backfill_reference::extent_positions(&artifacts.morton, bucket, cell)
                    })
                    .filter(|&position| {
                        let index = usize::try_from(position).expect("positions fit usize");
                        proof.contains(row_ids[index]) && !chain.contains(&position)
                    })
                    .count();

                assert_eq!(
                    positions.len(),
                    budget.min(pool),
                    "{name}: the {z}/{x}/{y} count is min(budget, pool) - a function of the \
                     masked view alone",
                );

                deltas.insert((z, x, y), positions);
            }
        }
    }
}

/// The wire and the walk instrument agree across the battery.
///
/// `WalkBench::from_parts` rebuilds the walk instrument over the fixture's independently opened
/// artifacts, so a delta tile's wire rows and the instrument's chained walk are the two
/// implementations crossing on one corpus: a disagreement is a walk defect on one side or
/// artifact plumbing, never corpus mismatch. Rows must match in order; the head's counts must
/// match the instrument's selection.
#[cfg(feature = "bench")]
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_delivery_agrees_with_the_walk_instrument() {
    use crate::salt::lod::bench::WalkBench;

    let (generation, atlas) = publish("backfill-crossing").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);

    let code_bits: Vec<u64> = (0..u64::try_from(row_ids.len()).expect("fixture counts fit u64"))
        .map(|position| artifacts.morton.code(position).to_bits())
        .collect();
    let lengths = artifacts.morton.fenceposts().lengths();
    let mut bench = WalkBench::from_parts(
        &code_bits,
        &lengths,
        row_ids.to_vec(),
        FIXTURE_LOD.span.get(),
        FIXTURE_LOD.max_tile_depth,
    );

    let universe = u32::try_from(row_ids.len()).expect("the fixture universe fits u32");
    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        bench.mask_rows((0..universe).filter(|&row| proof.contains(row)));
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let bytes = atlas
                    .tile(&request(z, x, y, Mode::Delta), TileCaps::default(), &proof)
                    .expect("the masked tile serves");
                let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
                let (delivered, _, backfilled) =
                    head_counts(section(&bytes, HEAD).expect("HEAD is present"));

                let walked: Vec<u32> = bench
                    .chained_delivery(z, x, y)
                    .iter()
                    .map(|&position| {
                        let index = usize::try_from(position).expect("positions fit usize");
                        node_codec.encode(row_ids[index]).get()
                    })
                    .collect();
                let selection = bench.chained(z, x, y);

                let at = format!("{name}: the delta tile {z}/{x}/{y}");
                assert_eq!(rows, walked, "{at} delivers the instrument's rows in order");
                assert_eq!(
                    usize::try_from(delivered).expect("fixture counts fit usize"),
                    selection.natural + selection.tail,
                    "{at} heads the instrument's count",
                );
                assert_eq!(
                    usize::try_from(backfilled).expect("fixture counts fit usize"),
                    selection.tail,
                    "{at} sizes the instrument's tail",
                );
            }
        }
    }
}

/// The reference and the walk instrument agree on the synthetic corpus at scale.
///
/// The 48-node fixture pins the law where extents are enumerable by hand; the clustered
/// synthetic corpus pins it at depth. The law's replay visits the instrument's own corpus
/// through its exported columns - the crossing in the opposite direction from the wire
/// comparison - along the densest descent path, under the operator view, independent hiding,
/// and a subtree on the path hidden whole. The sweep must reach the fill and the short-fill
/// regimes for the pin to bind, and it asserts that it does.
#[cfg(feature = "bench")]
#[test]
fn the_selection_reference_agrees_with_the_walk_instrument_at_scale() {
    use crate::{morton::MortonKey, salt::lod::bench::WalkBench};

    let mut bench = WalkBench::build(300_000, 0x0BAC_F111);
    let (code_bits, rows, segments) = bench.columns();
    let span = LodConfig::default().span.get();
    let points = bench.points();

    let path = bench.descent();
    assert!(
        path.len() > 10,
        "the clustered corpus descends past zoom 10"
    );
    let (depth, x, y) = path[5];
    assert_eq!(depth, 5, "the path's sixth entry sits at zoom 5");

    let everyone = vec![true; points];
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x0BAC_F111);
    let independent: Vec<bool> = core::iter::repeat_with(|| rng.random_ratio(3, 5))
        .take(points)
        .collect();
    let hidden = backfill_reference::cell(5, x, y);
    let mut subtree = vec![true; points];
    for (position, &bits) in code_bits.iter().enumerate() {
        if hidden.contains(MortonKey::from_bits(bits)) {
            subtree[usize::try_from(rows[position]).expect("row ids fit usize")] = false;
        }
    }

    let masks: [(&str, &[bool]); 3] = [
        ("operator", &everyone),
        ("independent-hiding", &independent),
        ("subtree-hidden", &subtree),
    ];

    let mut backfills = 0_u64;
    let mut shorts = 0_u32;
    for (name, visible) in masks {
        bench.mask_rows(
            visible
                .iter()
                .enumerate()
                .filter(|&(_, &visible)| visible)
                .map(|(row, _)| u32::try_from(row).expect("the corpus fits the u32 row domain")),
        );
        let corpus = backfill_reference::columns(&code_bits, &segments, &rows, span, visible);

        let deliveries = backfill_reference::path_deliveries(&corpus, &path);
        for (&(z, x, y), delivery) in path.iter().zip(&deliveries) {
            let walked: Vec<u64> = bench
                .chained_delivery(z, x, y)
                .iter()
                .map(|&position| u64::from(position))
                .collect();
            let selection = bench.chained(z, x, y);

            let at = format!("{name}: the tile {z}/{x}/{y}");
            assert_eq!(
                delivery.positions, walked,
                "{at} delivers the law's positions in order",
            );
            assert_eq!(
                delivery.budget,
                u64::try_from(selection.budget).expect("corpus counts fit u64"),
                "{at} agrees on the budget",
            );
            assert_eq!(
                delivery.backfilled,
                u64::try_from(selection.tail).expect("corpus counts fit u64"),
                "{at} sizes the tail alike",
            );

            backfills += delivery.backfilled;
            let delivered = u64::try_from(delivery.positions.len()).expect("corpus counts fit u64");
            shorts += u32::from(delivered < delivery.budget);
        }
    }
    assert!(backfills > 0, "the sweep reaches the fill regime");
    assert!(shorts > 0, "the sweep reaches the short-fill regime");
}
