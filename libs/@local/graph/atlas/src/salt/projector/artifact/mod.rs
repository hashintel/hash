//! Checkpoint artifacts: the published model and the boundary resume state.
//!
//! Both artifacts are burn's own named-MessagePack record format, written and parsed by the
//! framework - the deliberate framework-parse exception to the crate's zerocopy mapping doctrine,
//! because the payload is the framework's serialized module state and stays exactly as the
//! framework writes it, with no envelope of ours around it. Validation therefore happens on the
//! decoded values, never on bytes: every open verifies the record against the architecture (and the
//! resume flavour against its own schedule) before a model is handed out.
//!
//! The model checkpoint is a generation's published artifact: the trained projector alone, openable
//! on any backend for inference. The resume checkpoint is the fork point of the tuning protocol:
//! the full training state at entry of the boundary step - model, optimizer moments, scheduler
//! position, schedule, and the caller's generator state - from which a ladder segment resumes
//! bit-equally on a deterministic backend. Resume checkpoints pin the pipeline's generator
//! algorithm: the generator state is stored as the generator's own 32 state bytes.

#[cfg(test)]
mod tests;

use core::num::NonZero;
use std::io;

use burn::{
    module::Module as _,
    record::{FullPrecisionSettings, NamedMpkBytesRecorder, Record, Recorder as _, RecorderError},
    tensor::backend::{AutodiffBackend, Backend},
};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use crate::{
    math::UnitFraction,
    salt::projector::{
        model::{Architecture, ArchitectureMismatch, Projector, ProjectorRecord},
        train::{BoundaryState, TrainerOptimizerRecord, TrainingSchedule},
    },
};

/// A checkpoint could not be written or opened.
#[derive(Debug)]
pub enum CheckpointError {
    /// Reading or writing the checkpoint bytes failed.
    Io(io::Error),
    /// The framework could not encode or decode the record.
    Record(RecordFault),
    /// The decoded parameters do not describe the architecture.
    Architecture(ArchitectureMismatch),
    /// The decoded schedule fields do not form a valid schedule.
    InvalidSchedule,
    /// The decoded scheduler position does not sit at the schedule's boundary.
    ///
    /// The record's parts describe two different runs.
    SchedulerPosition { position: usize, boundary: usize },
}

impl core::fmt::Display for CheckpointError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "could not access the checkpoint: {error}"),
            Self::Record(error) => {
                write!(fmt, "could not encode or decode the checkpoint: {error}")
            }
            Self::Architecture(error) => error.fmt(fmt),
            Self::InvalidSchedule => fmt.write_str(
                "the checkpoint's schedule fields do not form a valid training schedule",
            ),
            Self::SchedulerPosition { position, boundary } => write!(
                fmt,
                "the checkpoint's scheduler position {position} does not sit at its schedule's \
                 boundary {boundary}",
            ),
        }
    }
}

impl core::error::Error for CheckpointError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Record(error) => Some(error),
            Self::Architecture(error) => Some(error),
            Self::InvalidSchedule | Self::SchedulerPosition { .. } => None,
        }
    }
}

impl From<io::Error> for CheckpointError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl CheckpointError {
    // Not a `From` impl: burn is a private dependency, so the
    // conversion stays out of the public interface.
    const fn record(error: RecorderError) -> Self {
        Self::Record(RecordFault(error))
    }
}

/// The record codec's fault.
// The private field keeps burn's `RecorderError` out of the public
// interface: burn is a private dependency.
#[derive(Debug)]
pub struct RecordFault(RecorderError);

impl core::fmt::Display for RecordFault {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        core::fmt::Display::fmt(&self.0, fmt)
    }
}

impl core::error::Error for RecordFault {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        self.0.source()
    }
}

impl From<ArchitectureMismatch> for CheckpointError {
    #[inline]
    fn from(error: ArchitectureMismatch) -> Self {
        Self::Architecture(error)
    }
}

/// The resume checkpoint's record: the training state at entry of the boundary step.
///
/// The schedule rides in full so a resumed run can verify it trains under the schedule the opening
/// segment ran under; the scheduler position is redundant with the boundary by construction, and
/// the open path rejects a record where the two disagree.
#[derive(Record)]
struct ResumeRecord<B: AutodiffBackend<FloatElem = f32>> {
    model: ProjectorRecord<B>,
    optimizer: TrainerOptimizerRecord<B>,
    scheduler: usize,
    steps: usize,
    boundary: usize,
    refresh_interval: usize,
    initial_learning_rate: f64,
    minimum_learning_rate: f64,
    generator: [u8; 32],
}

