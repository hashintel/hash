//! The serving read surface: opened generations answering atlas reads.
//!
//! [`Atlas::open`] maps one published generation's serving artifacts -
//! quadtree topology, Morton code column, wire coordinates, the
//! base-order row column, the incident-edge adjacency with its
//! endpoint column, and the rank and position permutations - and
//! validates each format plus their cross-artifact agreement once, so
//! every read after that is mmap gathers and wire encoding.
//! [`Atlas::tile`] answers one tile request with `SALTILET` envelope
//! bytes and [`Atlas::edges`] one edges request with `SALTILEE`
//! bytes, both ready to send under
//! `application/vnd.hash.saltile-v1`; the manifest document of the
//! Surface v1 bootstrap is [`Atlas::manifest`].
//!
//! An [`Atlas`] is immutable after open and `Send + Sync`: hold it in
//! an [`Arc`](alloc::sync::Arc) across requests for the process
//! lifetime of the generation. Reads are synchronous and CPU-bound
//! (the columns are mapped memory), so an async transport schedules
//! them on a compute pool - rayon plus `catch_unwind` - never inline
//! on its runtime threads.
//!
//! The route and body vocabulary is `SPEC-ADDENDUM-API.md` Surface v1;
//! the response bytes implement `SPEC-ADDENDUM-WIRE.md`. Version-0
//! deferrals reject honestly instead of serving wrong bytes: a request
//! that names type coloring, a visibility filter, or the detail
//! trailer receives [`TileError::Unsupported`] until the postings,
//! filter, and hydration passes land.

use core::{error::Error, fmt, ops::Range};

use self::error::ArrayKind;
use crate::{
    bitset::BitSet,
    dataset::NodeRowId,
    file::{
        adjacency::read::AdjacencyFile,
        array::ArrayFile,
        generation::{Generation, OpenError},
        morton::read::MortonFile,
        quad::{Node, read::QuadFile},
    },
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell},
    salt::{
        adjacency::MappedAdjacency,
        lod::stage::LodConfig,
        wire::{
            WIRE_VERSION,
            edges::EdgesResponse,
            tile::{GlobalHead, TileHead, TileResponse},
        },
    },
};
pub use crate::{
    file::generation::{CurrentError, GenerationId, GenerationRoot},
    salt::wire::{Mode, tile::TileCoordinate},
};

mod error;

#[cfg(test)]
mod tests;

/// The variant names one generation serves, in variant-index order.
///
/// Version 1 serves the canonical frame alone; the set grows with the
/// ladder's conditions, at which point it moves from this constant to
/// generation metadata.
pub const VARIANTS: [&str; 1] = ["plain"];

/// Most tiles one edges request may list: the documented default of
/// the manifest's `edgesTiles` cap.
const EDGES_TILES_CAP: u32 = 256;

/// Most edges one response delivers before the rank-ordered cap
/// truncates: the documented default, roughly 200 KiB of columns.
const EDGES_CAP: u32 = 0x4000;

/// A tile request was rejected.
///
/// Every variant is a named, data-carrying rejection for the transport
/// layer to map onto its error vocabulary; none of them can result
/// from a well-formed request against the serving contract's limits,
/// which the manifest publishes as data.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TileError {
    /// The zoom exceeds the generation's deepest served tile.
    Depth {
        /// The requested zoom.
        z: u8,
        /// The generation's deepest served zoom.
        maximum: u8,
    },
    /// The coordinate lies outside the zoom's `2^z` grid.
    Grid {
        /// The requested zoom.
        z: u8,
        /// The requested x index.
        x: u32,
        /// The requested y index.
        y: u32,
    },
    /// The request names a feature this build does not serve; the
    /// carried name is the request field.
    Unsupported(&'static str),
}

impl fmt::Display for TileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Depth { z, maximum } => {
                write!(
                    formatter,
                    "zoom {z} exceeds the deepest served tile {maximum}"
                )
            }
            Self::Grid { z, x, y } => {
                write!(formatter, "({x}, {y}) lies outside the 2^{z} tile grid")
            }
            Self::Unsupported(feature) => {
                write!(formatter, "this build does not serve {feature} requests")
            }
        }
    }
}

