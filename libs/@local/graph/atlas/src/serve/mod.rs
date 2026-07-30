//! The serving read surface: opened generations answering atlas reads.
//!
//! [`Atlas::open`] maps one published generation's serving artifacts - quadtree topology, Morton
//! code column, wire coordinates, the base-order row column, the incident-edge adjacency with its
//! endpoint column, and the rank and position permutations - and validates each format plus their
//! cross-artifact agreement once, so every read after that is mmap gathers and wire encoding.
//! [`Atlas::tile`] answers one tile request with `SALTILET` envelope bytes and [`Atlas::edges`] one
//! edges request with `SALTILEE` bytes, both ready to send under `application/vnd.hash.saltile-v1`;
//! the manifest document of the Surface v1 bootstrap is [`Atlas::manifest`].
//!
//! An [`Atlas`] is immutable after open and `Send + Sync`: hold it in an [`Arc`](alloc::sync::Arc)
//! across requests for the process lifetime of the generation. Reads are synchronous and CPU-bound
//! (the columns are mapped memory), so an async transport schedules them on a compute pool - rayon
//! plus `catch_unwind` - never inline on its runtime threads.
//!
//! The route and body vocabulary and the response bytes are pinned public contracts. The one
//! deferral rejects honestly instead of serving wrong bytes: a request that names a visibility
//! `filter` receives an `Unsupported` rejection.
//!
//! Every assembly path takes a [`VisibilityProof`] - the server-held statement of which node rows
//! and which link rows the bound scope may see. Responses compute over the masked view: delivered
//! sets intersect the node mask, an edge delivers only when the proof holds its own link row and
//! both endpoints, and row ingress factors through [`Atlas::resolve`], where decode failure,
//! out-of-universe values, and mask misses collapse to one `None` - forbidden and nonexistent
//! answer identical bytes.
//!
//! Every surface answers under any proof, the link-bearing ones included: a proof carries a mask
//! per identity domain, so the authorization of a link row is a statement the proof holds rather
//! than something its endpoints imply. Refusals are per row - an unproven row is absent - so a
//! scope that may see nothing receives a well-formed response that delivers nothing.
//!
//! # Architecture
//!
//! Each domain concept lives in exactly one module. The foundation: `open` is the open pass -
//! map, validate, derive, construct; `column` holds the element-typed column views that
//! validation produces; `grid` is the bucket schedule and its addressing; `secret` the wire
//! secret; `error` the open-failure taxonomy.
//!
//! The domain: `visibility` carries the proof and the resolution seam; `codec` the keyed row-id
//! permutation; `density` the public band that resolves one scope's delivery cut; `walk` the
//! schedule-driven point
//! delivery - full-visibility range assembly, the masked delivery chain, and the census;
//! `neighbourhood` the adjacency edge sets and their caps; `colour` the type-colouring resolution;
//! `intern` the wire intern tables; `authorization` the sealed authority tokens; `hydrate` the
//! live store reads behind detail trailers.
//!
//! The read surfaces compose those: `tile`, `edges`, `locate`, and `translate` each hold one
//! endpoint's request vocabulary, rejection taxonomy, and assembly, and `manifest` the bootstrap
//! document. Below the [`Atlas`] facade nothing reaches into the whole value: the domain types
//! borrow exactly the columns they read.

use self::grid::Grid;
pub use self::{
    cache::VisibilityLimits,
    codec::WireRow,
    density::{CutOffset, DensityBand, DensityPolicy, DensityPolicyError, ViewOccupancy},
    edges::{EdgesDocument, EdgesError, EdgesLimits, EdgesRequest},
    error::OpenAtlasError,
    hydrate::{
        DeliveredEntities, DetailError, EdgeLinkDetails, GraphDatabaseClient, LocateLinkDetails,
        LocateNodeDetails, NodeDetails, SimpleValue,
    },
    locate::{LocateDocument, LocateError, LocateLimits, LocateRequest},
    manifest::{BucketSchedule, Manifest, ManifestLimits},
    open::OpenOptions,
    secret::{WireSecret, WireSecretError},
    tile::{TileDocument, TileError, TileLimits, TileQuery, TileRequest},
    translate::{
        TranslateError, TranslateLimits, TranslateRequest, TranslateResponse, TranslatedEdge,
        TranslatedNode,
    },
    visibility::{VisibilityProof, VisibleRow},
    walk::ViewCensus,
};
pub(crate) use self::{
    cache::{Resolution, VisibilityCache, VisibilityKey},
    hydrate::compile::{ProofError, visibility_proof},
};
use crate::{
    dataset::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    file::{generation::Generation, morton::read::MortonFile, quad::read::QuadFile},
    identity::{Column, EdgeRowId, NodeRowId, OntologyRowId},
    math::{Bounds2, Vec2},
    salt::{
        adjacency::AdjacencyArchive,
        fit::prepare::identity::IdentityTableArchive,
        postings::{artifact::PostingsArchive, closure::ClosureMap},
    },
};
pub use crate::{
    file::generation::{CurrentError, GenerationId, GenerationRoot},
    salt::wire::{Mode, tile::TileCoordinate},
};

mod cache;
mod codec;
mod colour;
mod density;
mod edges;
mod error;
mod grid;
mod hydrate;
mod intern;
mod locate;
mod manifest;
mod neighbourhood;
mod open;
mod secret;
mod tile;
mod translate;
mod visibility;
mod walk;

pub(crate) mod authorization;
#[cfg(test)]
mod tests;

