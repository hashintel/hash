//! The landmark stage selects, assigns, contracts, and lays out the skeleton.

use hashql_core::id::{Id as _, IdSlice, IdVec, bit_vec::DenseBitSet};

use super::{
    Context, Staged,
    error::ComputeError,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        generation::Generation,
        identity::{Key, read::IdentityFile},
        landmark::read::LandmarkFile,
        salt::{artifact, metadata::LandmarkEvidence},
    },
    identity::NodeRowId,
    math::DPositive,
    salt::{
        fit::{Stage, error::PriorError, prepare::identity::IdentityTableArchive, stage_rng},
        knn::hannoy::{HannoyIndex, HannoyIndexError},
        landmark::{
            artifact::{LandmarkSkeleton, LandmarkSkeletonArchive},
            assignment::assign_landmarks,
            layout::layout_landmarks,
            quotient::quotient_graph,
            select::{CandidateId, LandmarkCandidate, SubgroupAxes, select_landmarks},
        },
        semantic::SemanticGraph,
    },
};

/// The current corpus rows whose nodes were landmarks of the prior generation.
pub(super) struct PriorMarks {
    /// The marked rows, over the current corpus row domain.
    marks: DenseBitSet<NodeRowId>,
}

impl PriorMarks {
    /// Translates the prior generation's landmarks onto the current corpus.
    ///
    /// The prior skeleton's rows translate through the prior identity table to source ids and
    /// through the current table back to rows. Nodes that left the corpus since the prior
    /// generation mark nothing.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::Prior`] when a prior artifact does not map or the prior skeleton
    /// names a row beyond the prior identity table.
    #[tracing::instrument(skip_all)]
    pub(super) fn translated<I>(
        prior: &Generation,
        current: &IdentityTableArchive<I, NodeRowId>,
    ) -> Result<Self, ComputeError>
    where
        I: Key,
    {
        let files = &prior.repository().files;
        let skeleton = LandmarkSkeletonArchive::new(
            LandmarkFile::open(prior.path_of(&files.landmarks.name()))
                .map_err(PriorError::MapLandmarks)?,
        )
        .map_err(PriorError::InvalidLandmarks)?;

        let prior_ids = IdentityTableArchive::<I, NodeRowId>::new(
            IdentityFile::open(prior.path_of(&files.node_identities.name()))
                .map_err(PriorError::MapIdentities)?,
        )
        .map_err(PriorError::InvalidIdentities)?;

        let mut marks = DenseBitSet::new_empty(
            usize::try_from(current.len()).expect("rows fit the address space"),
        );
        for &row in skeleton.selected_rows() {
            let id = prior_ids
                .id(row)
                .ok_or_else(|| PriorError::SkeletonBeyondIdentities { row: row.as_u64() })?;

            if let Some(current_row) = current.row_of(id) {
                marks.insert(current_row);
            }
        }

        tracing::info!(
            prior_landmarks = marks.count(),
            "translated the prior landmarks onto the current corpus"
        );

        Ok(Self { marks })
    }

    /// Marks the distinct rows the prior landmarks share.
    ///
    /// A prior landmark translates as a representation: every copy of its bytes marks the one
    /// distinct row they share.
    fn distinct(
        &self,
        quotient: &Quotient<'_, PROJECTOR_DIMENSIONS>,
    ) -> DenseBitSet<DistinctRowId> {
        let mut distinct = DenseBitSet::new_empty(quotient.distinct_len());

        for (row, &class) in quotient.classes().iter_enumerated() {
            if self.marks.contains(row) {
                distinct.insert(class);
            }
        }

        distinct
    }
}

/// The landmark stage, bound to the values the skeleton builds from.
pub(super) struct LandmarkSurvey<'fit> {
    /// The stage's staging, scratch, configuration, and device.
    context: &'fit Context,
    /// The corpus-to-distinct row quotient.
    quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
    /// The distinct-domain semantic graph, the contraction's edge source.
    semantic: &'fit SemanticGraph<DistinctRowId>,
    /// The prior generation's landmarks on the current corpus, when the fit received a prior.
    prior: Option<&'fit PriorMarks>,
}