impl Error for TileError {}

/// An edges request was rejected.
///
/// Every variant is a named, data-carrying rejection for the
/// transport layer to map onto its error vocabulary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum EdgesError {
    /// The request lists more tiles than the cap admits.
    Tiles {
        /// The listed tile count.
        count: usize,
        /// The cap the manifest publishes as `limits.edgesTiles`.
        maximum: u32,
    },
    /// A listed zoom exceeds the generation's deepest served tile.
    Depth {
        /// The requested zoom.
        z: u8,
        /// The generation's deepest served zoom.
        maximum: u8,
    },
    /// A listed coordinate lies outside its zoom's `2^z` grid.
    Grid {
        /// The requested zoom.
        z: u8,
        /// The requested x index.
        x: u32,
        /// The requested y index.
        y: u32,
    },
    /// The request names a feature this build does not serve; the
    /// carried name is the request field.
    Unsupported(&'static str),
}

impl fmt::Display for EdgesError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Tiles { count, maximum } => {
                write!(
                    formatter,
                    "the request lists {count} tiles where the cap admits {maximum}"
                )
            }
            Self::Depth { z, maximum } => {
                write!(
                    formatter,
                    "zoom {z} exceeds the deepest served tile {maximum}"
                )
            }
            Self::Grid { z, x, y } => {
                write!(formatter, "({x}, {y}) lies outside the 2^{z} tile grid")
            }
            Self::Unsupported(feature) => {
                write!(formatter, "this build does not serve {feature} requests")
            }
        }
    }
}

impl Error for EdgesError {}

/// An opaque visibility filter: the upstream-owned predicate document.
///
/// The predicate's schema belongs to the client codebase; the server
/// treats it as a value to canonicalize and hash, never as a typed
/// structure. Version 0 rejects requests that carry one.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
pub struct Filter(serde_json::Value);

/// The query context of one tile request: the ratified POST body,
/// every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TileQuery {
    /// The delivery mode; delta when the request names none.
    #[serde(default)]
    pub mode: Mode,
    /// Versioned type ids conditioning the `TYPE_MASK` column, in
    /// request order.
    #[serde(default)]
    pub colored_type_ids: Vec<String>,
    /// The visibility filter; absent means the trivial bitmap.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the detail trailer rides the response.
    #[serde(default)]
    pub include_detailed_data: bool,
}

/// One tile read: the route's coordinate plus the body's query
/// context, joined by the transport layer.
#[derive(Debug, Clone)]
pub struct TileRequest {
    /// The tile address from the route.
    pub coordinate: TileCoordinate,
    /// The query context from the request body.
    pub query: TileQuery,
}

/// One edges read: the ratified POST body.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EdgesRequest {
    /// The tiles whose delivered rows bound the edge set.
    pub tiles: Vec<TileCoordinate>,
    /// The visibility filter; absent means the trivial bitmap.
    #[serde(default)]
    pub filter: Option<Filter>,
    /// Whether the detail trailer rides the response.
    #[serde(default)]
    pub include_detailed_data: bool,
}

/// The edges endpoint's request and response caps: transport
/// configuration with documented defaults, never wire constants.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct EdgesCaps {
    /// Most tiles one request may list; the manifest publishes this
    /// value as `limits.edgesTiles`.
    pub tiles: u32,
    /// Most edges one response delivers; beyond it the rank-ordered
    /// cap truncates and `HEAD` reports `complete: false`.
    pub edges: u32,
}

const impl Default for EdgesCaps {
    fn default() -> Self {
        Self {
            tiles: EDGES_TILES_CAP,
            edges: EDGES_CAP,
        }
    }
}

/// One qualifying edge during assembly: the wire columns' row ids.
#[derive(Debug, Copy, Clone)]
struct DeliveredEdge {
    /// The edge row id.
    row: u32,
    /// The source node row id.
    source: u32,
    /// The target node row id.
    target: u32,
}

