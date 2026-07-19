//! The serving read surface: opened generations answering atlas reads.
//!
//! [`Atlas::open`] maps one published generation's serving artifacts -
//! quadtree topology, Morton code column, wire coordinates, and the
//! base-order row column - and validates each format plus their
//! cross-artifact agreement once, so every read after that is mmap
//! gathers and wire encoding. [`Atlas::tile`] answers one tile request
//! with `SALTILET` envelope bytes ready to send under
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

pub use crate::{
    file::generation::{CurrentError, GenerationId, GenerationRoot},
    salt::wire::{Mode, tile::TileCoordinate},
};
use crate::{
    file::{
        array::ArrayFile,
        generation::{Generation, OpenError},
        morton::read::MortonFile,
        quad::{Node, read::QuadFile},
    },
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell},
    salt::{
        lod::stage::LodConfig,
        wire::{
            WIRE_VERSION,
            tile::{GlobalHead, TileHead, TileResponse},
        },
    },
};

#[cfg(test)]
mod tests;

/// The variant names one generation serves, in variant-index order.
///
/// Version 1 serves the canonical frame alone; the set grows with the
/// ladder's conditions, at which point it moves from this constant to
/// generation metadata.
pub const VARIANTS: [&str; 1] = ["plain"];

/// Opening a generation's serving surface failed.
#[derive(Debug)]
pub enum OpenAtlasError {
    /// The generation is not published in this root.
    Unpublished(GenerationId),
    /// An artifact failed to read, parse, or validate under its
    /// format.
    Artifact {
        /// The artifact's repository role.
        role: &'static str,
        /// The format's own rejection.
        source: Box<dyn Error + Send + Sync>,
    },
    /// The recorded schedule exceeds the Morton key width, so no tile
    /// grid exists to serve.
    Schedule {
        /// The recorded cells-per-tile-axis exponent.
        span_log2: u8,
        /// The recorded deepest tile zoom.
        max_tile_depth: u8,
    },
    /// An artifact's element type or shape is not the serving
    /// contract's.
    Shape {
        /// The artifact's repository role.
        role: &'static str,
    },
    /// The base-order columns disagree on the point count.
    Columns {
        /// Codes in the morton column.
        codes: u64,
        /// Points in the wire-coordinate column.
        coordinates: u64,
        /// Entries in the row column.
        rows: u64,
    },
    /// The quadtree root's subtree count contradicts the code column.
    Subtree {
        /// The root node's subtree point count.
        quad: u64,
        /// Codes in the morton column.
        codes: u64,
    },
}

impl fmt::Display for OpenAtlasError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(formatter, "generation {id} is not published in this root")
            }
            Self::Artifact { role, source } => {
                write!(formatter, "the {role} artifact failed to open: {source}")
            }
            Self::Schedule {
                span_log2,
                max_tile_depth,
            } => write!(
                formatter,
                "the recorded schedule needs {max_tile_depth} + {span_log2} subdivisions where a \
                 64-bit Morton key resolves {}",
                Depth::MAX.get(),
            ),
            Self::Shape { role } => write!(
                formatter,
                "the {role} artifact does not hold the serving contract's shape",
            ),
            Self::Columns {
                codes,
                coordinates,
                rows,
            } => write!(
                formatter,
                "the base-order columns disagree on the point count: {codes} codes, {coordinates} \
                 coordinates, {rows} rows",
            ),
            Self::Subtree { quad, codes } => write!(
                formatter,
                "the quadtree root counts {quad} points where the code column holds {codes}",
            ),
        }
    }
}

impl Error for OpenAtlasError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Artifact { source, .. } => Some(source.as_ref()),
            Self::Unpublished(_)
            | Self::Schedule { .. }
            | Self::Shape { .. }
            | Self::Columns { .. }
            | Self::Subtree { .. } => None,
        }
    }
}

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

/// An opaque visibility filter: the upstream-owned predicate document.
///
/// The predicate's schema belongs to the client codebase; the server
/// treats it as a value to canonicalize and hash, never as a typed
/// structure. Version 0 rejects requests that carry one.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Filter(serde_json::Value);

/// The query context of one tile request: the ratified POST body,
/// every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize)]
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

/// The per-request caps of the manifest's `limits` block: transport
/// configuration published as data, so clients validate before
/// sending instead of learning caps from rejections.
///
/// The version-0 defaults are the honest zeros: type coloring, the
/// edges endpoint, and locate are all deferred, so no request
/// carrying them is admitted.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize)]
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
            edges_tiles: 0,
            locate_neighbours: 0,
        }
    }
}

/// The immutable per-generation manifest: the Surface v1 bootstrap
/// document, derived from configuration alone so it can be shared
/// across principals.
#[derive(Debug, Clone, serde::Serialize)]
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
#[derive(Debug, Clone, serde::Serialize)]
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
    pub fn open(root: &GenerationRoot, id: GenerationId) -> Result<Self, OpenAtlasError> {
        let generation = root.open(id).map_err(|error| match error {
            OpenError::Unpublished(id) => OpenAtlasError::Unpublished(id),
            error @ (OpenError::Identity { .. } | OpenError::Document(_) | OpenError::Io(_)) => {
                OpenAtlasError::Artifact {
                    role: "metadata",
                    source: Box::new(error),
                }
            }
        })?;

        let files = &generation.repository().files;
        let quad = QuadFile::open(generation.path_of(&files.quad.name)).map_err(|error| {
            OpenAtlasError::Artifact {
                role: "quad",
                source: Box::new(error),
            }
        })?;
        let morton = MortonFile::open(generation.path_of(&files.morton.name)).map_err(|error| {
            OpenAtlasError::Artifact {
                role: "morton",
                source: Box::new(error),
            }
        })?;
        let coordinates = ArrayFile::open(generation.path_of(&files.wire_coordinates.name))
            .map_err(|error| OpenAtlasError::Artifact {
                role: "wire_coordinates",
                source: Box::new(error),
            })?;
        let rows =
            ArrayFile::open(generation.path_of(&files.row_of_position.name)).map_err(|error| {
                OpenAtlasError::Artifact {
                    role: "row_of_position",
                    source: Box::new(error),
                }
            })?;

        let lod = generation.repository().metadata.reproducibility.config.lod;
        if lod.deepest().is_none() {
            return Err(OpenAtlasError::Schedule {
                span_log2: lod.span_log2,
                max_tile_depth: lod.max_tile_depth,
            });
        }

        let points = coordinates.points().ok_or(OpenAtlasError::Shape {
            role: "wire_coordinates",
        })?;
        let row_ids = rows.u32_elements().ok_or(OpenAtlasError::Shape {
            role: "row_of_position",
        })?;

        let codes = morton.count();
        if points.len() as u64 != codes || row_ids.len() as u64 != codes {
            return Err(OpenAtlasError::Columns {
                codes,
                coordinates: points.len() as u64,
                rows: row_ids.len() as u64,
            });
        }
        if let Some(root_node) = quad.nodes().first()
            && u64::from(root_node.points()) != codes
        {
            return Err(OpenAtlasError::Subtree {
                quad: u64::from(root_node.points()),
                codes,
            });
        }

        let world = generation.repository().metadata.evidence.lod.world;
        let bounds = (codes > 0).then(|| frame_extent(world));

        Ok(Self {
            generation,
            lod,
            quad,
            morton,
            coordinates,
            rows,
            bounds,
        })
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
