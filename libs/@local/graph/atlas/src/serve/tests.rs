//! Serving reads over a real published generation.
//!
//! The fixture publishes through the production `fit`, so every
//! artifact the serving surface maps is the pipeline's own output.
//! Expectations derive from independently opened artifacts and the
//! schedule laws - fencepost sums, code-column scans, the quad walk -
//! never from the assembly under test.
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
    Atlas, EdgesCaps, EdgesError, EdgesRequest, Filter, GenerationId, GenerationRoot,
    ManifestLimits, Mode, TileCoordinate, TileError, TileQuery, TileRequest, error::OpenAtlasError,
};
use crate::{
    dataset::{
        CANONICAL_DIMENSIONS, Edge, Node as CorpusNode, NodeRowId, Ontology, OntologyRowId,
        PROJECTOR_DIMENSIONS, card::Card, memory::MemoryDataset,
    },
    file::{
        array::ArrayFile, generation::Generation, morton::read::MortonFile, quad::read::QuadFile,
    },
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN, VecN},
    morton::{Depth, MortonCell, MortonKey},
    salt::{
        CardEmbedder, Classifier, ClassifierFitConfig, EmbedderFingerprint, SelectionOptions,
        TrainingRow, TrainingSet,
        fit::{FitConfig, PlacementOptions, fit},
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

/// The fixture schedule: `span_log2 = 1`, so the cut rule reads
/// `bucket = z + 1` and the root spans buckets `0..=1`.
const FIXTURE_LOD: LodConfig = LodConfig {
    span_log2: 1,
    max_tile_depth: 3,
};

/// The tile slot table, `SPEC-ADDENDUM-WIRE.md` section 3.
const POSITIONS: usize = 1;
const ROW_IDS: usize = 2;
const TYPE_MASK: usize = 3;
const MASS: usize = 4;

/// The edges slot table, `SPEC-ADDENDUM-WIRE.md` section 6a.
const EDGE_ROW_IDS: usize = 3;

/// The fixture edge list: `(id, source row, target row)`, edge row
/// order. Row 2 carries a self-loop; rows 3 and 4 are a reciprocal
/// pair sharing both endpoints.
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

/// A fit-scale corpus: unit-norm pseudo-random representations whose
/// canonical embeddings extend them with zeros, one node type
/// alternating between two ontology rows, and one link type.
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
                ontology: smallvec![OntologyRowId::new((row & 1) as u64)],
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

    fn embed(
        &self,
        texts: impl IntoIterator<Item: AsRef<str> + Send> + Send,
    ) -> impl Future<Output = Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, Self::Error>> + Send
    {
        ready(Ok(texts
            .into_iter()
            .map(|text| {
                let mut hasher = Sha256::new();
                hasher.update(text.as_ref().as_bytes());
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

/// A deterministic classifier fitted from a synthetic corpus: the
/// supplied model input of the fixture fit.
fn fixture_classifier() -> Classifier {
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
    fit_classifier(training, ClassifierFitConfig { folds: 2, .. })
        .expect("the fixture classifier fits")
        .classifier
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

/// Publishes one fixture generation and opens its serving surface.
async fn publish(name: &str) -> (Generation, Atlas) {
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
    let atlas = Atlas::open(&root, published.id()).expect("the atlas should open");

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

/// Collects every quad node with its cell, walking children in Morton
/// child order from the root.
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
        .tile(&request(0, 0, 0, Mode::Delta))
        .expect("the root tile should serve");
    assert_eq!(&bytes[..8], b"SALTILET");

    let delivered: u64 = morton.fenceposts().lengths()[..=FIXTURE_LOD.span_log2 as usize]
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

    let expected_rows: Vec<u8> = row_ids[..head]
        .iter()
        .flat_map(|&row| row.to_le_bytes())
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
        .tile(&request(0, 0, 0, Mode::Total))
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
            .tile(&TileRequest {
                coordinate,
                query: TileQuery::default(),
            })
            .expect("every node tile should serve");
        let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));

        let run = quad.nodes()[node as usize].run();
        assert_eq!(tile_rows.len() as u64, run.end - run.start);
        delivered_rows.extend(tile_rows);
    }

    let mut expected: Vec<u32> = row_ids.to_vec();
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
            first_bucket: coordinate.z + FIXTURE_LOD.span_log2,
            runs: &[0],
            global: None,
            children: 0,
        },
        ranges: &[],
        positions: points,
        rows: row_ids,
        masks: None,
        trailer: None,
    }
    .encode();
    assert_eq!(
        atlas
            .tile(&TileRequest {
                coordinate,
                query: TileQuery::default(),
            })
            .expect("the empty tile should serve"),
        expected,
    );

    // At the deepest zoom a total tile delivers its cell's whole
    // population: the cut reaches the catch-all bucket.
    let deep_cell = MortonKey::from_bits(morton.codes()[0].get())
        .cell(Depth::new(FIXTURE_LOD.max_tile_depth).expect("the deepest tile depth is valid"));
    let bytes = atlas
        .tile(&TileRequest {
            coordinate: coordinate_of(deep_cell),
            query: TileQuery {
                mode: Mode::Total,
                ..TileQuery::default()
            },
        })
        .expect("the deepest total tile should serve");
    let tile_rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
    assert_eq!(tile_rows.len() as u64, population(&morton, deep_cell));
}

#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn rejects_and_reports_the_contract() {
    let (_generation, atlas) = publish("rejects").await;

    assert_eq!(
        atlas.tile(&request(4, 0, 0, Mode::Delta)),
        Err(TileError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.tile(&request(2, 4, 0, Mode::Delta)),
        Err(TileError::Grid { z: 2, x: 4, y: 0 }),
    );

    let mut colored = request(0, 0, 0, Mode::Delta);
    colored.query.colored_type_ids = vec!["https://example.com/types/thing/v/1".to_owned()];
    assert_eq!(
        atlas.tile(&colored),
        Err(TileError::Unsupported("coloredTypeIds")),
    );

    let mut filtered = request(0, 0, 0, Mode::Delta);
    filtered.query.filter = Some(
        serde_json::from_value::<Filter>(serde_json::json!({ "any": [] }))
            .expect("a filter document deserializes opaquely"),
    );
    assert_eq!(atlas.tile(&filtered), Err(TileError::Unsupported("filter")));

    let mut detailed = request(0, 0, 0, Mode::Delta);
    detailed.query.include_detailed_data = true;
    assert_eq!(
        atlas.tile(&detailed),
        Err(TileError::Unsupported("includeDetailedData")),
    );

    let manifest = serde_json::to_value(atlas.manifest(ManifestLimits::default()))
        .expect("the manifest serializes");
    assert_eq!(
        manifest,
        serde_json::json!({
            "generation": atlas.generation().to_string(),
            "wireVersion": 1,
            "variants": ["plain"],
            "bucketSchedule": { "span": 2, "cut": "z+1", "maxZoom": 3 },
            "limits": { "coloredTypeIds": 0, "edgesTiles": 256, "locateNeighbours": 0 },
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
fn the_atlas_is_shared_across_requests() {
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

/// The edge-side serving artifacts of one generation, independently
/// opened.
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

/// Every tile coordinate of the deepest zoom: the cut reaches the
/// catch-all bucket, so the grid delivers the whole corpus.
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

/// Derives the qualifying edge columns for a delivered row set:
/// both-endpoint edges in ascending edge-row order.
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

fn expected_edges_bytes(
    generation: &Generation,
    complete: bool,
    sources: &[u32],
    targets: &[u32],
    edge_rows: &[u32],
) -> Vec<u8> {
    EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete,
        sources,
        targets,
        edge_rows,
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
        .edges(&request, EdgesCaps::default())
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
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &sources, &targets, &rows),
    );

    // Identical requests yield identical bytes.
    assert_eq!(
        atlas
            .edges(&request, EdgesCaps::default())
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
    let head: u64 = artifacts.morton.fenceposts().lengths()[..=FIXTURE_LOD.span_log2 as usize]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();

    let (sources, targets, edge_rows) = qualifying_columns(endpoints, &delivered);
    let root = TileCoordinate { z: 0, x: 0, y: 0 };
    let bytes = atlas
        .edges(&edges_request(vec![root]), EdgesCaps::default())
        .expect("the root should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &sources, &targets, &edge_rows),
    );

    // Listing a tile twice changes nothing: the delivered union
    // deduplicates before the outgoing walk.
    let doubled = atlas
        .edges(&edges_request(vec![root, root]), EdgesCaps::default())
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

    // Under full coverage every edge qualifies; the cap keeps the two
    // whose worse endpoint ranks best, emitted in edge-row order.
    let mut ranked: Vec<(u32, u32)> = endpoints
        .iter()
        .enumerate()
        .map(|(row, &[source, target])| {
            (
                rank_of_row(source).max(rank_of_row(target)),
                u32::try_from(row).expect("fixture edge rows fit u32"),
            )
        })
        .collect();
    ranked.sort_unstable();
    ranked.truncate(2);
    let mut kept: Vec<u32> = ranked.into_iter().map(|(_, row)| row).collect();
    kept.sort_unstable();
    let sources: Vec<u32> = kept
        .iter()
        .map(|&row| u32::try_from(endpoints[row as usize][0]).expect("fixture rows fit u32"))
        .collect();
    let targets: Vec<u32> = kept
        .iter()
        .map(|&row| u32::try_from(endpoints[row as usize][1]).expect("fixture rows fit u32"))
        .collect();

    let capped = EdgesCaps {
        edges: 2,
        ..EdgesCaps::default()
    };
    let bytes = atlas
        .edges(&edges_request(full_grid()), capped)
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
        atlas.edges(&filtered, EdgesCaps::default()),
        Err(EdgesError::Unsupported("filter")),
    );

    let mut detailed = edges_request(vec![root]);
    detailed.include_detailed_data = true;
    assert_eq!(
        atlas.edges(&detailed, EdgesCaps::default()),
        Err(EdgesError::Unsupported("includeDetailedData")),
    );

    assert_eq!(
        atlas.edges(
            &edges_request(vec![root, root]),
            EdgesCaps {
                tiles: 1,
                ..EdgesCaps::default()
            },
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
        ),
        Err(EdgesError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.edges(
            &edges_request(vec![TileCoordinate { z: 2, x: 4, y: 0 }]),
            EdgesCaps::default(),
        ),
        Err(EdgesError::Grid { z: 2, x: 4, y: 0 }),
    );

    // No tiles, no edges: the honest empty response with every column
    // present-empty.
    let bytes = atlas
        .edges(&edges_request(Vec::new()), EdgesCaps::default())
        .expect("the empty request should serve");
    assert_eq!(
        bytes,
        expected_edges_bytes(&generation, true, &[], &[], &[])
    );
    assert!(
        section(&bytes, EDGE_ROW_IDS)
            .expect("EDGE_ROW_IDS is present")
            .is_empty(),
    );
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