/// The per-request caps of the manifest's `limits` block: transport
/// configuration published as data, so clients validate before
/// sending instead of learning caps from rejections.
///
/// The defaults publish the served surface honestly: the edges cap
/// carries its documented serving default, while type coloring and
/// locate stay zero until their passes land, so no request carrying
/// them is admitted.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLimits {
    /// Most `coloredTypeIds` entries one request may carry.
    pub colored_type_ids: u32,
    /// Most tiles one edges request may list.
    pub edges_tiles: u32,
    /// Largest neighbour budget one locate request may name.
    pub locate_neighbours: u32,
}

const impl Default for ManifestLimits {
    fn default() -> Self {
        Self {
            colored_type_ids: 0,
            edges_tiles: EDGES_TILES_CAP,
            locate_neighbours: 0,
        }
    }
}

/// The immutable per-generation manifest: the Surface v1 bootstrap
/// document, derived from configuration alone so it can be shared
/// across principals.
#[derive(Debug, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    /// The generation identity, echoing the route.
    pub generation: GenerationId,
    /// The `SALTILE` family version the tile bytes speak.
    pub wire_version: u16,
    /// The variant names, in variant-index order.
    pub variants: [&'static str; 1],
    /// The bucket-cut schedule the tile grid follows.
    pub bucket_schedule: BucketSchedule,
    /// The per-request caps.
    pub limits: ManifestLimits,
    /// The snapshot's decision-time point, ISO-8601. Absent for
    /// generations fitted from sources without temporal axes, such as
    /// synthetic fixtures.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

/// The manifest's `bucketSchedule` block.
#[derive(Debug, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BucketSchedule {
    /// Cells per tile axis of the delivery cut: `2^span_log2`.
    pub span: u32,
    /// The cut rule as its human-readable formula, `z+<span_log2>`.
    pub cut: String,
    /// The deepest tile zoom the schedule serves.
    pub max_zoom: u8,
}

/// One opened generation, ready to answer reads.
///
/// Opening maps every serving artifact and validates each format plus
/// their cross-artifact agreement once; the value is immutable after
/// that and shared across requests.
///
/// # Examples
///
/// ```no_run
/// use std::sync::Arc;
///
/// use hash_graph_atlas::serve::{Atlas, GenerationRoot, TileCoordinate, TileQuery, TileRequest};
///
/// # fn main() -> Result<(), Box<dyn core::error::Error>> {
/// let root = GenerationRoot::new("/var/atlas/generations")?;
/// let id = root.current()?.expect("a generation is active");
/// let atlas = Arc::new(Atlas::open(&root, id)?);
///
/// let bytes = atlas.tile(&TileRequest {
///     coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
///     query: TileQuery::default(),
/// })?;
/// # Ok(())
/// # }
/// ```
#[derive(Debug)]
pub struct Atlas {
    generation: Generation,
    lod: LodConfig,
    quad: QuadFile,
    morton: MortonFile,
    coordinates: ArrayFile,
    rows: ArrayFile,
    adjacency: MappedAdjacency,
    endpoints: ArrayFile,
    rank_of_position: ArrayFile,
    position_of_row: ArrayFile,
    /// The tight wire-frame extent of the full point set, absent iff
    /// the generation holds no points. Derived from the world frame:
    /// normalization anchors each non-degenerate axis's extremes onto
    /// the frame edges and collapses degenerate axes to the centre,
    /// so the extent follows without scanning the column.
    bounds: Option<Bounds2>,
}

