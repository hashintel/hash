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
    Atlas, EdgesCaps, EdgesError, EdgesRequest, Filter, GenerationId, GenerationRoot, Mode,
    ServeCaps, TileCaps, TileCoordinate, TileError, TileQuery, TileRequest, error::OpenAtlasError,
};
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
    math::{AffinityCurve, AlignedVecN, BoxedVecN, VecN},
    morton::{Depth, MortonCell, MortonKey},
    salt::{
        CardEmbedder, Classifier, ClassifierFitConfig, EmbedderFingerprint, SelectionOptions,
        TrainingRow, TrainingSet,
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

/// A deterministic classifier input fitted from a synthetic corpus:
/// the supplied model input of the fixture fit.
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

/// Fits and publishes one fixture generation, as the pipeline
/// writes it: identity artifacts carry the memory dataset's 8-byte
/// positional ids, which the serving open rejects loudly.
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

/// The versioned type URL behind fixture ontology row `row`; the
/// rewritten ontology identities key each row by the uuid its URL
/// derives, exactly as the store's identities would.
fn fixture_type_url(row: u64) -> String {
    format!("https://example.com/types/fixture-{row}/v/1")
}

/// The edge-domain seed offset: link entities own ids disjoint from
/// node ids, as the store's would be.
const EDGE_SEED: u8 = 64;

/// Rewrites a published fixture generation's identity artifacts with
/// store-width ids, deterministic by row: ontology row `r` keys the
/// uuid derived from [`fixture_type_url`] of `r`, node row `r` keys
/// [`entity_id_of`] of `r`, and edge row `r` keys [`entity_id_of`]
/// of `EDGE_SEED + r`.
///
/// The memory dataset speaks 8-byte positional ids, which the
/// serving open rejects by ruling; the rewrite is the test-lane
/// bridge until a fixture dataset carries store-width ids natively.
/// Open trusts the metadata document's hash, not per-file digests
/// (those are verified by tooling), so the rewritten artifacts
/// serve.
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

/// Publishes one fixture generation with store-width identities and
/// opens its serving surface.
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
        .tile(&request(0, 0, 0, Mode::Delta), TileCaps::default())
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
        .tile(&request(0, 0, 0, Mode::Total), TileCaps::default())
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
            )
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
            .tile(
                &TileRequest {
                    coordinate,
                    query: TileQuery::default(),
                },
                TileCaps::default(),
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
        atlas.tile(&request(4, 0, 0, Mode::Delta), TileCaps::default()),
        Err(TileError::Depth { z: 4, maximum: 3 }),
    );
    assert_eq!(
        atlas.tile(&request(2, 4, 0, Mode::Delta), TileCaps::default()),
        Err(TileError::Grid { z: 2, x: 4, y: 0 }),
    );

    let mut colored = request(0, 0, 0, Mode::Delta);
    colored.query.colored_type_ids = vec![
        "https://example.com/types/thing/v/1".to_owned();
        TileCaps::default().colored_type_ids as usize + 1
    ];
    assert_eq!(
        atlas.tile(&colored, TileCaps::default()),
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
        atlas.tile(&filtered, TileCaps::default()),
        Err(TileError::Unsupported("filter"))
    );

    let mut detailed = request(0, 0, 0, Mode::Delta);
    detailed.query.include_detailed_data = true;
    assert_eq!(
        atlas.tile(&detailed, TileCaps::default()),
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
            "limits": { "coloredTypeIds": 32, "edgesTiles": 256, "locateNeighbours": 32, "locateEdges": 512, "translateEntityIds": 1024 },
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

/// The edges convenience path rejects the trailer by name; the
/// transport path assembles, gathers the link identities, and
/// encodes byte-exactly against the directly built wire document
/// with the four-array trailer. Hydration is the transport's store
/// round trip, so the test supplies all-`null` details directly
/// (G6 pins the non-null trailer bytes).
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn detailed_edges_encode_the_hydrated_trailer() {
    use super::detail::LinkDetails;
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
        atlas.edges(&request, EdgesCaps::default()),
        Err(EdgesError::Unsupported("includeDetailedData")),
    );

    // The transport path assembles, gathers, hydrates, encodes.
    let document = atlas
        .assemble_edges(&request, EdgesCaps::default())
        .expect("assembly ignores the trailer flag");

    let head: u64 = artifacts.morton.fenceposts().lengths()[..=FIXTURE_LOD.span_log2 as usize]
        .iter()
        .sum();
    let head = usize::try_from(head).expect("fixture counts fit usize");
    let delivered: HashSet<u32> = row_ids[..head].iter().copied().collect();
    let (sources, targets, edge_rows) = qualifying_columns(endpoints, &delivered);

    let entities = atlas.delivered_edge_entities(&document);
    assert_eq!(entities.count(), edge_rows.len());

    let details = LinkDetails::empty(entities.count());
    let bytes = atlas.encode_edges(&document, Some(&details));

    let nothing: Vec<Option<&str>> = vec![None; edge_rows.len()];
    let expected = EdgesResponse {
        generation: generation.id().digest(),
        variant: 0,
        complete: true,
        sources: &sources,
        targets: &targets,
        edge_rows: &edge_rows,
        trailer: Some(EdgesTrailer {
            link_labels: &nothing,
            link_icons: &nothing,
            link_type_labels: &nothing,
            link_type_icons: &nothing,
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the trailer rides the pinned envelope");
}

/// Source resolution answers the delivery contract, not just a
/// formula: the resolved (zoom, cell) tile delivers the row under
/// the cumulative schedule, and at zoom > 0 the parent tile's
/// schedule does not - so `zoom` really is the FIRST visible zoom.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_sources_resolve_to_their_first_visible_tile() {
    let (_generation, atlas) = publish("locate-resolve").await;

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
        let Some(source) = atlas.resolve_source(&entity_string_of(row)) else {
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
            .tile(&request, TileCaps::default())
            .expect("the resolved tile serves");
        assert!(
            row_of(&bytes).contains(&source.row),
            "the resolved tile delivers its source",
        );

        // The parent's cumulative schedule does not: zoom is FIRST.
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
                .tile(&parent, TileCaps::default())
                .expect("the parent tile serves");
            assert!(
                !row_of(&bytes).contains(&source.row),
                "the parent zoom does not deliver the source yet",
            );
            resolved += 1;
        }
    }
    // The fixture spreads buckets, so at least one probed row sits
    // below the root cut and exercises the parent assertion.
    assert!(resolved > 0, "at least one source resolves below zoom 0");

    // Non-node shapes read absent: an edge id, an unknown id, junk.
    assert_eq!(atlas.resolve_source(&entity_string_of(EDGE_SEED)), None);
    assert_eq!(
        atlas.resolve_source(&format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil())),
        None,
    );
    assert_eq!(atlas.resolve_source("not an id"), None);
}

