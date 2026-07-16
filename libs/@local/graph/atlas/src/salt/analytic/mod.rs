//! Analytic density fields and superlevel-set persistence.
//!
//! Coordinates are histogrammed over their own extent, then convolved with a
//! reflected-boundary Gaussian kernel. The merge-tree sweep activates pixels
//! from high to low density and tracks connected superlevel components with
//! eight-neighbor connectivity. A leaf born at density `B` and merged at
//! density `D` has persistence `B - D`.
//!
//! Extent-relative rasterization makes uniform scale contraction neutral to
//! occupancy. Persistence is normalized by maximum density for comparisons
//! across fields. These metrics depend only on the coordinate multiset, so
//! release decisions pair them with identity-aware neighborhood metrics.
//!
//! # Density field
//!
//! Each point contributes a non-negative mass to a square histogram spanning
//! the coordinate field's own axis-aligned extent. Degenerate axes are widened
//! deterministically. A normalized one-dimensional Gaussian kernel truncated
//! at four bandwidths is then applied along each axis with reflected boundary
//! lookup. The configured bandwidth is measured in pixels, not coordinate
//! units.
//!
//! Rasterization parallelizes only independent output pixels. Histogram
//! insertion, kernel construction, coordinate binning, and all tie breaks
//! retain deterministic order.
//!
//! # Merge-tree topology
//!
//! Pixels activate by descending density and then ascending flat pixel index.
//! Eight-neighbor connected components follow the elder rule: the component
//! with greater birth density survives a merge, with lower stable component
//! identity breaking equal-density ties. A dying component is retained only
//! when
//!
//! ```text
//! birth - death >= persistence_fraction * birth
//! ```
//!
//! Surviving components die at the configured density floor. Each retained
//! leaf records a stable identity, representative peak pixel, birth/death
//! values, and nearest retained ancestor. Persisting parentage is what lets
//! readers reconstruct region hierarchy rather than receiving an unordered
//! list of peaks.
//!
//! # Regions and labels
//!
//! The watershed follows steepest eight-neighbor ascent above its density
//! floor. Equal-density plateaus flow toward the lower flat pixel index, making
//! ascent acyclic and traversal-order independent. Persistent leaves above the
//! peak threshold become regions up to the configured bound; other maxima fold
//! into their nearest retained peak.
//!
//! Region labels come from actual generation rows. One candidate is selected
//! per occupied region by semantic importance, then regions are presented by
//! normalized persistence plus that importance. An unnamed region remains
//! unnamed; no synthetic label is fabricated.

mod allocation;
mod artifact;
mod error;
mod label;
mod merge_tree;
mod raster;
mod reference;
mod region;

#[allow(
    unused_imports,
    reason = "analytic views and diagnostics form the generation adapter surface"
)]
pub(crate) use self::{
    artifact::publish_analytic_artifact,
    error::AnalyticError,
    label::{RegionLabelCandidate, select_region_labels},
    merge_tree::{MergeTree, MergeTreeConfig, PersistenceLeaf, merge_tree},
    raster::{AnalyticPoint, DensityRaster, RasterConfig, density_raster},
    reference::publish_persistence_reference,
    region::{RegionConfig, density_regions},
};

#[cfg(test)]
mod tests;