impl Atlas {
    /// Opens generation `id` from `root` and maps every serving
    /// artifact, validating each format once.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Unpublished`] when the generation is
    /// not published in this root, [`OpenAtlasError::Artifact`] when
    /// the metadata document or an artifact fails its format's
    /// validation, [`OpenAtlasError::Schedule`] when the recorded
    /// schedule exceeds the key width, [`OpenAtlasError::Shape`] when
    /// an artifact holds the wrong element type or shape, and
    /// [`OpenAtlasError::Columns`] or [`OpenAtlasError::Subtree`] when
    /// the artifacts disagree on the point count.
    #[tracing::instrument(skip_all)]
    pub fn open(root: &GenerationRoot, id: GenerationId) -> Result<Self, error::OpenAtlasError> {
        let generation = root.open(id).map_err(|error| match error {
            OpenError::Unpublished(id) => error::OpenAtlasError::Unpublished(id),
            error @ (OpenError::Identity { .. } | OpenError::Document(_) | OpenError::Io(_)) => {
                error::OpenAtlasError::Open(error)
            }
        })?;

        let files = &generation.repository().files;

        let quad = QuadFile::open(generation.path_of(&files.quad.name))?;
        let morton = MortonFile::open(generation.path_of(&files.morton.name))?;
        let coordinates = open_array(&generation, &files.wire_coordinates, ArrayKind::Coordinates)?;
        let rows = open_array(&generation, &files.row_of_position, ArrayKind::Rows)?;
        let endpoints = open_array(&generation, &files.edge_endpoints, ArrayKind::Endpoints)?;
        let rank_of_position = open_array(&generation, &files.rank_of_position, ArrayKind::Ranks)?;
        let position_of_row =
            open_array(&generation, &files.position_of_row, ArrayKind::Positions)?;
        let adjacency = MappedAdjacency::new(AdjacencyFile::open(
            generation.path_of(&files.adjacency.name),
        )?)?;

        let lod = generation.repository().metadata.reproducibility.config.lod;
        if lod.deepest().is_none() {
            return Err(error::OpenAtlasError::Schedule {
                span_log2: lod.span_log2,
                max_tile_depth: lod.max_tile_depth,
            });
        }

        let world = generation.repository().metadata.evidence.lod.world;
        let bounds = (morton.count() > 0).then(|| frame_extent(world));

        let this = Self {
            generation,
            lod,
            quad,
            morton,
            coordinates,
            rows,
            adjacency,
            endpoints,
            rank_of_position,
            position_of_row,
            bounds,
        };

        this.validate()?;

        Ok(this)
    }

    fn validate(&self) -> Result<(), error::OpenAtlasError> {
        let points = self
            .coordinates
            .points()
            .ok_or(error::OpenAtlasError::Shape {
                kind: ArrayKind::Coordinates,
            })?;
        let row_ids = self
            .rows
            .u32_elements()
            .ok_or(error::OpenAtlasError::Shape {
                kind: ArrayKind::Rows,
            })?;
        let endpoint_pairs = self
            .endpoints
            .u64_pairs()
            .ok_or(error::OpenAtlasError::Shape {
                kind: ArrayKind::Endpoints,
            })?;
        let ranks = self
            .rank_of_position
            .u32_elements()
            .ok_or(error::OpenAtlasError::Shape {
                kind: ArrayKind::Ranks,
            })?;
        let positions =
            self.position_of_row
                .u32_elements()
                .ok_or(error::OpenAtlasError::Shape {
                    kind: ArrayKind::Positions,
                })?;

        let codes = self.morton.count();
        if points.len() as u64 != codes
            || row_ids.len() as u64 != codes
            || ranks.len() as u64 != codes
            || positions.len() as u64 != codes
        {
            return Err(error::OpenAtlasError::Columns {
                codes,
                coordinates: points.len() as u64,
                rows: row_ids.len() as u64,
                ranks: ranks.len() as u64,
                positions: positions.len() as u64,
            });
        }

        if self.adjacency.rows() != codes {
            return Err(error::OpenAtlasError::Nodes {
                adjacency: self.adjacency.rows(),
                codes,
            });
        }

        if endpoint_pairs.len() as u64 != self.adjacency.edges() {
            return Err(error::OpenAtlasError::Edges {
                adjacency: self.adjacency.edges(),
                endpoints: endpoint_pairs.len() as u64,
            });
        }

        if let Some(root_node) = self.quad.nodes().first()
            && u64::from(root_node.points()) != codes
        {
            return Err(error::OpenAtlasError::Subtree {
                quad: u64::from(root_node.points()),
                codes,
            });
        }

        Ok(())
    }

    /// Returns the generation identity: the `HEAD` echo, the route
    /// echo.
    #[inline]
    #[must_use]
    pub const fn generation(&self) -> GenerationId {
        self.generation.id()
    }