/// The locate delivered set answers the wire pin - source first,
/// then neighbours ascending (distance, base position) - proven
/// against a brute-force scan of the positions column, the
/// independent derivation the kd-tree must agree with.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_subgraph_delivers_source_first_then_nearest() {
    use super::locate::LocateCaps;

    let (_generation, atlas) = publish("locate-neighbours").await;
    let source = atlas
        .resolve_source(&entity_string_of(0))
        .expect("fixture node ids resolve");

    // Brute force: every other position, ascending by (squared
    // distance, node row id) - f32 arithmetic matching the index's
    // own metric, ordered by the wire pin.
    let positions = atlas.positions();
    let origin = positions[source.position as usize];
    let mut expected: Vec<(f32, u32, u32)> = (0..positions.len())
        .map(narrow_usize)
        .filter(|&position| position != source.position)
        .map(|position| {
            let point = positions[position as usize];
            let (dx, dy) = (point.x() - origin.x(), point.y() - origin.y());
            // The derivation must mirror the index's SquaredEuclidean
            // bit for bit: a fused mul_add rounds differently and
            // reorders near-ties.
            #[expect(
                clippy::suboptimal_flops,
                reason = "unfused arithmetic mirrors the index metric exactly"
            )]
            (
                dx * dx + dy * dy,
                atlas.row_ids()[position as usize],
                position,
            )
        })
        .collect();
    expected.sort_unstable_by(
        |(left_distance, left_row, _), (right_distance, right_row, _)| {
            left_distance
                .total_cmp(right_distance)
                .then(left_row.cmp(right_row))
        },
    );

    for budget in [0_u32, 1, 3] {
        let subgraph = atlas.locate_subgraph(source, budget, LocateCaps::default());
        let mut delivered = vec![source.position];
        delivered.extend(
            expected
                .iter()
                .take(budget as usize)
                .map(|&(_, _, position)| position),
        );
        assert_eq!(subgraph.positions, delivered, "budget {budget}");
        let mut rows = vec![source.row];
        rows.extend(
            expected
                .iter()
                .take(budget as usize)
                .map(|&(_, row, _)| row),
        );
        assert_eq!(subgraph.rows, rows, "budget {budget}");
    }

    // A budget over the cap clamps to it: the 48-point fixture
    // outnumbers the default 32-neighbour cap, so the delivered set
    // is the source plus exactly the cap.
    let subgraph = atlas.locate_subgraph(source, u32::MAX, LocateCaps::default());
    assert_eq!(
        subgraph.positions.len(),
        1 + LocateCaps::default().neighbours as usize,
    );
    assert_eq!(
        subgraph.positions[1..],
        expected[..LocateCaps::default().neighbours as usize]
            .iter()
            .map(|&(_, _, position)| position)
            .collect::<Vec<u32>>(),
    );
}

