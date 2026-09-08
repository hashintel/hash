use core::{error::Error, fmt, num::NonZero};
use std::fs::File;

use error_stack::{Report, ReportSink, ResultExt as _};
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

hashql_core::id::newtype! {
    /// A row in one complete projection request.
    #[id(const)]
    pub(crate) struct ForwardIndex(u32)
}

pub(crate) struct Positioned<T> {
    pub value: T,
    pub position: Vec2,
}

#[derive(Debug)]
pub(crate) enum ProjectionError {
    /// An aligned point lies outside the fitted world.
    OutOfBounds { row: ForwardIndex, global: Vec2 },
    /// The model produced a non-finite point.
    NonFiniteProjection,
    /// Alignment produced a non-finite point.
    NonFiniteAlignment,
}

impl fmt::Display for ProjectionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OutOfBounds { row, global } => write!(
                fmt,
                "projected row {row} at ({}, {}) lies outside the fitted world",
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

pub(crate) struct ProjectorState {
    transformed: Box<[Vec2; PROJECTOR_DIMENSIONS]>,
    inputs: MatrixN<PROJECTOR_DIMENSIONS>,
    roles: Vec<NodeRole>,
}

impl ProjectorState {
    const CHUNK_SIZE: usize = 256;

    pub(crate) fn new() -> Self {
        Self {
            transformed: Box::new([Vec2::ZERO; PROJECTOR_DIMENSIONS]),
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

    state: ProjectorState,
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
            state: ProjectorState::new(),
        };

        this.try_roundtrip_sample(generation)?;

        Ok(Some(this))
    }

    /// Replays a sample from the fitted representation and coordinate columns.
    ///
    /// # Errors
    ///
    /// Returns [`ProjectorError`] if opening a column fails or [`Self::roundtrip_sample`] rejects
    /// it.
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

        let aligned = self
            .forward(sampled_rows)
            .change_context(ProjectorError::RoundtripSampleForward)?;

        let mut max_error = DNonNegative::ZERO;
        for (&published, &reprojected) in published.iter().zip(aligned.iter()) {
            let difference = DVec2::from(reprojected) - DVec2::from(published);
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
    /// Returns [`ProjectionError`] for non-finite model or alignment output. Once all chunks are
    /// finite, reports every point outside the fitted world. Any failure discards the result.
    #[tracing::instrument(skip_all)]
    pub(crate) fn project(
        &mut self,
        rows: impl IntoIterator<
            Item: AsRef<AlignedVecN<PROJECTOR_DIMENSIONS>>,
            IntoIter: ExactSizeIterator,
        >,
    ) -> Result<Box<FinitePointField<ForwardIndex>>, Report<[ProjectionError]>> {
        let aligned = self.forward(rows)?;
        let mut sink = ReportSink::new_armed();
        for (row, &global) in aligned.iter_enumerated() {
            if !self.world.contains(global) {
                sink.capture(ProjectionError::OutOfBounds { row, global });
            }
        }

        sink.finish_ok(aligned)
    }

    /// Projects and aligns rows without checking the fitted world bounds.
    ///
    /// # Errors
    ///
    /// Returns [`ProjectionError`] for the first non-finite point in each failed chunk, using
    /// request-wide row indices. Successful chunks never escape alongside a failed chunk.
    fn forward(
        &mut self,
        rows: impl IntoIterator<
            Item: AsRef<AlignedVecN<PROJECTOR_DIMENSIONS>>,
            IntoIter: ExactSizeIterator,
        >,
    ) -> Result<Box<FinitePointField<ForwardIndex>>, Report<[ProjectionError]>> {
        let mut rows = rows.into_iter();
        let mut aligned = FinitePointField::zeroed(rows.len());
        let mut sink = ReportSink::new_armed();

        let mut offset = 0;
        loop {
            let mut filled = 0_usize;

            for (slot, row) in self.state.inputs.rows_mut().iter_mut().zip(&mut rows) {
                slot.copy_from(row.as_ref());
                filled += 1;
            }

            if filled == 0 {
                break;
            }

            let columns: NodeColumns<'_, ForwardIndex> = NodeColumns {
                representations: IdSlice::from_raw(&self.state.inputs.rows()[..filled]),
                roles: IdSlice::from_raw(&self.state.roles[..filled]),
            };

            let frame = sink.attempt(
                refresh::forward(
                    &self.model,
                    columns,
                    self.condition,
                    self.forward_rows,
                    &self.device,
                )
                .map_err(|error| error.map_rows(|row| row.plus(offset)))
                .change_context(ProjectionError::NonFiniteProjection),
            );

            if let Some(frame) = frame {
                let points = self.alignment.map_or_else(
                    || frame.as_slice(),
                    |alignment| {
                        for (target, &point) in self.state.transformed.iter_mut().zip(frame.iter())
                        {
                            *target = alignment.apply(point);
                        }

                        IdSlice::from_raw(&self.state.transformed[..filled])
                    },
                );

                sink.attempt(
                    aligned
                        .copy_from(ForwardIndex::from_usize(offset), points)
                        .change_context(ProjectionError::NonFiniteAlignment),
                );
            }

            if filled < ProjectorState::CHUNK_SIZE {
                break;
            }

            offset += filled;
        }

        sink.finish_ok(aligned)
    }
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;

    use hashql_core::id::{Id as _, IdSlice};
    use rand::SeedableRng as _;
    use rand_xoshiro::Xoshiro256PlusPlus;

    use super::{DeltaProjector, ForwardIndex, ProjectionError, ProjectorError, ProjectorState};
    use crate::{
        dataset::PROJECTOR_DIMENSIONS,
        device::Device,
        identity::NodeRowId,
        math::{
            Bounds2, MatrixN, NonFinitePoint, NonNegative, Rotation, Similarity, Vec2, nz, positive,
        },
        salt::projector::{
            model::{Architecture, NodeRole, Projector},
            train::{
                NodeColumns,
                refresh::{self, RefreshError},
            },
        },
    };

    fn projector(alignment: Option<Similarity>) -> DeltaProjector {
        let device = Device::Cpu.pin(0).resolve();
        let architecture = Architecture {
            width: nz!(8),
            residual_blocks: nz!(1),
            representation_dimensions: nz!(PROJECTOR_DIMENSIONS),
            role_dimensions: nz!(4),
            condition_dimensions: nz!(1),
        };

        DeltaProjector {
            model: Projector::new(architecture, &device, Xoshiro256PlusPlus::seed_from_u64(7)),
            device,
            condition: NonNegative::ZERO,
            alignment,
            world: Bounds2::new(Vec2::splat(-100.0), Vec2::splat(100.0))
                .expect("should have ordered finite bounds"),
            forward_rows: NonZero::new(64).expect("should have a non-zero forward bound"),
            state: ProjectorState::new(),
        }
    }

    fn representations(count: usize) -> MatrixN<PROJECTOR_DIMENSIONS> {
        let mut inputs = MatrixN::zeroed(count);
        for (axis, row) in (0..PROJECTOR_DIMENSIONS).cycle().zip(inputs.rows_mut()) {
            row.as_array_mut()[axis] = 1.0;
        }
        inputs
    }

    #[test]
    fn forward_chunk_boundaries() {
        let inputs = representations(ProjectorState::CHUNK_SIZE * 2 + 1);
        let alignment = Similarity::new(
            positive!(2.0),
            Rotation::from_radians(0.5),
            Vec2::new(3.0, -4.0),
        )
        .expect("should have a valid similarity");
        let mut projector = projector(Some(alignment));
        let roles = vec![NodeRole::KnowledgeEntity; inputs.rows().len()];
        let columns: NodeColumns<'_, ForwardIndex> = NodeColumns {
            representations: IdSlice::from_raw(inputs.rows()),
            roles: IdSlice::from_raw(&roles),
        };
        let expected = refresh::forward(
            &projector.model,
            columns,
            projector.condition,
            projector.forward_rows,
            &projector.device,
        )
        .expect("should project the reference rows");
        let actual = projector
            .forward(inputs.rows())
            .expect("should project all chunks");
        assert_eq!(actual.len(), inputs.rows().len());
        for (&actual, &expected) in actual.iter().zip(expected.iter()) {
            let expected = alignment.apply(expected);
            assert!(actual.distance_squared_wide(expected) < 1e-10);
        }
    }

    #[test]
    fn forward_empty_and_reused() {
        let mut projector = projector(None);
        let inputs = representations(ProjectorState::CHUNK_SIZE + 1);
        let first = projector
            .forward(inputs.rows())
            .expect("should project the initial batch");
        let short = projector
            .forward(&inputs.rows()[..1])
            .expect("should project a short batch");
        assert_eq!(short.len(), 1);
        assert!(
            short[ForwardIndex::new(0)].distance_squared_wide(first[ForwardIndex::new(0)]) < 1e-10
        );
        let empty = projector
            .forward(&inputs.rows()[..0])
            .expect("should accept an empty batch");
        assert!(empty.is_empty());
    }

    #[test]
    fn forward_non_finite_chunks() {
        let mut projector = projector(None);
        let mut inputs = representations(ProjectorState::CHUNK_SIZE * 2 + 1);
        let offenders = [1, ProjectorState::CHUNK_SIZE + 3];
        for row in offenders {
            inputs.rows_mut()[row].as_array_mut()[0] = f32::NAN;
        }
        let report = projector
            .forward(inputs.rows())
            .expect_err("should collect failed chunks");
        assert_eq!(report.current_contexts().count(), 2);
        assert!(
            report
                .current_contexts()
                .all(|error| matches!(error, ProjectionError::NonFiniteProjection))
        );
        let mut reported: Vec<_> = report
            .frames()
            .filter_map(
                |frame| match frame.downcast_ref::<RefreshError<ForwardIndex>>()? {
                    RefreshError::Diverged { row, .. } => Some(row.as_usize()),
                    RefreshError::NonFiniteScale { .. } => None,
                },
            )
            .collect();
        reported.sort_unstable();
        assert_eq!(reported, offenders);
        let _reused = projector
            .forward(&inputs.rows()[..1])
            .expect("should reuse scratch after failed chunks");
    }

    #[test]
    fn forward_alignment_overflow() {
        let mut projector = projector(None);
        let inputs = representations(1);
        let projected = projector
            .forward(inputs.rows())
            .expect("should project a finite point");
        let point = projected[ForwardIndex::new(0)];
        assert!(point.x().abs().max(point.y().abs()) > 1e-3);
        projector.alignment = Some(
            Similarity::new(
                positive!(1e37),
                Rotation::IDENTITY,
                Vec2::new(f32::MAX.copysign(point.x()), f32::MAX.copysign(point.y())),
            )
            .expect("should accept a finite similarity with a normal reciprocal"),
        );
        let report = projector
            .forward(inputs.rows())
            .expect_err("should refuse alignment overflow");
        assert!(
            report
                .current_contexts()
                .all(|error| matches!(error, ProjectionError::NonFiniteAlignment))
        );
        assert_eq!(
            report
                .downcast_ref::<NonFinitePoint<ForwardIndex>>()
                .expect("should retain the failing row")
                .id,
            ForwardIndex::new(0)
        );
    }

    #[test]
    fn project_world_bounds() {
        let mut projector = projector(None);
        let inputs = representations(1);
        let projected = projector
            .forward(inputs.rows())
            .expect("should project a finite point");
        let point = projected[ForwardIndex::new(0)];
        projector.world = Bounds2::new(point, point).expect("should accept a point-sized world");
        let _boundary = projector
            .project(inputs.rows())
            .expect("should include the world boundary");
        projector.world = Bounds2::new(point + Vec2::splat(10.0), point + Vec2::splat(20.0))
            .expect("should accept ordered bounds");
        let report = projector
            .project(inputs.rows())
            .expect_err("should refuse an outside point");
        assert!(
            matches!(report.current_contexts().next(), Some(ProjectionError::OutOfBounds { row, global }) if *row == ForwardIndex::new(0) && *global == point)
        );
        assert!(report.current_contexts().nth(1).is_none());
    }

    #[test]
    fn roundtrip_column_lengths() {
        let mut projector = projector(None);
        for (representations_len, coordinates_len) in [(0, 0), (1, 0), (0, 1), (2, 1), (1, 2)] {
            let inputs = representations(representations_len);
            let coordinates = vec![Vec2::ZERO; coordinates_len];
            let report = projector
                .try_roundtrip_sample_impl(
                    IdSlice::from_raw(inputs.rows()),
                    IdSlice::from_raw(&coordinates),
                )
                .expect_err("should refuse empty or mismatched columns");
            assert!(
                matches!(report.current_context(), ProjectorError::InvalidSampleCorpus { representations, coordinates } if *representations == representations_len && *coordinates == coordinates_len)
            );
        }
    }

    #[test]
    fn roundtrip_non_finite_coordinate() {
        let mut projector = projector(None);
        let inputs = representations(2);
        let coordinates = [Vec2::ZERO, Vec2::new(f32::NAN, 0.0)];
        let report = projector
            .try_roundtrip_sample_impl(
                IdSlice::from_raw(inputs.rows()),
                IdSlice::from_raw(&coordinates),
            )
            .expect_err("should refuse a non-finite published point");
        assert!(
            matches!(report.current_context(), ProjectorError::NonFiniteCoordinates { row } if *row == NodeRowId::new(1))
        );
    }

    #[test]
    fn roundtrip_aligned_sample() {
        let mut projector = projector(Some(
            Similarity::new(positive!(2.0), Rotation::IDENTITY, Vec2::new(3.0, -4.0))
                .expect("should have a valid similarity"),
        ));
        let inputs = representations(ProjectorState::CHUNK_SIZE * 2 + 1);
        let coordinates = projector
            .forward(inputs.rows())
            .expect("should project sample coordinates");
        projector
            .try_roundtrip_sample_impl(
                IdSlice::from_raw(inputs.rows()),
                IdSlice::from_raw(coordinates.as_slice().as_raw()),
            )
            .expect("should reproduce aligned sample coordinates");
    }

    #[test]
    fn roundtrip_tolerance_exceeded() {
        let mut projector = projector(None);
        let inputs = representations(1);
        let projected = projector
            .forward(inputs.rows())
            .expect("should project a finite point");
        let coordinates = [projected[ForwardIndex::new(0)] + Vec2::new(0.01, 0.0)];
        let report = projector
            .try_roundtrip_sample_impl(
                IdSlice::from_raw(inputs.rows()),
                IdSlice::from_raw(&coordinates),
            )
            .expect_err("should refuse a changed published point");
        assert!(
            matches!(report.current_context(), ProjectorError::RoundtripSampleToleranceExceeded { tolerance, error } if error >= tolerance)
        );
    }

    #[test]
    fn roundtrip_non_finite_projection() {
        let mut projector = projector(None);
        let mut inputs = representations(1);
        inputs.rows_mut()[0].as_array_mut()[0] = f32::INFINITY;
        let report = projector
            .try_roundtrip_sample_impl(
                IdSlice::from_raw(inputs.rows()),
                IdSlice::from_raw(&[Vec2::ZERO]),
            )
            .expect_err("should refuse a non-finite sample projection");
        assert!(matches!(
            report.current_context(),
            ProjectorError::RoundtripSampleForward
        ));
        assert!(report.contains::<RefreshError<ForwardIndex>>());
    }
}
