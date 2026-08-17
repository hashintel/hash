//! The mapped artifacts and staging products one placement binds.

use hashql_core::id::IdSlice;

use super::super::quotient::{DistinctRowId, RowQuotient};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        repository::RepositoryFile,
        salt::metadata::{Placement, ProjectorEvidence, Reproducibility, Snapshot},
    },
    identity::{EdgeRowId, NodeRowId},
    math::AlignedVecN,
    salt::{
        knn::{artifact::KnnArchive, table::KnnView},
        landmark::artifact::LandmarkSkeletonArchive,
        projector::verdict::ResolvedVerdict,
        relation::{RelationIndexes, attraction::AttractionIndex},
        semantic::artifact::SemanticGraphArchive,
    },
};

/// The mapped artifacts one placement consumes, bound once per fit.
pub(in crate::salt::fit::compute) struct PlacementInputs<'fit> {
    /// The mapped representation matrix, one aligned row per corpus node.
    ///
    /// These rows are the publication domain that ladder frames and the canonical coordinate
    /// column cover.
    pub rows: &'fit IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The staged landmark skeleton, over the corpus row domain.
    pub skeleton: &'fit LandmarkSkeletonArchive,
    /// The supplied verdicts, resolved into the corpus row domain.
    pub resolution: &'fit VerdictResolution,
    /// The metadata document's `snapshot` section, the value the seal serializes.
    ///
    /// With [`Self::reproducibility`] it forms the paired-movement salt preimage, so the
    /// readout's draw replays from the published document's input sections alone.
    pub snapshot: &'fit Snapshot,
    /// The metadata document's `reproducibility` section, the value the seal serializes.
    pub reproducibility: &'fit Reproducibility,
    /// The distinct-row training domain.
    pub distinct: DistinctInputs<'fit>,
}

/// The trainer's distinct-row view of the corpus.
///
/// Training and the ladder's loss measurements run over the quotient and the artifacts built on it,
/// where byte-identical rows are one point. Publication evaluates the full corpus, and identical
/// representations project identically, so the two domains describe one field.
pub(in crate::salt::fit::compute) struct DistinctInputs<'fit> {
    /// The distinct representation rows, first occurrences in corpus order.
    pub rows: &'fit IdSlice<DistinctRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The corpus-to-distinct row quotient.
    pub quotient: &'fit RowQuotient,
    /// The distinct-domain neighbour table.
    pub knn: &'fit KnnArchive<DistinctRowId>,
    /// The distinct-domain semantic graph.
    pub semantic: &'fit SemanticGraphArchive<DistinctRowId>,
    /// The distinct-domain relation indexes.
    pub indexes: &'fit RelationIndexes<DistinctRowId, EdgeRowId>,
}

/// The training-domain views the publish half reads.
///
/// The quotient, the neighbour table, and the attraction index carry the ladder's per-rung loss
/// measurements over the distinct rows, and the unresolved-verdict count echoes into the
/// placement's evidence. The metadata document's input sections ride beside them as the
/// paired-movement salt preimage.
pub(in crate::salt::fit::compute) struct PublishInputs<'fit> {
    /// The corpus-to-distinct row quotient.
    pub quotient: &'fit RowQuotient,
    /// The distinct-domain neighbour table.
    pub knn: KnnView<'fit, DistinctRowId>,
    /// The distinct-domain attraction index.
    pub attraction: &'fit AttractionIndex<DistinctRowId, EdgeRowId>,
    /// Verdicts naming no row of this corpus.
    pub unresolved_verdicts: usize,
    /// The metadata document's `snapshot` section, the value the seal serializes.
    ///
    /// With [`Self::reproducibility`] it forms the paired-movement salt preimage, so the
    /// readout's draw replays from the published document's input sections alone.
    pub snapshot: &'fit Snapshot,
    /// The metadata document's `reproducibility` section, the value the seal serializes.
    pub reproducibility: &'fit Reproducibility,
}

/// The supplied verdicts resolved into the corpus row domain.
#[derive(Debug, Default)]
pub(in crate::salt::fit) struct VerdictResolution {
    /// Verdicts naming a type table row, ascending by row.
    pub resolved: Vec<ResolvedVerdict>,
    /// Verdicts naming no row of this corpus.
    pub unresolved: usize,
}

/// What the placement stage hands the assembly.
pub(in crate::salt::fit::compute) struct PlacementArtifacts {
    /// The staged canonical coordinate column.
    pub coordinates: RepositoryFile,
    /// The staged projector checkpoint.
    ///
    /// Present exactly for a trained placement.
    pub checkpoint: Option<RepositoryFile>,
    /// Which placement ran.
    pub placement: Placement,
    /// The training and ladder measurements of a trained placement.
    pub evidence: Option<ProjectorEvidence>,
}