    /// Assembles the generation's manifest document under the given
    /// request caps.
    #[must_use]
    pub fn manifest(&self, limits: ManifestLimits) -> Manifest {
        // Timestamps serialize as ISO-8601 strings; anything else
        // degrades to an absent `createdAt` rather than panicking a
        // read path.
        let created_at = self
            .generation
            .repository()
            .metadata
            .snapshot
            .axes
            .and_then(|axes| match serde_json::to_value(axes.decision_time) {
                Ok(serde_json::Value::String(text)) => Some(text),
                Ok(_) | Err(_) => None,
            });

        Manifest {
            generation: self.generation.id(),
            wire_version: WIRE_VERSION,
            variants: VARIANTS,
            bucket_schedule: BucketSchedule {
                span: 1 << self.lod.span_log2,
                cut: format!("z+{}", self.lod.span_log2),
                max_zoom: self.lod.max_tile_depth,
            },
            limits,
            created_at,
        }
    }

    /// Answers one tile request: `SALTILET` envelope bytes, ready to
    /// send under `application/vnd.hash.saltile-v1`.
    ///
    /// Version 0 serves the full unfiltered visible set in both
    /// modes; requests naming type coloring, a filter, or the detail
    /// trailer are rejected by name rather than answered with bytes
    /// that silently ignore them.
    ///
    /// # Errors
    ///
    /// Returns [`TileError::Depth`] when the zoom exceeds the
    /// generation's deepest served tile, [`TileError::Grid`] when the
    /// coordinate lies outside the zoom's grid, and
    /// [`TileError::Unsupported`] when the query names a version-0
    /// deferral.
    pub fn tile(&self, request: &TileRequest) -> Result<Vec<u8>, TileError> {
        if !request.query.colored_type_ids.is_empty() {
            return Err(TileError::Unsupported("coloredTypeIds"));
        }
        if request.query.filter.is_some() {
            return Err(TileError::Unsupported("filter"));
        }
        if request.query.include_detailed_data {
            return Err(TileError::Unsupported("includeDetailedData"));
        }

        let coordinate = request.coordinate;
        let maximum = self.lod.max_tile_depth;
        if coordinate.z > maximum {
            return Err(TileError::Depth {
                z: coordinate.z,
                maximum,
            });
        }

        let cell = cell_of(coordinate).ok_or(TileError::Grid {
            z: coordinate.z,
            x: coordinate.x,
            y: coordinate.y,
        })?;

        // The zoom's cut: buckets at or below z + span_log2 are
        // delivered by zoom z's cumulative schedule, and the tile's
        // own bucket is the cut itself. Bounded by the deepest grid,
        // which open validated against the key width.
        let cut = depth_of(coordinate.z + self.lod.span_log2);

        let node = self.node_of(cell);
        let (first_bucket, runs, ranges) = match (request.query.mode, coordinate.z) {
            (Mode::Delta, 0) => self.root_delta(cut),
            (Mode::Delta, _) => delta(cut, node),
            (Mode::Total, _) => self.total(cut, cell),
        };

        let children = node.map_or(0, occupied_children);
        let visible = match node {
            _ if coordinate.z == 0 => self.morton.count(),
            Some(node) => u64::from(node.points()),
            None => self.population(cell),
        };
        let global = (coordinate.z == 0).then(|| GlobalHead {
            visible: self.morton.fenceposts().segment(cut).end,
            bounds: self.bounds,
            min_resolution: self.deepest_occupied(),
        });

        let response = TileResponse {
            head: TileHead {
                generation: self.generation.id().digest(),
                variant: 0,
                coordinate,
                mode: request.query.mode,
                visible,
                first_bucket,
                runs: &runs,
                global,
                children,
            },
            ranges: &ranges,
            positions: self.positions(),
            rows: self.row_ids(),
            masks: None,
            trailer: None,
        };

        Ok(response.encode())
    }