/// The locate edge set is the both-endpoints rule over the delivered
/// rows, ascending edge row - proven against a brute-force endpoint
/// scan - and the cap truncates by worse-endpoint rank with
/// source-incident edges protected to the end.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_subgraph_edges_cap_by_rank_and_protect_the_source() {
    use super::locate::LocateCaps;

    let (_generation, atlas) = publish("locate-edges").await;

    // A source with some but not all edges incident makes the
    // protection distinction real; pick it from the artifacts.
    let pairs = atlas.endpoint_pairs();
    let source_row = (0..atlas.row_ids().len())
        .map(narrow_usize)
        .find(|&row| {
            let incident = pairs
                .iter()
                .filter(|&&[source, target]| source == u64::from(row) || target == u64::from(row))
                .count();
            incident > 0 && incident < pairs.len()
        })
        .expect("the fixture holds a partially incident row");
    let source = atlas
        .resolve_source(&entity_string_of(
            u8::try_from(source_row).expect("fixture rows are small"),
        ))
        .expect("fixture node ids resolve");

    // Deliver everything: a raised neighbour cap covers the whole
    // 48-point fixture, so the subgraph is the full edge set.
    let everything = LocateCaps {
        neighbours: u32::MAX,
        ..LocateCaps::default()
    };
    let all = atlas.locate_subgraph(source, u32::MAX, everything);

    // Brute force: every edge row whose endpoints are both delivered
    // (here: all of them), ascending edge row.
    let expected_full: Vec<(u32, u32, u32)> = (0..pairs.len())
        .map(|edge| {
            let [edge_source, edge_target] = pairs[edge];
            (
                narrow_usize(edge),
                u32::try_from(edge_source).expect("node rows fit u32"),
                u32::try_from(edge_target).expect("node rows fit u32"),
            )
        })
        .collect();
    let delivered: Vec<(u32, u32, u32)> = all
        .edges
        .iter()
        .map(|edge| (edge.row, edge.source, edge.target))
        .collect();
    assert_eq!(delivered, expected_full, "uncapped = the full edge set");
    assert!(all.complete);

    // The independent rank derivation the truncation must follow.
    let rank_of_row = |row: u32| atlas.ranks()[atlas.positions_of_row()[row as usize] as usize];
    let ranked_key = |&(row, edge_source, edge_target): &(u32, u32, u32)| {
        let context = edge_source != source.row && edge_target != source.row;
        (
            context,
            rank_of_row(edge_source).max(rank_of_row(edge_target)),
            row,
        )
    };

    for cap in 0..=expected_full.len() {
        let caps = LocateCaps {
            edges: u32::try_from(cap).expect("fixture edge counts are small"),
            ..everything
        };
        let subgraph = atlas.locate_subgraph(source, u32::MAX, caps);
        assert_eq!(subgraph.complete, expected_full.len() <= cap, "cap {cap}");

        let mut expected = expected_full.clone();
        expected.sort_unstable_by_key(ranked_key);
        expected.truncate(cap);
        expected.sort_unstable_by_key(|&(row, ..)| row);
        let survivors: Vec<(u32, u32, u32)> = subgraph
            .edges
            .iter()
            .map(|edge| (edge.row, edge.source, edge.target))
            .collect();
        assert_eq!(survivors, expected, "cap {cap}");

        // The protection property, stated directly: source-incident
        // edges survive any cap that admits them at all.
        let incident: Vec<u32> = expected_full
            .iter()
            .filter(|&&(_, edge_source, edge_target)| {
                edge_source == source.row || edge_target == source.row
            })
            .map(|&(row, ..)| row)
            .collect();
        if cap >= incident.len() {
            for row in &incident {
                assert!(
                    survivors.iter().any(|&(survivor, ..)| survivor == *row),
                    "cap {cap} keeps source-incident edge {row}",
                );
            }
        }

        // Determinism pair: byte-identical assembly on repeat.
        assert_eq!(
            subgraph,
            atlas.locate_subgraph(source, u32::MAX, caps),
            "cap {cap}",
        );
    }
}

