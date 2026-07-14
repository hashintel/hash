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

mod error;
mod merge_tree;
mod raster;

pub(crate) use self::{
    error::AnalyticError,
    merge_tree::{MergeTree, MergeTreeConfig, PersistenceLeaf, merge_tree},
    raster::{AnalyticPoint, DensityRaster, RasterConfig, density_raster},
};

#[cfg(test)]
mod tests;
