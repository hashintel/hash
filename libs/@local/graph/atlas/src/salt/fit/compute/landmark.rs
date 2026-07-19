//! The landmark skeleton and baseline placement stages.

use std::io::{self, BufWriter, Write as _};

use zerocopy::IntoBytes as _;

use super::{
    super::{
        Stage,
        error::{PriorError, StageError},
        prepare::identity::MappedIdentityTable,
        role::{Role, digest_file, write_staged},
        stage_rng,
    },
    Context,
};
use crate::{
    bitset::BitSet,
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayVariant, ArrayWriter, Dim},
        generation::Generation,
        identity::read::IdentityFile,
        landmark::read::LandmarkFile,
        repository::RepositoryFile,
        salt::metadata::LandmarkEvidence,
    },
    math::AlignedVecN,
    salt::{
        knn::hannoy::HannoyIndex,
        landmark::{
            artifact::{LandmarkSkeleton, MappedLandmarkSkeleton},
            assignment::assign_landmarks,
            layout::layout_landmarks,
            quotient::quotient_graph,
            select::{LandmarkCandidate, SamplingWeight, SubgroupAxes, select_landmarks},
        },
        semantic::artifact::MappedSemanticGraph,
    },
};

impl Context<'_> {
    /// Marks the current rows whose nodes were landmarks of the prior
    /// generation.
    ///
    /// The prior skeleton's rows translate through the prior identity
    /// table to source ids and through the staged current table back
    /// to rows; nodes that left the corpus since the prior generation
    /// simply mark nothing.
    pub(super) fn prior_landmark_marks<I>(&self, prior: &Generation) -> Result<BitSet, StageError>
    where
        I: Copy
            + zerocopy::IntoBytes
            + zerocopy::FromBytes
            + zerocopy::Immutable
            + zerocopy::Unaligned
            + zerocopy::KnownLayout,
    {
        let _span = tracing::info_span!("prior-marks").entered();

        let files = &prior.repository().files;
        let skeleton = MappedLandmarkSkeleton::new(
            LandmarkFile::open(prior.path_of(&files.landmarks.name))
                .map_err(PriorError::MapLandmarks)?,
        )
        .map_err(PriorError::InvalidLandmarks)?;
        let prior_ids = MappedIdentityTable::<I>::new(
            IdentityFile::open(prior.path_of(&files.node_identities.name))
                .map_err(PriorError::MapIdentities)?,
        )
        .map_err(PriorError::InvalidIdentities)?;

        let current = MappedIdentityTable::<I>::new(IdentityFile::open(
            self.staging.path_of(&Role::NodeIdentities.file_name()),
        )?)?;

        let mut marks =
            BitSet::new(usize::try_from(current.len()).expect("rows fit the address space"));
        for &row in skeleton.selected_rows() {
            let id = prior_ids
                .id(row.get())
                .ok_or_else(|| PriorError::SkeletonBeyondIdentities { row: row.get() })?;
            if let Some(current_row) = current.row_of(id) {
                marks.insert(usize::try_from(current_row).expect("rows fit the address space"));
            }
        }
        tracing::info!(
            prior_landmarks = marks.count(),
            "translated the prior landmarks onto the current corpus"
        );

        Ok(marks)
    }

    /// Selects, assigns, contracts, and lays out the landmark skeleton,
    /// staging it as one combined file.
    ///
    /// Candidates are uniform over the corpus; `prior_marks` names the
    /// rows competing for the retained share.
    // TODO: candidates take stratification axes and subgroup minimums
    //       once a stage computes them.
    pub(super) fn build_landmark_skeleton(
        &self,
        rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        semantic: &MappedSemanticGraph,
        prior_marks: Option<&BitSet>,
    ) -> Result<(RepositoryFile, LandmarkEvidence), StageError> {
        let _span = tracing::info_span!("landmarks").entered();

        let selection = {
            let _span = tracing::info_span!("landmark-selection").entered();
            let candidates: Vec<LandmarkCandidate> = (0..rows.len())
                .map(|row| LandmarkCandidate {
                    row: NodeRowId::new(row as u64),
                    sampling_weight: SamplingWeight::UNIFORM,
                    axes: SubgroupAxes::default(),
                    prior_landmark: prior_marks.is_some_and(|marks| marks.contains(row)),
                })
                .collect();
            select_landmarks(
                &candidates,
                &[],
                self.config.selection,
                stage_rng(self.config.seed, Stage::LandmarkSelection),
            )?
        };

        #[expect(
            clippy::cast_possible_truncation,
            reason = "the selection count is bounded by the u32 landmark capacity"
        )]
        let evidence = LandmarkEvidence {
            selected: selection.len() as u32,
            retained: selection.retained_count() as u32,
            layout_epochs: self.config.layout.epochs,
        };

        let assignment = {
            let _span = tracing::info_span!("landmark-assignment").entered();
            let mut index =
                HannoyIndex::new(self.scratch.directory("assignment")?, self.config.index)?;
            assign_landmarks(
                &mut index,
                stage_rng(self.config.seed, Stage::LandmarkAssignment),
                rows,
                &selection,
            )?
        };

        let quotient = tracing::info_span!("quotient")
            .in_scope(|| quotient_graph(&semantic.view(), &assignment, self.config.quotient))?;
        let coordinates = tracing::info_span!("landmark-layout").in_scope(|| {
            layout_landmarks(
                &quotient.view(),
                self.config.curve,
                self.config.layout,
                stage_rng(self.config.seed, Stage::LandmarkLayout),
            )
        })?;
        drop(quotient);

        let skeleton = LandmarkSkeleton::new(selection, assignment, coordinates);
        let file = write_staged(self.staging, Role::Landmarks, |writer| {
            skeleton.write_into(writer)
        })?;

        Ok((file, evidence))
    }

    /// Stages the baseline coordinates: every row's assigned landmark
    /// coordinate as one `f32[N, 2]` array file.
    ///
    /// The digest streams over the finished file for the same
    /// header-sealing reason as the representations'.
    pub(super) fn stage_baseline_coordinates(
        &self,
        skeleton: &MappedLandmarkSkeleton,
    ) -> Result<RepositoryFile, StageError> {
        let _span = tracing::info_span!("coordinates").entered();

        {
            let mut writer = BufWriter::new(self.staging.create(&Role::Coordinates.file_name())?);
            place_at_landmarks(skeleton, &mut writer)?;
            writer.flush()?;
        }

        let digest = digest_file(self.staging.path_of(&Role::Coordinates.file_name()))?;
        Ok(Role::Coordinates.file(digest))
    }
}

/// Streams every row's assigned landmark coordinate into one `f32[N, 2]`
/// array file.
fn place_at_landmarks(
    skeleton: &MappedLandmarkSkeleton,
    writer: impl io::Write + io::Seek,
) -> io::Result<()> {
    let coordinates = skeleton.coordinates();

    let mut writer = ArrayWriter::new(writer, ArrayVariant::F32, &[Dim::new(2)])?;
    for ordinal in skeleton.assignment() {
        writer.write_row(coordinates[ordinal.usize()].as_bytes())?;
    }
    writer.finish()?;

    Ok(())
}
