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
//!
//! Each read surface lives in its own module - request vocabulary,
//! rejections, and assembly together: [`tile`](self) delivery,
//! [`edges`](self) delivery, the [`manifest`](self) document, and the
//! [`open`](self) pass that validates everything the others rely on.

pub use self::{
    detail::{
        DeliveredEntities, DetailError, LinkDetails, LocateNodeDetails, NodeDetails,
        PostgresDetails, SimpleValue,
    },
    edges::{EdgesCaps, EdgesDocument, EdgesError, EdgesRequest},
    locate::{LocateCaps, LocateDocument, LocateError, LocateRequest, OpenOptions},
    manifest::{BucketSchedule, Manifest, ManifestLimits},
    tile::{TileCaps, TileDocument, TileError, TileQuery, TileRequest},
    translate::{
        TranslateCaps, TranslateError, TranslateRequest, TranslateResponse, TranslatedEdge,
        TranslatedNode,
    },
};
use crate::{
    dataset::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    file::{
        array::ArrayFile, generation::Generation, morton::read::MortonFile, quad::read::QuadFile,
    },
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell},
    salt::{
        adjacency::AdjacencyArchive,
        fit::prepare::identity::IdentityTableArchive,
        lod::stage::LodConfig,
        postings::{closure::ClosureMap, mapped::PostingsArchive},
    },
};
pub use crate::{
    file::generation::{CurrentError, GenerationId, GenerationRoot},
    salt::wire::{Mode, tile::TileCoordinate},
};

mod color;
mod detail;
mod edges;
mod error;
mod locate;
mod manifest;
mod open;
mod tile;
mod translate;

#[cfg(test)]
mod tests;

/// The variant names one generation serves, in variant-index order.
///
/// Version 1 serves the canonical frame alone; the set grows with the
/// ladder's conditions, at which point it moves from this constant to
/// generation metadata.
pub const VARIANTS: [&str; 1] = ["plain"];

/// Every per-request serving cap in one configurable value.
///
/// The transport constructs one - flags and environment over the
/// defaults - the handlers enforce it, and the manifest publishes it
/// through [`ServeCaps::limits`]: one source, so advertisement and
/// enforcement cannot disagree. Defaults are documented on the
/// per-endpoint caps types; none of them is a wire constant.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct ServeCaps {
    /// The tile endpoint's caps.
    pub tile: TileCaps,
    /// The edges endpoint's caps.
    pub edges: EdgesCaps,
    /// The locate endpoint's caps.
    pub locate: LocateCaps,
    /// The translate endpoint's caps.
    pub translate: TranslateCaps,
}

/// An opaque visibility filter: the upstream-owned predicate document.
///
/// The predicate's schema belongs to the client codebase; the server
/// treats it as a value to canonicalize and hash, never as a typed
/// structure. Version 0 rejects requests that carry one.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
pub struct Filter(serde_json::Value);

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
/// use hash_graph_atlas::serve::{
///     Atlas, GenerationRoot, TileCaps, TileCoordinate, TileQuery, TileRequest,
/// };
///
/// # fn main() -> Result<(), Box<dyn core::error::Error>> {
/// let root = GenerationRoot::new("/var/atlas/generations")?;
/// let id = root.current()?.expect("a generation is active");
/// let atlas = Arc::new(Atlas::open(&root, id)?);
///
/// let bytes = atlas.tile(
///     &TileRequest {
///         coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
///         query: TileQuery::default(),
///     },
///     TileCaps::default(),
/// )?;
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
    adjacency: AdjacencyArchive,
    endpoints: ArrayFile,
    rank_of_position: ArrayFile,
    position_of_row: ArrayFile,
    postings: PostingsArchive,
    closure: ClosureMap,
    /// The ontology identity table, joining type uuids to ontology
    /// rows. Present by construction: a generation whose ids are not
    /// store identities fails the open, as do the node and edge
    /// tables below.
    ontology_ids: IdentityTableArchive<ArchivedOntologyTypeUuid>,
    /// The node identity table, joining node rows to entity
    /// identities.
    node_ids: IdentityTableArchive<ArchivedEntityId>,
    /// The edge identity table, joining edge rows to link-entity
    /// identities.
    edge_ids: IdentityTableArchive<ArchivedEntityId>,
    /// The exact spatial index behind locate's neighbour selection,
    /// built or cache-loaded at open.
    locate: locate::LocateIndex,
    /// The tight wire-frame extent of the full point set, absent iff
    /// the generation holds no points. Derived from the world frame:
    /// normalization anchors each non-degenerate axis's extremes onto
    /// the frame edges and collapses degenerate axes to the centre,
    /// so the extent follows without scanning the column.
    bounds: Option<Bounds2>,
}

/// The validated column views: every accessor's shape was checked once
/// at open, so reads unwrap without re-validating.
impl Atlas {
    /// Returns the generation identity: the `HEAD` echo, the route
    /// echo.
    #[inline]
    #[must_use]
    pub const fn generation(&self) -> GenerationId {
        self.generation.id()
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
