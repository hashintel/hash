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

/// Marks the current rows whose nodes were landmarks of the prior generation.
///
/// The prior skeleton's rows translate through the prior identity table to source ids and
/// through the current table back to rows. Nodes that left the corpus since the prior
/// generation mark nothing.
///
/// # Errors
///
/// Returns [`ComputeError::Prior`] when a prior artifact does not map or the prior skeleton
/// names a row beyond the prior identity table.
#[tracing::instrument(name = "prior-marks", skip_all)]
pub(super) fn prior_marks<I>(
    prior: &Generation,
    current: &IdentityTableArchive<I, NodeRowId>,
) -> Result<DenseBitSet<NodeRowId>, ComputeError>
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

    let mut marks =
        DenseBitSet::new_empty(usize::try_from(current.len()).expect("rows fit the address space"));
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

    Ok(marks)
}

/// Selects, assigns, contracts, and lays out the landmark skeleton, and stages it.
///
/// Candidates are uniform over the distinct rows; `prior_marks` names the corpus rows
/// competing for the retained share. The skeleton builds over the distinct representation rows
/// and publishes over the corpus row domain: selected rows name their first corpus rows, and
/// every corpus row takes its representative's landmark. It returns owned beside its typed
/// binding, so the placement stage reads the value this call built rather than the staged bytes.
///
/// # Errors
///
/// Returns [`ComputeError::Selection`] when the landmark selection rejects its input,
/// [`ComputeError::Index`] when the assignment's search backend fails,
/// [`ComputeError::Quotient`] when the graph contraction rejects its input,
/// [`ComputeError::Layout`] when the layout rejects its input, and an I/O error when the
/// staged skeleton does not write.
#[tracing::instrument(name = "landmarks", skip_all)]
pub(super) fn skeleton(
    context: &Context,
    quotient: &Quotient<'_, PROJECTOR_DIMENSIONS>,
    semantic: &SemanticGraph<DistinctRowId>,
    prior_marks: Option<&DenseBitSet<NodeRowId>>,
) -> Result<Staged<LandmarkSkeleton<NodeRowId>, artifact::Landmarks, LandmarkEvidence>, ComputeError>
{
    let training = quotient.training();
    // The skeleton builds over distinct rows; the published failure surface speaks corpus
    // rows.
    let corpus = |row: DistinctRowId| quotient.representative(row);

    // A prior landmark translates as a representation: every copy
    // of its bytes marks the one distinct row they share.
    let prior_distinct = prior_marks.map(|marks| {
        let mut distinct_marks: DenseBitSet<DistinctRowId> =
            DenseBitSet::new_empty(quotient.distinct_len());
        for (row, &distinct) in quotient.classes().iter_enumerated() {
            if marks.contains(row) {
                distinct_marks.insert(distinct);
            }
        }
        distinct_marks
    });
    let prior_distinct = prior_distinct.as_ref();

    let selection = {
        let candidates: IdVec<CandidateId, LandmarkCandidate<DistinctRowId>> = (0..training.len())
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
            IdSlice::from_raw(&[]),
            context.config.selection,
            stage_rng(context.config.seed, Stage::LandmarkSelection),
        )?
    };

    #[expect(
        clippy::cast_possible_truncation,
        reason = "the selection count is bounded by the u32 landmark capacity"
    )]
    let evidence = LandmarkEvidence {
        selected: selection.len() as u32,
        retained: selection.retained_count() as u32,
        layout_epochs: context.config.layout.epochs,
    };

    let assignment = {
        let mut index = HannoyIndex::new(
            context.scratch.directory("assignment")?,
            context.config.index,
        )
        .map_err(HannoyIndexError::widen)?;
        assign_landmarks(
            &mut index,
            stage_rng(context.config.seed, Stage::LandmarkAssignment),
            training,
            &selection,
        )
        .map_err(|error| error.map_rows(corpus, |fault| fault.map_rows(corpus)))?
    };

    let contracted = quotient_graph(&semantic.view(), &assignment, context.config.quotient)?;
    let coordinates = layout_landmarks(
        &contracted.view(),
        context.config.curve,
        context.config.layout,
        stage_rng(context.config.seed, Stage::LandmarkLayout),
    )?;
    drop(contracted);

    // Publication crosses back to the corpus row domain; the
    // first-row map ascends strictly, so the selection's order and
    // the assignment's ordinal vocabulary carry over unchanged.
    let skeleton = LandmarkSkeleton::new(
        selection.map_rows(|row| quotient.representative(row)),
        assignment.reindex(quotient.classes().iter().copied()),
        coordinates,
    );
    let binding = context.staging.stage(artifact::Landmarks, &skeleton)?;
    tracing::info!(selected = evidence.selected, "staged the landmark skeleton");

    Ok(Staged {
        value: skeleton,
        binding,
        evidence,
    })
}
