//! The borrowed inputs of one training run.
//!
//! One generation's artifacts arrive as views rather than owned copies, and one struct gathers
//! them so every borrow shares a single lifetime and a single row-domain contract.

use super::objective::TargetInputs;
use crate::salt::{
    knn::table::KnnView,
    projector::{
        train::batch::{NodeColumns, SupportAnchor},
        verdict::ResolvedVerdict,
    },
    relation::{
        attraction::AttractionIndex,
        protection::{ProtectionConfig, ProtectionView},
    },
    semantic::SemanticGraphView,
};

/// One generation's borrowed training inputs.
///
/// Every view describes the same corpus rows. The run asserts the row domains agree and treats a
/// mismatch as a wiring defect.
#[derive(Debug, Clone)]
pub(crate) struct TrainerInputs<'run, N, E> {
    /// The semantic graph.
    pub semantic: SemanticGraphView<'run, N>,
    /// The protection evidence.
    pub protection: ProtectionView<'run, N>,
    /// The protection channel thresholds.
    pub protection_config: ProtectionConfig,
    /// The relation attraction evidence.
    pub attraction: &'run AttractionIndex<N, E>,
    /// The 512-dimensional neighbour table local scales measure over.
    pub knn: KnnView<'run, N>,
    /// The per-row model input columns.
    pub columns: NodeColumns<'run, N>,
    /// The landmark skeleton's support anchors, corpus rows.
    pub landmarks: &'run [SupportAnchor<N>],
    /// The temporal support anchors as corpus rows, empty for a first generation.
    pub anchors: &'run [SupportAnchor<N>],
    /// The resolved reviewed verdicts.
    pub verdicts: &'run [ResolvedVerdict],
    /// The target objective's whole configuration, absent on a released-configuration run.
    ///
    /// The declared constants and the borrowed draws travel as one value, so a lone half is
    /// unrepresentable. The reference replicate is a present configuration at zero activation,
    /// never an absent one.
    pub target: Option<TargetInputs<'run, N>>,
}
