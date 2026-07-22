//! The landmark skeleton and baseline placement stages.
use std::io::{self, BufWriter};

use zerocopy::IntoBytes as _;

use super::{
    super::{
        Stage,
        error::{PriorError, StageError},
        prepare::identity::IdentityTableArchive,
        role::{Role, Staged, stage},
        stage_rng,
    },
    Context,
};
use crate::{
    bitset::BitSet,
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayVariant, Dim, SizedArrayWriter},
        generation::Generation,
        identity::read::IdentityFile,
        landmark::read::LandmarkFile,
        region::ByteStable,
        repository::RepositoryFile,
        salt::metadata::LandmarkEvidence,
    },
    integrity::Sha256Digest,
    math::AlignedVecN,
    salt::{
        knn::hannoy::HannoyIndex,
        landmark::{
            artifact::{LandmarkSkeleton, LandmarkSkeletonArchive},
            assignment::assign_landmarks,
            layout::layout_landmarks,
            quotient::quotient_graph,
            select::{LandmarkCandidate, SamplingWeight, SubgroupAxes, select_landmarks},
        },
        semantic::artifact::SemanticGraphArchive,
    },
};

impl Context<'_> {
    /// Marks the current rows whose nodes were landmarks of the prior generation.
    ///
    /// The prior skeleton's rows translate through the prior identity table to source ids and
    /// through the staged current table back to rows; nodes that left the corpus since the prior
    /// generation simply mark nothing.
    pub(super) fn prior_landmark_marks<I>(&self, prior: &Generation) -> Result<BitSet, StageError>
    where
        I: ByteStable,
    {
        let _span = tracing::info_span!("prior-marks").entered();

        let files = &prior.repository().files;
        let skeleton = LandmarkSkeletonArchive::new(
            LandmarkFile::open(prior.path_of(&files.landmarks.name))
                .map_err(PriorError::MapLandmarks)?,
        )
        .map_err(PriorError::InvalidLandmarks)?;
        let prior_ids = IdentityTableArchive::<I>::new(
            IdentityFile::open(prior.path_of(&files.node_identities.name))
                .map_err(PriorError::MapIdentities)?,
        )
        .map_err(PriorError::InvalidIdentities)?;

        let current = IdentityTableArchive::<I>::new(IdentityFile::open(
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

    /// Selects, assigns, contracts, and lays out the landmark skeleton.
    ///
    /// Stages it as one combined file and maps it back for the stages that consume it.
    ///
    /// Candidates are uniform over the corpus; `prior_marks` names the rows competing for the
    /// retained share.
    // TODO: candidates take stratification axes and subgroup minimums
    //       once a stage computes them.
    pub(super) fn build_landmark_skeleton(
        &self,
        rows: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        semantic: &SemanticGraphArchive,
        prior_marks: Option<&BitSet>,
    ) -> Result<Staged<LandmarkSkeletonArchive, LandmarkEvidence>, StageError> {
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
        let file = stage(self.staging, Role::Landmarks, &skeleton)?;

        let skeleton = LandmarkSkeletonArchive::new(LandmarkFile::open(
            self.staging.path_of(&Role::Landmarks.file_name()),
        )?)?;
        tracing::info!(selected = evidence.selected, "staged the landmark skeleton");

        Ok(Staged {
            file,
            artifact: skeleton,
            evidence,
        })
    }

    /// Stages the baseline coordinates.
    ///
    /// Every row's assigned landmark coordinate as one `f32[N, 2]` array file.
    pub(super) fn stage_baseline_coordinates(
        &self,
        skeleton: &LandmarkSkeletonArchive,
    ) -> Result<RepositoryFile, StageError> {
        let _span = tracing::info_span!("coordinates").entered();

        let writer = BufWriter::new(self.staging.create(&Role::Coordinates.file_name())?);
        let digest = place_at_landmarks(skeleton, writer)?;

        Ok(Role::Coordinates.file(digest))
    }
}

/// Streams every row's assigned landmark coordinate into one `f32[N, 2]` array file.
///
/// Returns the sealed file's digest.
fn place_at_landmarks(
    skeleton: &LandmarkSkeletonArchive,
    writer: impl io::Write,
) -> io::Result<Sha256Digest> {
    let coordinates = skeleton.coordinates();

    let mut writer = SizedArrayWriter::new(
        writer,
        ArrayVariant::F32,
        &[Dim::new(skeleton.assignment().len() as u64), Dim::new(2)],
    )?;
    for ordinal in skeleton.assignment() {
        writer.write_row(coordinates[ordinal.usize()].as_bytes())?;
    }
    writer.finish()
}
