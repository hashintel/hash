//! The manifest document.
//!
//! The Surface v1 bootstrap: the generation's serving contract - schedule, limits, provenance, no
//! corpus-derived aggregates - plus the one per-caller block, the resolved delivery schedule the
//! caller's authority token seals.

use core::fmt;

use super::{Atlas, ServeLimits, VARIANTS, VisibilityLimits, density::CutOffset};
use crate::{file::generation::GenerationId, salt::wire::WIRE_VERSION};

/// The serving limits of the manifest's `limits` block.
///
/// Each value comes from a value the server enforces, so an advertised limit never disagrees with
/// enforcement. Request-validation limits let a client validate before sending, and
/// response-shaping limits say what delivery truncates. The staleness windows say when a held
/// authority token expires.
///
/// A limit belongs here when a correct client's own behaviour depends on it - what it may ask for
/// and must expect back, and when to refresh - and the block carries nothing a client cannot
/// act on. The staleness windows are the visibility cache's own pair. A token names a cached scope,
/// so the token's validity and the entry's are one question and publish as one pair. The cache's
/// entry capacity governs no client behaviour and stays absent.
///
/// The windows are safe for publication because a validity bound is discoverable by the party the
/// bound applies to. The holder of a token reads its issue time from the clear envelope, and
/// presenting the token is itself the test of whether it still opens. Publication therefore states
/// a threshold that holder could measure, and states nothing at all to a caller holding no token.
/// What would be a disclosure is a refusal that distinguishes its cause; an authority refusal names
/// none, and every cause answers one uniform refusal.
// Never built freehand outside tests: `ServeLimits::manifest_limits` is the one derivation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManifestLimits {
    /// Most `coloredTypeIds` entries one request may carry.
    pub colored_type_ids: u32,
    /// Most tiles one edges request may list.
    pub edges_tiles: u32,
    /// Most ego-graph edges one locate response delivers before the nearest-partner truncation.
    pub locate_edges: u32,
    /// Most properties a locate source delivers.
    pub locate_properties: u32,
    /// Most direct types one locate edge delivers.
    pub locate_link_type_ids: u32,
    /// Most properties one locate edge delivers.
    pub locate_link_properties: u32,
    /// Most entity ids one translate request may carry.
    pub translate_entity_ids: u32,
    /// The authority token's asynchronous-refresh horizon, seconds.
    pub authority_soft_seconds: u64,
    /// The authority token's rejection bound, seconds.
    pub authority_hard_seconds: u64,
}

impl ServeLimits {
    /// Derives the manifest's `limits` block from the values the server enforces.
    ///
    /// The request and response limits come from the handlers' own configuration; the staleness
    /// windows from `visibility`, the pair the cache enforces. One source per value, so the
    /// published limits cannot disagree with enforcement.
    #[must_use]
    pub(crate) const fn manifest_limits(&self, visibility: VisibilityLimits) -> ManifestLimits {
        ManifestLimits {
            colored_type_ids: self.tile.colored_type_ids,
            edges_tiles: self.edges.tiles,
            locate_edges: self.locate.edges,
            locate_properties: self.locate.properties,
            locate_link_type_ids: self.locate.link_type_ids,
            locate_link_properties: self.locate.link_properties,
            translate_entity_ids: self.translate.entity_ids,
            authority_soft_seconds: visibility.soft.as_secs(),
            authority_hard_seconds: visibility.hard.as_secs(),
        }
    }
}

/// Everything a client needs before its first tile.
///
/// Every block except [`Manifest::scope_schedule`] derives from serving configuration and snapshot
/// provenance alone and stays valid for the generation's lifetime; the scope block is the caller's
/// own, sealed into the authority token issued beside this document.
#[derive(Debug, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Manifest {
    /// The generation identity, echoing the route.
    pub generation: GenerationId,
    /// The `SALTILE` family version the tile bytes speak.
    pub wire_version: u16,
    /// The variant names, in variant-index order.
    pub variants: [&'static str; 1],
    /// The bucket-cut schedule the tile grid follows.
    ///
    /// The generation's own corpus schedule, identical for every caller.
    pub bucket_schedule: BucketSchedule,
    /// The caller's resolved delivery schedule.
    ///
    /// The delivery-cut offset the accompanying authority token seals, with the cut rule it
    /// yields. Restricted responses deliver scope-cascade buckets at or below `z + span + k`, so
    /// this block is the decoder's input for attributing runs to buckets; it varies per caller and
    /// per session, which is one of the reasons the manifest response is `no-store`.
    pub scope_schedule: ScopeCutSchedule,
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
pub(crate) struct BucketSchedule {
    /// Cells per tile axis of the delivery cut: `2^span`.
    pub span: u32,
    /// The rule by which zoom `z` delivers buckets at or below `z + span`.
    #[schemars(with = "String")]
    pub cut: BucketCut,
    /// The deepest tile zoom the schedule serves.
    pub max_zoom: u8,
}

/// The manifest's `scopeSchedule` block: one caller's resolved delivery schedule.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
#[derive(Debug, Copy, Clone, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScopeCutSchedule {
    /// The resolved delivery-cut offset the authority token seals.
    pub k: u8,
    /// The rule by which zoom `z` delivers scope buckets at or below `z + span + k`.
    #[schemars(with = "String")]
    pub cut: BucketCut,
    /// The deepest zoom at which this scope's schedule still delivers new points.
    ///
    /// The resolved view's deepest occupied bucket, carried through the cut rule and clamped to
    /// the grid: past this zoom every tile repeats content the caller has already accumulated.
    /// The value describes the fitted view at resolution. Post-fit arrivals can deepen the live
    /// answer inside the feed's freshness bound, and the root tile's `minResolution` stays the
    /// authority a session reads mid-flight.
    pub max_zoom: u8,
}

/// The cut rule of the manifest's `bucketSchedule.cut` key.
///
/// Zoom `z`'s cumulative schedule delivers buckets at or below `z + span`, and the wire form is
/// that formula: the string `z+<span>`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BucketCut {
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
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    ///
    /// `deepest_occupied` is the resolved view's deepest occupied bucket - the scope cascade's
    /// for a restricted caller, the corpus census's for an operator - and zero for an empty
    /// view. `scopeSchedule.maxZoom` derives from it through the cut rule.
    pub(crate) fn manifest(
        &self,
        limits: ManifestLimits,
        k: CutOffset,
        deepest_occupied: u64,
    ) -> Manifest {
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
            scope_schedule: ScopeCutSchedule {
                k: k.get(),
                cut: BucketCut {
                    span_log2: self.grid.span_log2() + k.get(),
                },
                // Bucket `b` first enters at zoom `b - span - k`, and the deepest served tile
                // bounds the answer: binding proves the catch-all inverts to `max_tile_depth`.
                max_zoom: u8::try_from(
                    deepest_occupied
                        .saturating_sub(u64::from(self.grid.span_log2()) + u64::from(k.get()))
                        .min(u64::from(self.grid.max_tile_depth())),
                )
                .expect("the minimum against a `u8` bound fits `u8`"),
            },
            limits,
            created_at,
        }
    }
}
