use core::num::NonZero;
use std::fs::File;

use error_stack::{Report, ReportSink, ResultExt};
use hashql_core::id::{Id as _, IdSlice};

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::{self, PhysicalDevice},
    file::{generation::Generation, salt::metadata::ProjectorEvidence},
    identity::NodeRowId,
    math::{
        AlignedVecN, Bounds2, DPositive, FinitePointField, MatrixN, NonNegative, Similarity, Vec2,
        d_positive,
    },
    postgres::id::ArchivedEntityUuid,
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
    /// A row of one projection batch.
    ///
    /// The ordinal is batch-local: it names a position in the slice handed to one forward call
    /// and nothing beyond it.
    #[id(const)]
    pub struct ForwardIndex(u32)
}

pub(crate) struct Positioned<T> {
    pub value: T,
    pub position: Vec2,
}

enum ProjectionError {
    OutOfBounds {
        entity: ArchivedEntityUuid,
        global: Vec2,
    },
    NonFiniteProjection,
}

enum ProjectorError {}

pub(crate) struct ProjectorState {
    inputs: MatrixN<PROJECTOR_DIMENSIONS>,
    roles: Vec<NodeRole>,
}

impl ProjectorState {
    const CHUNK_SIZE: usize = 256;

    pub(crate) fn new() -> Self {
        Self {
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

        let (condition, alignment) = match metadata.evidence.projector {
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
                tracing::warn!("projector evidence published a canonical out of bounds index");
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

        let this = Self {
            model,
            device,
            condition,
            alignment,
            world: metadata.evidence.lod.world,
            forward_rows: options.forward_rows,
            state: ProjectorState::new(),
        };

        if let Err(error) = this.try_roundtrip_sample(generation) {
            return Err(error);
        }

        Ok(Some(this))
    }

    // TODO: tracing attach the samples and width, and instrument and such
    fn try_roundtrip_sample(&self, generation: &Generation) -> Result<(), Report<ProjectorError>> {
        const SAMPLES: usize = 1024;
        const TOLERANCE: DPositive = d_positive!(1e-3);

        let files = &generation.repository().files;

        let representations = VectorFile::open(generation.path_of(&files.representations.name()))
            .change_context(ProjectorError::CannotLoadRepresentations)?;
        let coordinates = PointFile::open(generation.path_of(&files.coordinates.name()))
            .change_context(ProjectorError::CannotLoadCoordinates)?;

        let sample_size = SAMPLES.min(representations.len());
        let sampled: Vec<_> = (0..sample_size)
            .map(|index| index * coordinates.len() / sample_size)
            .map(NodeRowId::from_usize)
            .collect();
        let sampled_rows = sampled.iter().map(|&row| &representations[row]);

        let aligned = self
            .forward(sampled_rows)
            .change_context(ProjectorError::RoundtripSampleForward)?;

        let mut max_error = 0.0_f64;
        for (&row, reprojected) in sampled.iter().zip(&aligned) {
            let published = coordinates[row];
            let error = f64::from((reprojected.x() - published.x()).abs())
                .max(f64::from((reprojected.y() - published.y()).abs()));
            max_error = max_error.max(error);
        }

        if max_error < TOLERANCE {
            return Ok(());
        }

        Err(Report::new(
            ProjectorError::RoundtripSampleToleranceExceeded {
                tolerance: TOLERANCE,
                error: max_error,
            },
        ))
    }

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
                .change_context(ProjectionError::NonFiniteProjection),
            );

            match (frame, self.alignment) {
                (None, _) => {}
                (Some(frame), Some(alignment)) => {
                    aligned.extend(frame.iter().map(|&point| alignment.apply(point)));
                }
                (Some(frame), None) => aligned.extend(frame.as_slice()),
            }

            if filled < ProjectorState::CHUNK_SIZE {
                break;
            }

            offset += filled;
        }

        Ok(aligned)
    }
}