/// The locate index cache round-trips: the first open writes it, a
/// second open loads it and answers identically, and a corrupt
/// cache rebuilds instead of failing the open.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_index_cache_round_trips() {
    use super::OpenOptions;

    let (root, generation) = fit_fixture("locate-cache").await;
    store_identities(&generation);
    let cache = scratch("locate-cache-dir").join("kdtree-cache");
    let options = OpenOptions {
        locate_cache: Some(cache.clone()),
    };

    let fresh = Atlas::open_with(&root, generation.id(), &options)
        .expect("the first open builds and caches");
    let path = cache.join(format!("locate-{}.kdtree", generation.id()));
    assert!(path.exists(), "the first open leaves the cache behind");

    let cached = Atlas::open_with(&root, generation.id(), &options)
        .expect("the second open loads the cache");
    let count = core::num::NonZero::new(4_usize).expect("4 is nonzero");
    // Candidate sets are unordered; a canonical sort makes the
    // comparison exact.
    let probe = |atlas: &Atlas, origin: [f32; 2]| {
        let mut candidates = atlas.locate.candidates(origin, count);
        candidates.sort_unstable_by(|(left_distance, left), (right_distance, right)| {
            left_distance
                .total_cmp(right_distance)
                .then(left.cmp(right))
        });
        candidates
    };
    for origin in [[0.0_f32, 0.0], [-0.5, 0.25], [1.0, -1.0]] {
        assert_eq!(
            probe(&fresh, origin),
            probe(&cached, origin),
            "the cached index answers exactly as the built one",
        );
    }

    // A corrupt cache is a miss, never a failure - and it heals.
    std::fs::write(&path, b"SALTKDX1 garbage after the magic").expect("the cache is writable");
    let healed = Atlas::open_with(&root, generation.id(), &options)
        .expect("a corrupt cache rebuilds instead of failing");
    assert_eq!(probe(&healed, [0.0, 0.0]), probe(&fresh, [0.0, 0.0]));
    let rewritten = std::fs::read(&path).expect("the cache file exists");
    assert_ne!(
        &*rewritten, b"SALTKDX1 garbage after the magic",
        "the rebuild rewrites the cache",
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

/// A colored request mixing resolvable and unresolvable ids over the
/// published fixture: `TYPE_MASK` rides the request at full shape,
/// unresolvable ids read 0 in every mask, and a fixture type URL
/// resolves to real bits.
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
        .tile(&colored, TileCaps::default())
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

/// A generation whose identity artifacts carry the memory dataset's
/// 8-byte positional ids does not serve: the open fails loudly on
/// the key width, by ruling.
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

/// Resolution and descendant expansion against hand-built artifacts:
/// eight points, four types (`1 <- 0`, `2 <- 0`, `3 <- {1, 2}`), the
/// postings fixture's dense/list split.
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
                build::{Postings, PostingsConfig},
                closure::ClosureMap,
                mapped::PostingsArchive,
            },
        },
    };

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
            dense_threshold_log2: 2,
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

