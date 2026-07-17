//! Canonical coordinate indexes and immutable base artifacts.
//!
//! Materialization turns one quantized coordinate field into a delivery layout
//! without changing generation-row identity. The base artifact stores a
//! permutation for efficient rendering and the complete row-to-entity
//! directory for durable identity translation.
//!
//! # Multiresolution importance
//!
//! Points first receive one stable global priority:
//!
//! 1. descending declared importance;
//! 2. descending semantic priority;
//! 3. a content-derived entity-identity tie break; and
//! 4. ascending generation row.
//!
//! Coordinates are quantized to 16 bits per axis inside the declared extent
//! and interleaved into a 32-bit [`MortonKey`]. For each configured grid depth,
//! the highest-priority unassigned point in every newly occupied cell enters
//! the next bucket. Points still sharing a finest-depth cell enter one overflow
//! bucket. Every generation row appears exactly once.
//!
//! This schedule exposes a deterministic first-occupant prefix: a client can
//! render early buckets for a sparse overview and append later buckets for
//! detail without re-ranking or changing identities. Morton order within a
//! bucket preserves coarse spatial locality for range scans.
//!
//! # Base artifact
//!
//! Delivery sections are ordered by
//! `(bucket, Morton key, priority rank, generation row)`. Separate identity
//! sections remain in generation-row order. The artifact also embeds the
//! canonical field hash, selected condition and domain, selection evidence,
//! alignment transform, identity-directory hash, and quantization step.
//!
//! Publication verifies that ranked rows form a complete permutation and that
//! every coordinate is finite and representable as [`f32`]. The resulting
//! artifact is immutable; later activation only points readers at its already
//! verified content hash.
//!
//! Ranking requires `O(n log n)` time for the stable priority order and
//! `O(n * d)` membership work for `d` configured grid depths. It uses linear
//! additional memory.

mod base;
mod canonical;
mod error;
mod importance;
mod lookup;
mod morton;
mod overlay;
mod tile;

#[allow(
    unused_imports,
    reason = "materialization diagnostics and ranking form the generation adapter surface"
)]
pub(crate) use self::{
    base::{CanonicalProvenance, publish_base_artifact},
    canonical::{MaterializedBase, materialize_base_revision},
    error::{BaseArtifactError, ImportanceError},
    importance::{
        CoordinateBounds, ImportanceConfig, ImportanceInput, RankedPoint, rank_importance,
    },
    lookup::{LookupError, LookupRequest, MAXIMUM_LOOKUP_HITS, SpatialHit, SpatialIndex},
    morton::MortonKey,
    overlay::{
        CONTOUR_WIRE_V1_CONTENT_TYPE, EncodedOverlay, FLOW_WIRE_V1_CONTENT_TYPE, OverlayError,
        encode_contours, encode_flows,
    },
    tile::{
        EncodedTile, MAXIMUM_TILE_POINTS, TILE_WIRE_V4_CONTENT_TYPE, TileError, TileRequest,
        encode_tile,
    },
};
#[cfg(test)]
pub(crate) use crate::salt::format::BASE_ARTIFACT_FORMAT;

#[cfg(test)]
mod tests;
