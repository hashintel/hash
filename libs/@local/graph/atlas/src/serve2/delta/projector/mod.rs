use core::{error::Error, fmt, num::NonZero};
use std::fs::File;

use error_stack::{Report, ResultExt as _};
use hashql_core::id::{Id as _, IdSlice, IdVec};

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::{self, PhysicalDevice},
    file::{generation::Generation, salt::metadata::ProjectorEvidence},
    identity::NodeRowId,
    math::{
        AlignedVecN, Bounds2, DNonNegative, DPositive, DVec2, FinitePointField, MatrixN,
        NonNegative, Similarity, Vec2, d_positive,
    },
    salt::{
        file::{PointFile, VectorFile},
        fit::PlacementOptions,
        projector::{
            artifact,
            model::{NodeRole, Projector},
            train::{NodeColumns, refresh},
        },
    },
};

#[cfg(test)]
mod tests;

// The placement tests use the same small projector fixture.
#[cfg(test)]
pub(super) use tests::projector;

/// A finite position in the fitted world's coordinate frame.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Position(Vec2);

impl Position {
    fn new(point: Vec2) -> Option<Self> {
        point.is_finite().then_some(Self(point))
    }

    pub(crate) const fn get(self) -> Vec2 {
        self.0
    }
}

hashql_core::id::newtype! {
    /// A row in one complete projection request.
    #[id(const)]
    pub(crate) struct ForwardIndex(u32)
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProjectionError {
    /// An aligned point lies outside the fitted world.
    OutOfBounds { global: Vec2 },
    /// The model produced a non-finite point.
    NonFiniteProjection,
    /// Alignment produced a non-finite point.
    NonFiniteAlignment,
}

impl fmt::Display for ProjectionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OutOfBounds { global } => write!(
                fmt,
                "projected point at ({}, {}) lies outside the fitted world",
                global.x(),
                global.y(),
            ),
            Self::NonFiniteProjection => fmt.write_str("the model produced a non-finite point"),
            Self::NonFiniteAlignment => fmt.write_str("alignment produced a non-finite point"),
        }
    }
}

impl Error for ProjectionError {}

#[derive(Debug)]
pub(crate) enum ProjectorError {
    /// A projector checkpoint accompanies a baseline placement configuration.
    UnexpectedBaselinePlacement,
    /// Opening the checkpoint file failed.
    CheckpointNotFound,
    /// Decoding the checkpoint for the configured architecture failed.
    InvalidCheckpoint,
    /// Opening the representation column with the projector's width failed.
    CannotLoadRepresentations,
    /// Opening the coordinate column as points failed.
    CannotLoadCoordinates,
    /// The columns are empty or have different row counts.
    InvalidSampleCorpus {
        representations: usize,
        coordinates: usize,
    },
    /// A sampled published coordinate is non-finite.
    NonFiniteCoordinates { row: NodeRowId },
    /// Projecting the fitted sample failed.
    RoundtripSampleForward,
    /// The maximum component error meets or exceeds the roundtrip tolerance.
    RoundtripSampleToleranceExceeded {
        tolerance: DPositive,
        error: DNonNegative,
    },
}

impl fmt::Display for ProjectorError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnexpectedBaselinePlacement => fmt
                .write_str("a projector checkpoint accompanies a baseline placement configuration"),
            Self::CheckpointNotFound => fmt.write_str("opening the projector checkpoint failed"),
            Self::InvalidCheckpoint => fmt.write_str(
                "the projector checkpoint does not decode for the configured architecture",
            ),
            Self::CannotLoadRepresentations => {
                fmt.write_str("the representation column does not open with the projector's width")
            }
            Self::CannotLoadCoordinates => {
                fmt.write_str("the coordinate column does not open as points")
            }
            Self::InvalidSampleCorpus {
                representations,
                coordinates,
            } => write!(
                fmt,
                "roundtrip columns have {representations} representation rows and {coordinates} \
                 coordinate rows"
            ),
            Self::NonFiniteCoordinates { row } => {
                write!(fmt, "the published coordinate at row {row} is non-finite")
            }
            Self::RoundtripSampleForward => fmt.write_str("projecting the fitted sample failed"),
            Self::RoundtripSampleToleranceExceeded { tolerance, error } => write!(
                fmt,
                "roundtrip error {error} meets or exceeds tolerance {tolerance}"
            ),
        }
    }
}

impl Error for ProjectorError {}

struct ProjectorScratch {
    forward: IdVec<ForwardIndex, Vec2>,
    inputs: MatrixN<PROJECTOR_DIMENSIONS>,
    roles: Vec<NodeRole>,
}

impl ProjectorScratch {
    const CHUNK_SIZE: usize = 256;