    /// Answers one edges request: `SALTILEE` envelope bytes carrying
    /// the edges whose endpoints both lie in the listed tiles'
    /// delivered rows, ready to send under
    /// `application/vnd.hash.saltile-v1`.
    ///
    /// Delivery order is ascending edge row id, independent of the
    /// tiles listed and of truncation, so identical requests yield
    /// identical bytes. Beyond `caps.edges` the rank-ordered cap
    /// keeps the edges whose worse endpoint ranks best - an edge is
    /// only as prominent as its less-prominent endpoint - with ties
    /// broken by edge row id, and `HEAD` reports `complete: false`.
    ///
    /// Version 0 serves the full unfiltered edge set; requests naming
    /// a visibility filter or the detail trailer are rejected by name
    /// rather than answered with bytes that silently ignore them.
    ///
    /// # Errors
    ///
    /// Returns [`EdgesError::Tiles`] when the request lists more
    /// tiles than `caps.tiles`, [`EdgesError::Depth`] when a listed
    /// zoom exceeds the generation's deepest served tile,
    /// [`EdgesError::Grid`] when a listed coordinate lies outside its
    /// zoom's grid, and [`EdgesError::Unsupported`] when the request
    /// names a version-0 deferral.
    pub fn edges(&self, request: &EdgesRequest, caps: EdgesCaps) -> Result<Vec<u8>, EdgesError> {
        if request.filter.is_some() {
            return Err(EdgesError::Unsupported("filter"));
        }
        if request.include_detailed_data {
            return Err(EdgesError::Unsupported("includeDetailedData"));
        }
        if request.tiles.len() > caps.tiles as usize {
            return Err(EdgesError::Tiles {
                count: request.tiles.len(),
                maximum: caps.tiles,
            });
        }

        let delivered = self.delivered_rows(&request.tiles)?;
        let mut edges = self.qualifying_edges(&delivered);
        let complete = edges.len() <= caps.edges as usize;
        if !complete {
            self.truncate_by_rank(&mut edges, caps.edges as usize);
        }
        edges.sort_unstable_by_key(|edge| edge.row);

        let mut sources = Vec::with_capacity(edges.len());
        let mut targets = Vec::with_capacity(edges.len());
        let mut edge_rows = Vec::with_capacity(edges.len());
        for edge in &edges {
            sources.push(edge.source);
            targets.push(edge.target);
            edge_rows.push(edge.row);
        }

        Ok(EdgesResponse {
            generation: self.generation.id().digest(),
            variant: 0,
            complete,
            sources: &sources,
            targets: &targets,
            edge_rows: &edge_rows,
            trailer: None,
        }
        .encode())
    }

    /// Collects the union of the listed tiles' delivered rows as a
    /// row-indexed set.
    ///
    /// A tile's delivered set is mode-independent - its cumulative
    /// delta set equals its total set - so the union is one run scan
    /// per bucket of each tile's cumulative schedule, deduplicated by
    /// the set itself.
    fn delivered_rows(&self, tiles: &[TileCoordinate]) -> Result<BitSet, EdgesError> {
        let row_ids = self.row_ids();
        let mut delivered = BitSet::new(row_ids.len());
        let maximum = self.lod.max_tile_depth;
        for &coordinate in tiles {
            if coordinate.z > maximum {
                return Err(EdgesError::Depth {
                    z: coordinate.z,
                    maximum,
                });
            }
            let cell = cell_of(coordinate).ok_or(EdgesError::Grid {
                z: coordinate.z,
                x: coordinate.x,
                y: coordinate.y,
            })?;

            let cut = depth_of(coordinate.z + self.lod.span_log2);
            for bucket in 0..=cut.get() {
                let run = self.morton.run(depth_of(bucket), cell);
                let start = usize::try_from(run.start).expect("base positions fit usize");
                let end = usize::try_from(run.end).expect("base positions fit usize");
                for &row in &row_ids[start..end] {
                    delivered.insert(row as usize);
                }
            }
        }

        Ok(delivered)
    }

