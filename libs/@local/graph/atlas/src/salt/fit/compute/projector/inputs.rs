//! The values one placement binds, and the supplied-verdict resolution.

use camino::Utf8Path;

use super::super::{
    error::ComputeError,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    dataset::{OntologyIdentity, PROJECTOR_DIMENSIONS},
    file::{
        generation::StagedGeneration,
        identity::{Key, read::IdentityFile},
        repository::Binding,
        salt::{
            artifact,
            metadata::{Reproducibility, Snapshot},
        },
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    salt::{
        fit::{SuppliedVerdicts, prepare::identity::IdentityTableArchive},
        knn::table::{Knn, KnnView},
        landmark::artifact::LandmarkSkeleton,
        projector::verdict::ResolvedVerdict,
        relation::{RelationIndexes, attraction::AttractionIndex},
        semantic::SemanticGraph,
    },
};

/// The values one placement consumes, bound once per fit.
pub(crate) struct PlacementInputs<'fit> {
    /// The landmark skeleton, over the corpus row domain.
    pub skeleton: &'fit LandmarkSkeleton<NodeRowId>,
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
/// Training and the ladder's loss measurements run over the quotient and the values built on it,
/// where byte-identical rows are one point. Publication evaluates the full corpus, and identical
/// representations project identically, so the two domains describe one field.
pub(crate) struct DistinctInputs<'fit> {
    /// The corpus-to-distinct row quotient, carrying both row domains' matrices.
    pub quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
    /// The distinct-domain neighbour table.
    pub knn: &'fit Knn<DistinctRowId>,
    /// The distinct-domain semantic graph.
    pub semantic: &'fit SemanticGraph<DistinctRowId>,
    /// The distinct-domain relation indexes.
    pub indexes: &'fit RelationIndexes<DistinctRowId, EdgeRowId>,
}

/// The training-domain views the publish half reads.
///
/// The quotient, the neighbour table, and the attraction index carry the ladder's per-level loss
/// measurements over the distinct rows. The metadata document's input sections ride beside them
/// as the paired-movement salt preimage.
pub(crate) struct PublishInputs<'fit> {
    /// The corpus-to-distinct row quotient.
    pub quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
    /// The distinct-domain neighbour table.
    pub knn: KnnView<'fit, DistinctRowId>,
    /// The distinct-domain attraction index.
    pub attraction: &'fit AttractionIndex<DistinctRowId, EdgeRowId>,
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
pub(crate) struct VerdictResolution {
    /// Verdicts naming a type table row, ascending by row.
    pub resolved: Vec<ResolvedVerdict>,
    /// Verdicts naming no row of this corpus.
    pub unresolved: usize,
}

impl VerdictResolution {
    /// Resolves the supplied verdicts against the staged ontology identity column.
    ///
    /// Typed by the dataset's own ontology id, and addressed by the binding the ingest minted
    /// for the column, so the resolution reads exactly the staged entry the seal publishes. A
    /// run without supplied verdicts resolves to the empty resolution.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the staged identity column does not open, and the open's
    /// admission error when the column is not keyed by `O`.
    pub(crate) fn resolve<O>(
        staging: &StagedGeneration,
        identities: &Binding<artifact::OntologyIdentities>,
        verdicts: Option<&SuppliedVerdicts>,
    ) -> Result<Self, ComputeError>
    where
        O: Key + OntologyIdentity + Eq + core::hash::Hash,
    {
        let Some(supplied) = verdicts else {
            return Ok(Self::default());
        };

        Self::resolve_at::<O>(&staging.path_of(&identities.name()), supplied)
    }

    /// Resolves supplied verdicts against the ontology identity column at `path`.
    ///
    /// Read under the dataset's ontology id type `O`.
    ///
    /// Each verdict's reviewed versioned URL derives the id naming it in the corpus's own id
    /// space ([`OntologyIdentity`]). Verdicts whose identity derives no id there record as
    /// unresolved. A column file keyed by any other id type fails the open.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the identity column does not open, and the open's admission
    /// error when the column is not keyed by `O`.
    pub(crate) fn resolve_at<O>(
        path: &Utf8Path,
        supplied: &SuppliedVerdicts,
    ) -> Result<Self, ComputeError>
    where
        O: Key + OntologyIdentity + Eq + core::hash::Hash,
    {
        let table =
            IdentityTableArchive::<O, OntologyRowId>::new(IdentityFile::open(path.as_std_path())?)?;

        let resolution = supplied.document().resolve(table.ids());
        let unresolved = resolution.unresolved().len();
        tracing::info!(
            resolved = resolution.resolved().len(),
            unresolved,
            "resolved the supplied verdicts"
        );

        Ok(Self {
            resolved: resolution.into_resolved(),
            unresolved,
        })
    }
}