/// The variant names one generation serves, in variant-index order.
///
/// Surface v1 serves exactly `plain`; routes and manifests take variant names and indices from
/// this constant.
pub const VARIANTS: [&str; 1] = ["plain"];

/// The serving controls in one configurable value: request-validation limits and response-shaping
/// limits.
///
/// The transport constructs one - flags and environment over the defaults - and the handlers
/// enforce it. Every published manifest limit derives from an enforced value through
/// [`ServeLimits::manifest_limits`], so advertisement and enforcement cannot disagree; not every
/// control is published. Defaults are documented on the per-endpoint limits types; none of them is
/// a wire constant.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ServeLimits {
    /// The tile endpoint's limits.
    pub tile: TileLimits,
    /// The edges endpoint's limits.
    pub edges: EdgesLimits,
    /// The locate endpoint's limits.
    pub locate: LocateLimits,
    /// The translate endpoint's limits.
    pub translate: TranslateLimits,
}

const impl Default for ServeLimits {
    fn default() -> Self {
        Self {
            tile: TileLimits::default(),
            edges: EdgesLimits::default(),
            locate: LocateLimits::default(),
            translate: TranslateLimits::default(),
        }
    }
}

/// An opaque visibility filter document.
///
/// The document's schema belongs to the client codebase; the server never reads it as a typed
/// structure. Reserved: a request that carries one is rejected with `unsupported-feature`.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
pub struct Filter(serde_json::Value);

/// One opened generation, ready to answer reads.
///
/// Opening maps every serving artifact and validates each format plus their cross-artifact
/// agreement once; the value is immutable after that and shared across requests.
///
/// # Examples
///
/// ```no_run
/// use std::sync::Arc;
///
/// use hash_graph_atlas::serve::{
///     Atlas, GenerationRoot, OpenOptions, TileCoordinate, TileLimits, TileQuery, TileRequest,
///     VisibilityProof, WireSecret,
/// };
///
/// # fn main() -> Result<(), Box<dyn core::error::Error>> {
/// let root = GenerationRoot::new("/var/atlas/generations")?;
/// let id = root.current()?.expect("a generation is active");
/// let secret =
///     WireSecret::from_hex("6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55")?;
/// let atlas = Arc::new(Atlas::open(
///     &root,
///     id,
///     &OpenOptions {
///         wire_secret: secret,
///     },
/// )?);
///
/// // Authority over the whole corpus, stated deliberately.
/// let proof = VisibilityProof::full_visibility();
/// let bytes = atlas.tile(
///     &TileRequest {
///         coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
///         query: TileQuery::default(),
///     },
///     TileLimits::default(),
///     &proof,
/// )?;
/// # Ok(())
/// # }
/// ```
#[derive(Debug)]
pub struct Atlas {
    generation: Generation,
    /// The validated bucket schedule and its addressing.
    grid: Grid,
    quad: QuadFile,
    morton: MortonFile,
    /// The wire-coordinate column in base order.
    points: Column<Vec2>,
    /// The row column in base order: the node universe's permutation.
    rows: Column<u32>,
    adjacency: AdjacencyArchive,
    /// The endpoint column: edge row to `[source, target]`.
    endpoints: Column<[NodeRowId; 2]>,
    /// The rank column in base order.
    ranks: Column<u32>,
    /// The position permutation in row order.
    positions_of_row: Column<u32>,
    postings: PostingsArchive,
    closure: ClosureMap,
    /// The ontology identity table, joining type uuids to ontology rows.
    ///
    /// Present by construction: a generation whose ids are not store identities fails the open, as
    /// do the node and edge tables below.
    ontology_ids: IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,
    /// The node identity table, joining node rows to entity identities.
    node_ids: IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    /// The edge identity table, joining edge rows to link-entity identities.
    edge_ids: IdentityTableArchive<ArchivedEntityId, EdgeRowId>,
    /// The node universe's wire row-id codec, derived at open.
    ///
    /// The one wire-id domain: edges cross the wire as link-entity identities.
    node_codec: codec::RowCodec<NodeRowId>,
    /// The wire row-id column in base order.
    ///
    /// The row column mapped through the node codec once at open, so position-driven gathers
    /// (tiles, locate) pay nothing per request.
    wire_rows: Vec<WireRow<NodeRowId>>,
    /// The tight wire-frame extent of the full point set.
    ///
    /// Absent iff the generation holds no points. Derived from the world frame: normalization
    /// anchors each non-degenerate axis's extremes onto the frame edges and collapses degenerate
    /// axes to the centre, so the extent follows without scanning the column.
    bounds: Option<Bounds2>,
}

/// The validated column views.
impl Atlas {
    /// Returns the generation identity: the `HEAD` echo, the route echo.
    #[inline]
    #[must_use]
    pub const fn generation(&self) -> GenerationId {
        self.generation.id()
    }

    /// Views the wire-coordinate column in base order.
    fn positions(&self) -> &[Vec2] {
        self.points.view()
    }

    /// Views the row column in base order.
    fn row_ids(&self) -> &[u32] {
        self.rows.view()
    }

    /// Views the wire row-id column in base order.
    const fn wire_rows(&self) -> &[WireRow<NodeRowId>] {
        self.wire_rows.as_slice()
    }

    /// Views the endpoint column: edge row to `[source, target]`.
    fn endpoint_pairs(&self) -> &[[NodeRowId; 2]] {
        self.endpoints.view()
    }

    /// Views the rank column in base order.
    fn ranks(&self) -> &[u32] {
        self.ranks.view()
    }

    /// Views the position permutation in row order.
    fn positions_of_row(&self) -> &[u32] {
        self.positions_of_row.view()
    }
}