/// Writes the published model checkpoint.
///
/// Consumes the model: recording moves the parameters into the record, so a caller keeping its
/// model clones at the call site, where the copy is visible.
///
/// # Errors
///
/// Returns an error when encoding or writing fails.
pub(crate) fn write_model<B: Backend>(
    model: Projector<B>,
    writer: &mut impl io::Write,
) -> Result<(), CheckpointError> {
    // Burn's "full" precision is f32 (as opposed to half); the model is f32 end to end, so the
    // recorder round-trips the parameters exactly.
    let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
    let bytes = recorder
        .record(model.into_record(), ())
        .map_err(CheckpointError::record)?;
    writer.write_all(&bytes)?;
    Ok(())
}

/// Opens a published model checkpoint on any backend.
///
/// # Errors
///
/// Returns an error when reading or decoding fails or the decoded parameters do not describe
/// `architecture`.
#[tracing::instrument(skip_all)]
pub(crate) fn open_model<B: Backend>(
    mut reader: impl io::Read,
    architecture: Architecture,
    device: &B::Device,
) -> Result<Projector<B>, CheckpointError> {
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes)?;

    let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
    let record: ProjectorRecord<B> = recorder
        .load(bytes, device)
        .map_err(CheckpointError::record)?;
    Ok(Projector::from_record(architecture, record, device)?)
}

/// Writes a resume checkpoint: the boundary state plus the caller's generator.
///
/// The generator is the run's batch-draw stream as it stands at the boundary; a resumed ladder
/// continues it, which is what makes the resumed run's draws identical to the straight run's.
///
/// The written bytes are not canonical: the optimizer record is a map whose serialization order may
/// differ between processes, so two writes of one training state need not be byte-equal. Identity
/// lives in the decoded state, which round-trips exactly.
///
/// # Errors
///
/// Returns an error when encoding or writing fails.
pub(crate) fn write_resume<B: AutodiffBackend<FloatElem = f32>>(
    state: &BoundaryState<B>,
    generator: &Xoshiro256PlusPlus,
    writer: &mut impl io::Write,
) -> Result<(), CheckpointError> {
    let schedule = state.schedule();
    let record = ResumeRecord {
        model: state.model().clone().into_record(),
        optimizer: state.optimizer_record(),
        scheduler: state.scheduler_position(),
        steps: schedule.steps().get(),
        boundary: schedule.boundary(),
        refresh_interval: schedule.refresh_interval().get(),
        initial_learning_rate: schedule.initial_learning_rate(),
        minimum_learning_rate: schedule.minimum_learning_rate(),
        generator: generator.state(),
    };
    let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
    let bytes = recorder
        .record(record, ())
        .map_err(CheckpointError::record)?;
    writer.write_all(&bytes)?;

    Ok(())
}

/// Opens a resume checkpoint: the boundary state and the generator to continue with.
///
/// Every decoded value is verified before the state is handed out: the parameters against
/// `architecture`, the schedule against its own validity domain, and the scheduler position against
/// the boundary; the generator state's length is carried by the record type itself. The state
/// round-trip is exact: a generator captured from a live stream is never the all-zero state the
/// generator's seeding remaps.
///
/// # Errors
///
/// Returns an error when reading or decoding fails or any decoded value fails its verification.
#[tracing::instrument(skip_all)]
pub(crate) fn open_resume<B: AutodiffBackend<FloatElem = f32>>(
    mut reader: impl io::Read,
    architecture: Architecture,
    device: &B::Device,
) -> Result<(BoundaryState<B>, Xoshiro256PlusPlus), CheckpointError> {
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes)?;
    let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
    let record: ResumeRecord<B> = recorder
        .load(bytes, device)
        .map_err(CheckpointError::record)?;

    let schedule = NonZero::new(record.steps)
        .zip(NonZero::new(record.refresh_interval))
        .zip(
            UnitFraction::new(record.initial_learning_rate)
                .zip(UnitFraction::new(record.minimum_learning_rate)),
        )
        .and_then(|((steps, refresh_interval), (initial, minimum))| {
            TrainingSchedule::new(steps, record.boundary, refresh_interval, initial, minimum)
        })
        .ok_or(CheckpointError::InvalidSchedule)?;

    let generator = Xoshiro256PlusPlus::from_seed(record.generator);

    let model = Projector::from_record(architecture, record.model, device)?;
    let state = BoundaryState::from_parts(model, record.optimizer, record.scheduler, schedule)
        .ok_or_else(|| CheckpointError::SchedulerPosition {
            position: record.scheduler,
            boundary: schedule.boundary(),
        })?;

    Ok((state, generator))
}