/// The detailed-tile path: assembly, entity gathering, and encoding
/// with a hydrated trailer, spliced where the transport awaits the
/// store.
///
/// The gathered entities carry the fixture's rewritten store-width
/// ids; hydration itself is the transport's store round trip, so the
/// test supplies all-`null` details directly. The encoded bytes must
/// equal the wire document built directly with the trailer.
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
        atlas.tile(&detailed, TileCaps::default()),
        Err(TileError::Unsupported("includeDetailedData")),
    );

    // The transport path assembles, gathers, hydrates, encodes.
    let document = atlas
        .assemble_tile(&detailed, TileCaps::default())
        .expect("assembly ignores the trailer flag");
    let entities = atlas.delivered_entities(&document);

    let delivered: u64 = morton.fenceposts().lengths()[..=FIXTURE_LOD.span_log2 as usize]
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
            runs: &morton.fenceposts().lengths()[..=FIXTURE_LOD.span_log2 as usize]
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
        ranges: &[0..end],
        positions: points,
        rows: row_ids,
        masks: None,
        trailer: Some(TileTrailer {
            labels: &nothing,
            icons: &nothing,
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the trailer path is byte-exact");
}

/// One synthetic entity identity per seed byte, plus its upstream
/// string form.
fn entity_id_of(seed: u8) -> crate::dataset::ArchivedEntityId {
    crate::dataset::ArchivedEntityId {
        web_id: uuid::Uuid::from_bytes([seed; 16]).into(),
        entity_uuid: uuid::Uuid::from_bytes([seed ^ 0xFF; 16]).into(),
    }
}

/// The `webId~entityUuid` string form of [`entity_id_of`]'s identity.
/// Narrows a fixture-sized index into the wire's `u32` row domain.
fn narrow_usize(value: usize) -> u32 {
    u32::try_from(value).expect("fixture indexes fit u32")
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

/// Translate resolution against hand-built identity tables: nodes
/// answer row and wire position, edges answer row, and every
/// non-resolving shape - draft-suffixed, unparsable, unknown - reads
/// as an absent key.
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
    let response = translate(
        &request,
        TranslateCaps::default(),
        &nodes,
        &edges,
        &positions,
        &position_of_row,
    )
    .expect("the request is under the cap");

    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(2),
            TranslatedNode {
                id: 1,
                x: 0.75,
                y: -0.5,
            },
        )],
    );
    assert_eq!(
        response.edges.into_iter().collect::<Vec<_>>(),
        vec![(entity_string_of(10), TranslatedEdge { id: 0 })],
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
    assert_eq!(
        translate(&over, TranslateCaps::default(), &nodes, &edges, &[], &[]),
        Err(TranslateError::Ids {
            count: TranslateCaps::default().entity_ids as usize + 1,
            maximum: TranslateCaps::default().entity_ids,
        }),
    );
}