    /// Collects every edge whose endpoints both lie in `delivered`,
    /// in no particular order.
    ///
    /// The walk visits each delivered row's outgoing run, so every
    /// qualifying edge appears exactly once: an edge occupies exactly
    /// one outgoing slot, and a self-loop's one endpoint is both its
    /// source and its target.
    fn qualifying_edges(&self, delivered: &BitSet) -> Vec<DeliveredEdge> {
        let endpoints = self.endpoint_pairs();
        let mut edges = Vec::new();
        for row in delivered.iter() {
            let outgoing = self
                .adjacency
                .outgoing(NodeRowId::new(row as u64))
                .expect("delivered rows lie inside the adjacency's node domain");
            for edge in outgoing.iter() {
                let index = usize::try_from(edge.get()).expect("edge rows fit usize");
                let [source, target] = endpoints[index];
                let target_index = usize::try_from(target).expect("node rows fit usize");
                if delivered.contains(target_index) {
                    edges.push(DeliveredEdge {
                        row: narrow(edge.get()),
                        source: narrow(source),
                        target: narrow(target),
                    });
                }
            }
        }

        edges
    }

    /// Keeps the `cap` edges the rank-ordered cap selects: ascending
    /// by worse-endpoint rank, ties by edge row id.
    fn truncate_by_rank(&self, edges: &mut Vec<DeliveredEdge>, cap: usize) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<(u32, DeliveredEdge)> = edges
            .drain(..)
            .map(|edge| (self.worse_rank(edge), edge))
            .collect();
        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since edge rows are distinct - in the head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(rank, edge)| (rank, edge.row));
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, edge)| edge));
    }

    /// Returns an edge's truncation rank: its worse endpoint's
    /// importance rank, where larger values are less prominent.
    fn worse_rank(&self, edge: DeliveredEdge) -> u32 {
        self.rank_of_row(edge.source)
            .max(self.rank_of_row(edge.target))
    }

    /// Returns a node row's importance rank through the position
    /// permutation.
    fn rank_of_row(&self, row: u32) -> u32 {
        let position = self.positions_of_row()[row as usize];
        self.ranks()[position as usize]
    }

    /// Views the wire-coordinate column in base order.
    fn positions(&self) -> &[Vec2] {
        self.coordinates
            .points()
            .expect("open validated the wire-coordinate shape")
    }

    /// Views the row column in base order.
    fn row_ids(&self) -> &[u32] {
        self.rows
            .u32_elements()
            .expect("open validated the row-column shape")
    }

    /// Views the endpoint column: edge row to `[source, target]`.
    fn endpoint_pairs(&self) -> &[[u64; 2]] {
        self.endpoints
            .u64_pairs()
            .expect("open validated the endpoint-column shape")
    }

    /// Views the rank column in base order.
    fn ranks(&self) -> &[u32] {
        self.rank_of_position
            .u32_elements()
            .expect("open validated the rank-column shape")
    }

    /// Views the position permutation in row order.
    fn positions_of_row(&self) -> &[u32] {
        self.position_of_row
            .u32_elements()
            .expect("open validated the position-column shape")
    }

    /// Returns the quad node owning `cell`, [`None`] when the schedule
    /// delivers nothing new at or below it.
    fn node_of(&self, cell: MortonCell) -> Option<&Node> {
        let index = self.quad.locate(cell)?;
        Some(&self.quad.nodes()[index as usize])
    }

    /// Assembles the zoom-0 delta delivery: buckets `0..=m` as
    /// fencepost differences, one contiguous base-order range.
    #[expect(
        clippy::single_range_in_vec_init,
        reason = "an array of one range is what a delta delivery IS"
    )]
    fn root_delta(&self, cut: Depth) -> (u8, Vec<u32>, Vec<Range<u32>>) {
        let lengths = self.morton.fenceposts().lengths();
        let runs = lengths[..=cut.get() as usize]
            .iter()
            .map(|&length| narrow(length))
            .collect();
        let end = narrow(self.morton.fenceposts().segment(cut).end);

        (0, runs, vec![0..end])
    }

    /// Assembles a total delivery: one code-column run per bucket of
    /// the cumulative schedule, bucket-major.
    fn total(&self, cut: Depth, cell: MortonCell) -> (u8, Vec<u32>, Vec<Range<u32>>) {
        let mut runs = Vec::with_capacity(cut.get() as usize + 1);
        let mut ranges = Vec::with_capacity(cut.get() as usize + 1);
        for bucket in 0..=cut.get() {
            let run = self.morton.run(depth_of(bucket), cell);
            runs.push(narrow(run.end - run.start));
            ranges.push(narrow(run.start)..narrow(run.end));
        }

        (0, runs, ranges)
    }

    /// Counts the points of `cell` across every occupied bucket: the
    /// subtree count of a cell without a quad node.
    fn population(&self, cell: MortonCell) -> u64 {
        let lengths = self.morton.fenceposts().lengths();
        (0..=Depth::MAX.get())
            .filter(|&bucket| lengths[bucket as usize] > 0)
            .map(|bucket| {
                let run = self.morton.run(depth_of(bucket), cell);
                run.end - run.start
            })
            .sum()
    }

    /// Returns the deepest occupied bucket, zero when no point exists.
    fn deepest_occupied(&self) -> u64 {
        self.morton
            .fenceposts()
            .lengths()
            .iter()
            .rposition(|&length| length > 0)
            .map_or(0, |bucket| bucket as u64)
    }
}

