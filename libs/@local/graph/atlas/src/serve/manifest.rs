//! The manifest document: the immutable Surface v1 bootstrap, derived
//! from the generation's configuration alone.

use super::{
    Atlas, GenerationId, VARIANTS, edges::EDGES_TILES_CAP, tile::COLORED_TYPE_IDS_CAP,
    translate::TRANSLATE_ENTITY_IDS_CAP,
};
use crate::salt::wire::WIRE_VERSION;

/// The per-request caps of the manifest's `limits` block: transport
/// configuration published as data, so clients validate before
/// sending instead of learning caps from rejections.
///
/// The defaults publish the served surface honestly: the coloring
/// and edges caps carry their documented serving defaults, while
/// locate stays zero until its pass lands, so no request carrying it
/// is admitted.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLimits {
    /// Most `coloredTypeIds` entries one request may carry.
    pub colored_type_ids: u32,
    /// Most tiles one edges request may list.
    pub edges_tiles: u32,
    /// Largest neighbour budget one locate request may name.
    pub locate_neighbours: u32,
    /// Most entity ids one translate request may carry.
    pub translate_entity_ids: u32,
}

const impl Default for ManifestLimits {
    fn default() -> Self {
        Self {
            colored_type_ids: COLORED_TYPE_IDS_CAP,
            edges_tiles: EDGES_TILES_CAP,
            locate_neighbours: 0,
            translate_entity_ids: TRANSLATE_ENTITY_IDS_CAP,
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

impl Atlas {
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
}