/// Translate over the published fixture: the rewritten store-width
/// identities resolve end to end - node row and wire position agree
/// with the serving columns, an edge id answers its row, and an
/// unknown id reads absent.
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
        )
        .expect("the request is under the cap");

    let position = atlas.positions_of_row()[0] as usize;
    let point = atlas.positions()[position];
    assert_eq!(
        response.nodes.into_iter().collect::<Vec<_>>(),
        vec![(
            entity_string_of(0),
            TranslatedNode {
                id: 0,
                x: point.x(),
                y: point.y(),
            },
        )],
    );
    assert_eq!(
        response.edges.into_iter().collect::<Vec<_>>(),
        vec![(entity_string_of(EDGE_SEED), TranslatedEdge { id: 0 })],
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
    // integer is i64 - the Q5 shapes carry no wider integral form).
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

/// One locate request built directly; the JSON-facing defaults ride
/// the serde attributes and are asserted where they matter.
fn locate_request(entity_id: String) -> super::LocateRequest {
    super::LocateRequest {
        entity_id,
        colored_type_ids: Vec::new(),
        filter: None,
        neighbours: None,
        include_detailed_data: false,
    }
}

/// The locate convenience path rejects the trailer by name (which
/// locate DEFAULTS to - it is the detail view); the transport path
/// assembles and encodes byte-exactly against the wire document
/// derived from the groundwork layers' own outputs.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_end_to_end_encodes_the_pinned_envelope() {
    use crate::salt::{postings::mapped::Membership, wire::locate::LocateResponse};

    let (generation, atlas) = publish("locate-endpoint").await;
    let caps = ServeCaps::default();

    // A bare JSON body reads neighbours = None and
    // includeDetailedData = true.
    let bare: super::LocateRequest =
        serde_json::from_value(serde_json::json!({ "entityId": entity_string_of(0) }))
            .expect("a bare locate body deserializes");
    assert_eq!(bare.neighbours, None);
    assert!(bare.include_detailed_data);
    assert_eq!(
        atlas.locate(&bare, caps),
        Err(super::LocateError::Unsupported("includeDetailedData")),
    );

    let mut request = locate_request(entity_string_of(0));
    request.neighbours = Some(3);
    let bytes = atlas
        .locate(&request, caps)
        .expect("the request is well-formed");
    assert_eq!(bytes[0..8], *b"SALTILEL");

    // The groundwork layers derive the expectation independently;
    // their own tests pin their behaviour.
    let source = atlas
        .resolve_source(&entity_string_of(0))
        .expect("row 0 is a node");
    let subgraph = atlas.locate_subgraph(source, 3, caps.locate);
    let sources: Vec<u32> = subgraph.edges.iter().map(|edge| edge.source).collect();
    let targets: Vec<u32> = subgraph.edges.iter().map(|edge| edge.target).collect();
    let edge_rows: Vec<u32> = subgraph.edges.iter().map(|edge| edge.row).collect();
    let response = |masks: Option<&[Membership<'_>]>| {
        LocateResponse {
            generation: generation.id().digest(),
            variant: 0,
            cell: source.cell,
            complete: subgraph.complete,
            delivered: &subgraph.positions,
            positions: atlas.positions(),
            rows: atlas.row_ids(),
            masks,
            sources: &sources,
            targets: &targets,
            edge_rows: &edge_rows,
            trailer: None,
        }
        .encode()
    };
    assert_eq!(bytes, response(None), "the envelope matches the derivation");

    // An id resolving to no type is legal and reads zero bits; the
    // TYPE_MASK slot rides exactly the requests that color.
    request.colored_type_ids = vec!["https://unknown.test/t/v/1".to_owned()];
    let colored = atlas
        .locate(&request, caps)
        .expect("unresolvable colored ids are legal");
    assert_eq!(colored, response(Some(&[Membership::List(&[])])));
}

/// Every locate rejection carries its name, the unknown-entity
/// doctrine treats unparsable, unknown, and wrong-domain ids
/// identically, and an over-cap neighbour budget clamps instead of
/// rejecting.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn locate_rejections_and_the_neighbour_clamp() {
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
                .assemble_locate(&locate_request(id.clone()), caps)
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
            .assemble_locate(&colored, caps)
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
        "includeDetailedData": false,
    }))
    .expect("a filter body deserializes");
    assert_eq!(
        atlas
            .assemble_locate(&filtered, caps)
            .expect_err("filter is a version-0 deferral"),
        super::LocateError::Unsupported("filter"),
    );

    // A budget is not a list: over the cap it clamps, visible only
    // in the delivered count (the source plus the cap).
    let mut greedy = locate_request(entity_string_of(0));
    greedy.neighbours = Some(u32::MAX);
    let document = atlas
        .assemble_locate(&greedy, caps)
        .expect("the budget clamps");
    assert_eq!(
        atlas.locate_node_entities(&document).count(),
        caps.locate.neighbours as usize + 1,
    );
}