/// Opens one array artifact, binding its open error to the role it
/// serves.
fn open_array(
    generation: &Generation,
    file: &crate::file::repository::RepositoryFile,
    kind: ArrayKind,
) -> Result<ArrayFile, error::OpenAtlasError> {
    ArrayFile::open(generation.path_of(&file.name))
        .map_err(|error| error::OpenAtlasError::OpenArray { kind, error })
}

/// Returns the Morton cell a tile coordinate addresses, [`None`]
/// outside the zoom's grid.
const fn cell_of(coordinate: TileCoordinate) -> Option<MortonCell> {
    let depth = depth_of(coordinate.z);
    MortonCell::new(depth, coordinate.x, coordinate.y)
}

/// Wraps a depth the schedule already bounds within the key width.
const fn depth_of(depth: u8) -> Depth {
    Depth::new(depth).expect("the schedule bounds its depths within the key width")
}

/// Narrows a base position or count to the wire's `u32` domain.
fn narrow(value: u64) -> u32 {
    u32::try_from(value).expect("base positions share the u32 row-id domain")
}

/// Assembles a non-root delta delivery: the node's own-bucket run
/// verbatim, one zero-length run when the cell has no node.
#[expect(
    clippy::single_range_in_vec_init,
    reason = "an array of one range is what a delta delivery IS"
)]
fn delta(cut: Depth, node: Option<&Node>) -> (u8, Vec<u32>, Vec<Range<u32>>) {
    node.map_or_else(
        || (cut.get(), vec![0], Vec::new()),
        |node| {
            let run = node.run();
            (
                cut.get(),
                vec![narrow(run.end - run.start)],
                vec![narrow(run.start)..narrow(run.end)],
            )
        },
    )
}

/// Reads the occupied-child bitmask off a node record: bit `i` set
/// when Morton child `i` holds a point below the node's cut, which by
/// the node-existence rule is exactly when the child node exists.
fn occupied_children(node: &Node) -> u8 {
    (0..4).fold(0_u8, |bits, quadrant| {
        bits | (u8::from(node.child(quadrant).is_some()) << quadrant)
    })
}

/// Derives the tight wire-frame extent of the full point set from the
/// world frame.
///
/// Normalization maps each axis's world minimum and maximum onto the
/// frame edges - values real points attain - and collapses a
/// zero-extent axis to the frame centre, so the extent is exact
/// without scanning the coordinate column.
fn frame_extent(world: Bounds2) -> Bounds2 {
    #[expect(
        clippy::float_cmp,
        reason = "a zero-extent axis collapses to the centre by exact equality: the normalization \
                  contract, not a tolerance check"
    )]
    let axis = |minimum: f32, maximum: f32| {
        if minimum == maximum {
            (0.0, 0.0)
        } else {
            (-1.0, 1.0)
        }
    };
    let (min_x, max_x) = axis(world.min().x(), world.max().x());
    let (min_y, max_y) = axis(world.min().y(), world.max().y());

    Bounds2::new(Vec2::new(min_x, min_y), Vec2::new(max_x, max_y))
        .expect("the frame extent corners are finite and ordered")
}