    fn new() -> Self {
        Self {
            forward: IdVec::with_capacity(Self::CHUNK_SIZE),
            inputs: MatrixN::zeroed(Self::CHUNK_SIZE),
            roles: vec![NodeRole::KnowledgeEntity; Self::CHUNK_SIZE],
        }
    }
}

pub(crate) struct DeltaProjector {
    model: Projector<device::Inference>,
    device: PhysicalDevice,
    condition: NonNegative,
    alignment: Option<Similarity>,
    world: Bounds2,
    forward_rows: NonZero<usize>,

    scratch: ProjectorScratch,
}

impl DeltaProjector {
    /// Reopens the projector and checks a sample of its fitted coordinates.
    ///
    /// Returns `Ok(None)` when the generation has no projector checkpoint.
    ///
    /// # Errors
    ///
    /// Returns [`ProjectorError`] if the checkpoint conflicts with the placement configuration,
    /// opening or decoding a file fails, or the roundtrip sample fails validation.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(
        generation: &Generation,
        device: PhysicalDevice,
    ) -> Result<Option<Self>, Report<ProjectorError>> {
        let repository = generation.repository();
        let metadata = &repository.metadata;

        let Some(checkpoint) = &repository.files.projector else {
            tracing::info!(
                "the generation placed rows by landmark baseline, arrivals stage until a refit"
            );

            return Ok(None);
        };

        let PlacementOptions::Projector(options) = &metadata.reproducibility.config.placement
        else {
            tracing::warn!(
                "the generation stages a projector checkpoint while its configuration echo \
                 records a baseline placement"
            );

            return Err(Report::new(ProjectorError::UnexpectedBaselinePlacement));
        };

        let (condition, alignment) = match &metadata.evidence.projector {
            None => {
                tracing::warn!(
                    "no projector evidence available, assuming zero condition placement"
                );
                (NonNegative::ZERO, None)
            }
            Some(ProjectorEvidence {
                ladder: Some(ladder),
                ..
            }) if let Some(step) = ladder.steps.get(ladder.canonical_index) => {
                (ladder.canonical, Some(step.alignment))
            }
            Some(ProjectorEvidence {
                ladder: Some(ladder),
                ..
            }) => {
                tracing::warn!(
                    canonical_index = ladder.canonical_index,
                    steps = ladder.steps.len(),
                    "projector evidence published a canonical out of bounds index"
                );
                (NonNegative::ZERO, None)
            }
            Some(ProjectorEvidence { ladder: None, .. }) => {
                tracing::warn!(
                    "projector evidence available but no ladder, assuming zero condition placement"
                );
                (NonNegative::ZERO, None)
            }
        };

        let checkpoint = File::open(generation.path_of(&checkpoint.name()))
            .change_context(ProjectorError::CheckpointNotFound)?;
        let model = artifact::open_model(checkpoint, options.architecture, &device)
            .change_context(ProjectorError::InvalidCheckpoint)?;

        let mut this = Self {
            model,
            device,
            condition,
            alignment,
            world: metadata.evidence.lod.world,
            forward_rows: options.forward_rows,
            scratch: ProjectorScratch::new(),
        };

        this.try_roundtrip_sample(generation)?;

        Ok(Some(this))
    }

    /// Replays a sample from the fitted representation and coordinate columns.
    ///
    /// # Errors
    ///
    /// Returns [`ProjectorError`] for artifact opening or sampled projection failures.
    fn try_roundtrip_sample(
        &mut self,
        generation: &Generation,
    ) -> Result<(), Report<ProjectorError>> {
        let files = &generation.repository().files;

        let representations = VectorFile::open(generation.path_of(&files.representations.name()))
            .change_context(ProjectorError::CannotLoadRepresentations)?;
        let coordinates = PointFile::open(generation.path_of(&files.coordinates.name()))
            .change_context(ProjectorError::CannotLoadCoordinates)?;

        self.try_roundtrip_sample_impl(&representations, &coordinates)
    }

    /// Checks up to 1,024 regularly spaced fitted rows against their published coordinates.
    ///
    /// # Errors
    ///
    /// Returns [`ProjectorError`] for empty or unequal columns, non-finite sampled coordinates,
    /// a failed projection, or a maximum component error at or above the roundtrip tolerance.
    #[tracing::instrument(
        skip_all,
        fields(rows = representations.len(), samples = tracing::field::Empty),
    )]
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the floored stride spreads the sample across the fitted row domain"
    )]
    fn try_roundtrip_sample_impl(
        &mut self,
        representations: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        coordinates: &IdSlice<NodeRowId, Vec2>,
    ) -> Result<(), Report<ProjectorError>> {
        const SAMPLES: usize = 1024;
        const TOLERANCE: DPositive = d_positive!(1e-3);

        if representations.is_empty() || representations.len() != coordinates.len() {
            return Err(Report::new(ProjectorError::InvalidSampleCorpus {
                representations: representations.len(),
                coordinates: coordinates.len(),
            }));
        }

        let sample_size = SAMPLES.min(representations.len());
        tracing::Span::current().record("samples", sample_size);

        let sampled: IdVec<ForwardIndex, NodeRowId> = (0..sample_size)
            .map(|index| NodeRowId::from_usize(index * representations.len() / sample_size))
            .collect();
        let published: IdVec<ForwardIndex, Vec2> =
            sampled.iter().map(|&row| coordinates[row]).collect();
        let published = FinitePointField::new(&published).map_err(|error| {
            let row = sampled[error.id];
            Report::new(error).change_context(ProjectorError::NonFiniteCoordinates { row })
        })?;
        let sampled_rows = sampled.iter().map(|&row| &representations[row]);

        let aligned: Vec<_> = self
            .forward(sampled_rows)
            .try_collect()
            .change_context(ProjectorError::RoundtripSampleForward)?;

        let mut max_error = DNonNegative::ZERO;
        for (&published, &reprojected) in published.iter().zip(aligned.iter()) {
            let difference = DVec2::from(reprojected.0) - DVec2::from(published);
            // Differences of finite f32 coordinates remain finite after widening to f64.
            let error = DNonNegative::new_unchecked(difference.x().abs().max(difference.y().abs()));
            max_error = max_error.max(error);
        }

        if max_error < TOLERANCE {
            tracing::info!(%max_error, tolerance = %TOLERANCE, "Verify sampled projector coordinates");
            return Ok(());
        }

        Err(Report::new(
            ProjectorError::RoundtripSampleToleranceExceeded {
                tolerance: TOLERANCE,
                error: max_error,
            },
        ))
    }

    /// Projects rows into the fitted world in input order without clamping their coordinates.
    ///
    /// # Errors
    ///
    /// Each input has one result. A failed row leaves the other results intact.
    ///
    /// Returns [`ProjectionError`] for non-finite model or alignment output, or a position outside
    /// the fitted world.
    #[tracing::instrument(skip_all)]
    pub(crate) fn project(
        &mut self,
        rows: impl IntoIterator<
            Item: AsRef<AlignedVecN<PROJECTOR_DIMENSIONS>>,
            IntoIter: ExactSizeIterator,
        >,
    ) -> impl ExactSizeIterator<Item = Result<Position, ProjectionError>> {
        let world = self.world;

        self.forward(rows).map(move |result| {
            let position = result?;

            if !world.contains(position.get()) {
                return Err(ProjectionError::OutOfBounds { global: position.0 });
            }

            Ok(position)
        })
    }

    /// Projects and aligns rows without checking the fitted world bounds.
    ///
    /// # Errors
    ///
    /// Returns one result per input, with [`ProjectionError`] for each non-finite model or
    /// alignment output.
    fn forward(
        &mut self,
        rows: impl IntoIterator<
            Item: AsRef<AlignedVecN<PROJECTOR_DIMENSIONS>>,
            IntoIter: ExactSizeIterator,
        >,
    ) -> impl ExactSizeIterator<Item = Result<Position, ProjectionError>> {
        let mut rows = rows.into_iter();
        let mut results = Vec::with_capacity(rows.len());

        loop {
            let mut filled = 0_usize;

            for (slot, row) in self.scratch.inputs.rows_mut().iter_mut().zip(&mut rows) {
                slot.copy_from(row.as_ref());
                filled += 1;
            }

            if filled == 0 {
                break;
            }

            let columns: NodeColumns<'_, ForwardIndex> = NodeColumns {
                representations: IdSlice::from_raw(&self.scratch.inputs.rows()[..filled]),
                roles: IdSlice::from_raw(&self.scratch.roles[..filled]),
            };

            refresh::forward_unchecked_in(
                &self.model,
                columns,
                self.condition,
                self.forward_rows,
                &self.device,
                &mut self.scratch.forward,
            );

            results.extend(self.scratch.forward.drain(..).map(|point| {
                let position = Position::new(point).ok_or(ProjectionError::NonFiniteProjection)?;

                self.alignment.map_or(Ok(position), |alignment| {
                    Position::new(alignment.apply(position.get()))
                        .ok_or(ProjectionError::NonFiniteAlignment)
                })
            }));

            if filled < ProjectorScratch::CHUNK_SIZE {
                break;
            }
        }

        results.into_iter()
    }
}