/// The transport path gathers both identity domains and encodes the
/// hydrated trailer byte-exactly, interned name table included.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn detailed_locate_encodes_the_hydrated_trailer() {
    use super::detail::{LinkDetails, LocateNodeDetails};
    use crate::salt::wire::locate::{LocateResponse, LocateTrailer, PropertyValue};

    let (generation, atlas) = publish("detailed-locate").await;
    let caps = ServeCaps::default();

    let mut request = locate_request(entity_string_of(0));
    request.neighbours = Some(4);
    request.include_detailed_data = true;

    let document = atlas
        .assemble_locate(&request, caps)
        .expect("assembly ignores the trailer flag");
    let nodes = atlas.locate_node_entities(&document);
    let links = atlas.locate_link_entities(&document);
    assert_eq!(nodes.count(), 5, "the source and four neighbours");

    // Hydration is the transport's store round trip; all-null
    // details stand in for it (the property laws are pinned by the
    // intern and wire tests).
    let node_details = LocateNodeDetails::empty(nodes.count());
    let link_details = LinkDetails::empty(links.count());
    let bytes = atlas.encode_locate(&document, Some((&node_details, &link_details)));

    let source = atlas
        .resolve_source(&entity_string_of(0))
        .expect("row 0 is a node");
    let subgraph = atlas.locate_subgraph(source, 4, caps.locate);
    let sources: Vec<u32> = subgraph.edges.iter().map(|edge| edge.source).collect();
    let targets: Vec<u32> = subgraph.edges.iter().map(|edge| edge.target).collect();
    let edge_rows: Vec<u32> = subgraph.edges.iter().map(|edge| edge.row).collect();
    assert_eq!(links.count(), edge_rows.len());

    let no_nodes: Vec<Option<&str>> = vec![None; nodes.count()];
    let no_edges: Vec<Option<&str>> = vec![None; edge_rows.len()];
    let no_maps: Vec<Option<&[(u32, PropertyValue<'_>)]>> = vec![None; nodes.count()];
    let expected = LocateResponse {
        generation: generation.id().digest(),
        variant: 0,
        cell: source.cell,
        complete: subgraph.complete,
        delivered: &subgraph.positions,
        positions: atlas.positions(),
        rows: atlas.row_ids(),
        masks: None,
        sources: &sources,
        targets: &targets,
        edge_rows: &edge_rows,
        trailer: Some(LocateTrailer {
            labels: &no_nodes,
            icons: &no_nodes,
            property_names: &[],
            properties: &no_maps,
            link_labels: &no_edges,
            link_icons: &no_edges,
            link_type_labels: &no_edges,
            link_type_icons: &no_edges,
        }),
    }
    .encode();
    assert_eq!(bytes, expected, "the trailer rides the pinned envelope");
}

/// The intern table is the sorted, deduplicated union of surviving
/// names; each node's map keys by index and keeps its ascending
/// order. `None` marks an unresolved entity, an empty list a
/// resolved one without simple properties.
#[test]
fn intern_properties_builds_the_table_and_index_maps() {
    use super::{detail::SimpleValue, locate::intern_properties};
    use crate::salt::wire::locate::PropertyValue;

    let owned = |name: &str, value: SimpleValue| (format!("https://x.test/{name}/"), value);
    let entries = vec![
        Some(vec![
            owned("b", SimpleValue::Text("t".to_owned())),
            owned("d", SimpleValue::Integer(7)),
        ]),
        None,
        Some(vec![
            owned("a", SimpleValue::Null),
            owned("b", SimpleValue::Boolean(true)),
        ]),
        Some(vec![]),
    ];

    let (names, maps) = intern_properties(&entries);
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
}