impl<'fit> LandmarkSurvey<'fit> {
    /// Binds the stage to the values the skeleton builds from.
    pub(super) const fn new(
        context: &'fit Context,
        quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
        semantic: &'fit SemanticGraph<DistinctRowId>,
        prior: Option<&'fit PriorMarks>,
    ) -> Self {
        Self {
            context,
            quotient,
            semantic,
            prior,
        }
    }

    /// Selects, assigns, contracts, and lays out the landmark skeleton, and stages it.
    ///
    /// Candidates are uniform over the distinct rows; the prior marks name the rows competing
    /// for the retained share. The skeleton builds over the distinct representation rows and
    /// publishes over the corpus row domain: selected rows name their first corpus rows, and
    /// every corpus row takes its representative's landmark. It returns owned beside its typed
    /// binding, so the placement stage reads the value this call built rather than the staged
    /// bytes.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::Selection`] when the landmark selection rejects its input,
    /// [`ComputeError::Index`] when the assignment's search backend fails,
    /// [`ComputeError::Quotient`] when the graph contraction rejects its input,
    /// [`ComputeError::Layout`] when the layout rejects its input, and an I/O error when the
    /// staged skeleton does not write.
    #[tracing::instrument(skip_all)]
    pub(super) fn run(
        self,
    ) -> Result<
        Staged<LandmarkSkeleton<NodeRowId>, artifact::Landmarks, LandmarkEvidence>,
        ComputeError,
    > {
        let training = self.quotient.training();
        // The skeleton builds over distinct rows; the published failure surface speaks corpus
        // rows.
        let corpus = |row: DistinctRowId| self.quotient.representative(row);

        let prior_distinct = self.prior.map(|marks| marks.distinct(self.quotient));
        let prior_distinct = prior_distinct.as_ref();

        let selection = {
            let candidates: IdVec<CandidateId, LandmarkCandidate<DistinctRowId>> = (0..training
                .len())
                .map(DistinctRowId::from_usize)
                .map(|row| LandmarkCandidate {
                    row,
                    sampling_weight: DPositive::ONE,
                    axes: SubgroupAxes::default(),
                    prior_landmark: prior_distinct.is_some_and(|marks| marks.contains(row)),
                })
                .collect();

            select_landmarks(
                &candidates,
                IdSlice::empty(),
                self.context.config.selection,
                stage_rng(self.context.config.seed, Stage::LandmarkSelection),
            )?
        };

        #[expect(
            clippy::cast_possible_truncation,
            reason = "the selection count is bounded by the u32 landmark capacity"
        )]
        let evidence = LandmarkEvidence {
            selected: selection.len() as u32,
            retained: selection.retained_count() as u32,
            layout_epochs: self.context.config.layout.epochs,
        };

        let assignment = {
            let mut index = HannoyIndex::new(
                self.context.scratch.directory("assignment")?,
                self.context.config.index,
            )
            .map_err(HannoyIndexError::widen)?;
            assign_landmarks(
                &mut index,
                stage_rng(self.context.config.seed, Stage::LandmarkAssignment),
                training,
                &selection,
            )
            .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?
        };

        let contracted = quotient_graph(
            &self.semantic.view(),
            &assignment,
            self.context.config.quotient,
        )?;
        let coordinates = layout_landmarks(
            &contracted.view(),
            self.context.config.curve,
            self.context.config.layout,
            stage_rng(self.context.config.seed, Stage::LandmarkLayout),
        )?;
        drop(contracted);

        // Publication crosses back to the corpus row domain; the
        // first-row map ascends strictly, so the selection's order and
        // the assignment's ordinal vocabulary carry over unchanged.
        let skeleton = LandmarkSkeleton::new(
            selection.map_rows(|row| self.quotient.representative(row)),
            assignment.reindex(self.quotient.classes().iter().copied()),
            coordinates,
        );
        let binding = self.context.staging.stage(artifact::Landmarks, &skeleton)?;
        tracing::info!(selected = evidence.selected, "staged the landmark skeleton");

        Ok(Staged {
            value: skeleton,
            binding,
            evidence,
        })
    }
}
