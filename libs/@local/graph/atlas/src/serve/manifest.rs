//! The manifest document.
//!
//! The immutable Surface v1 bootstrap, derived from serving configuration and the generation's
//! snapshot provenance - no corpus-derived aggregates.

use core::fmt;

use super::{Atlas, GenerationId, ServeLimits, VARIANTS};
use crate::salt::wire::WIRE_VERSION;

/// The serving limits of the manifest's `limits` block.
///
/// Each value is read from the limit the handlers enforce, so an advertised limit never disagrees
/// with enforcement. Request-validation limits let a client validate before sending;
/// response-shaping limits and the seal windows say what delivery truncates and when sealed
/// values expire.
///
/// A limit belongs here when a correct client's own behaviour depends on it - what it may ask for,
/// what it must expect back, when it should refresh - and the block carries nothing a client cannot
/// act on. The visibility cache's windows and capacity govern no client behaviour and are absent
/// for that reason.
///
/// The seal windows are safe to publish because a validity bound is discoverable by the party the
/// bound applies to: the holder of a sealed blob reads its issue time from the clear envelope, and
/// presenting the blob is itself the test of whether it still opens. Publication therefore states a
/// threshold that holder could measure, and states nothing at all to a caller holding no blob. What
/// would be a disclosure is a refusal that distinguishes its cause; a seal refusal names none, and
/// every cause answers one uniform state-required refusal.
// Never built freehand outside tests: `ServeLimits::manifest_limits` is the one derivation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLimits {
    /// Most `coloredTypeIds` entries one request may carry.
    pub colored_type_ids: u32,
    /// Most tiles one edges request may list.
    pub edges_tiles: u32,
    /// Most ego-graph edges one locate response delivers before the nearest-partner truncation.
    pub locate_edges: u32,
    /// Most properties a locate source ships.
    pub locate_properties: u32,
    /// Most direct types one locate edge ships.
    pub locate_link_type_ids: u32,
    /// Most properties one locate edge ships.
    pub locate_link_properties: u32,
    /// Most entity ids one translate request may carry.
    pub translate_entity_ids: u32,
    /// The sealed-blob asynchronous-refresh horizon, seconds.
    pub seal_soft_seconds: u64,
    /// The sealed-blob rejection bound, seconds.
    pub seal_hard_seconds: u64,
}

impl ServeLimits {
    /// Derives the manifest's `limits` block from the limits the handlers enforce.
    ///
    /// One source, so the published limits cannot disagree with enforcement.
    #[must_use]
    pub const fn manifest_limits(&self) -> ManifestLimits {
        ManifestLimits {
            colored_type_ids: self.tile.colored_type_ids,
            edges_tiles: self.edges.tiles,
            locate_edges: self.locate.edges,
            locate_properties: self.locate.properties,
            locate_link_type_ids: self.locate.link_type_ids,
            locate_link_properties: self.locate.link_properties,
            translate_entity_ids: self.translate.entity_ids,
            seal_soft_seconds: self.seal.soft.as_secs(),
            seal_hard_seconds: self.seal.hard.as_secs(),
        }
    }
}

/// The immutable per-generation manifest: everything a client needs before its first tile.
///
/// Derived from serving configuration and snapshot provenance alone, so one document serves every
/// caller and stays valid for the generation's lifetime.
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
    /// The published serving limits.
    pub limits: ManifestLimits,
    /// The snapshot's decision-time point, ISO-8601.
    ///
    /// Absent for generations fitted from sources without temporal axes, such as synthetic
    /// fixtures.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

/// The manifest's `bucketSchedule` block.
#[derive(Debug, Copy, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BucketSchedule {
    /// Cells per tile axis of the delivery cut: `2^span`.
    pub span: u32,
    /// The cut rule: zoom `z` delivers buckets at or below `z + span`.
    #[schemars(with = "String")]
    pub cut: BucketCut,
    /// The deepest tile zoom the schedule serves.
    pub max_zoom: u8,
}

/// The cut rule of the manifest's `bucketSchedule.cut` key.
///
/// Zoom `z`'s cumulative schedule delivers buckets at or below `z + span`, and the wire form is
/// that formula: the string `z+<span>`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct BucketCut {
    /// The schedule's span exponent, the formula's addend.
    span_log2: u8,
}

impl fmt::Display for BucketCut {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "z+{}", self.span_log2)
    }
}

impl serde::Serialize for BucketCut {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(self)
    }
}

impl Atlas {
    /// Assembles the generation's manifest document under the given request limits.
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
                span: 1 << self.grid.span_log2(),
                cut: BucketCut {
                    span_log2: self.grid.span_log2(),
                },
                max_zoom: self.grid.max_tile_depth(),
            },
            limits,
            created_at,
        }
    }
}
