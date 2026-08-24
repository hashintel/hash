//! Checkpoint artifacts: the published model checkpoint, and the error vocabulary both checkpoint
//! flavours share.
//!
//! Both artifacts are burn's own named-MessagePack record format, written and parsed by the
//! framework - the deliberate framework-parse exception to the crate's zerocopy mapping doctrine,
//! because the payload is the framework's serialized module state and stays exactly as the
//! framework writes it, with no envelope from this crate around it. Validation therefore happens on
//! the decoded values, never on bytes: every open verifies the record against the architecture (and
//! the resume flavour against its own schedule) before it returns a model.
//!
//! The model checkpoint is a generation's published artifact: the trained projector alone, openable
//! on any backend for inference. It lives here as [`RecordedModel`] and [`open_model`]. The resume
//! checkpoint is the fork point of the tuning protocol - the full training state at entry of the
//! boundary step, from which a ladder segment resumes bit-equally on a deterministic backend - and
//! rides on the state it serializes, as
//! [`BoundaryState::write_checkpoint`](crate::salt::projector::train::BoundaryState::write_checkpoint)
//! and
//! [`BoundaryState::open_checkpoint`](crate::salt::projector::train::BoundaryState::open_checkpoint).
//! Both flavours fail through this module's [`CheckpointError`].

#[cfg(test)]
mod tests;

use std::io::{self, Write as _};

use burn::{
    module::Module as _,
    record::{FullPrecisionSettings, NamedMpkBytesRecorder, Recorder as _, RecorderError},
    tensor::backend::Backend,
};

use crate::{
    file::{WriteAs, WriteInto, salt::artifact},
    integrity::{Sha256, Sha256Digest, Writer},
    math::{DPositive, d_positive},
    salt::projector::model::{Architecture, ArchitectureMismatch, Projector, ProjectorRecord},
};

/// The certificate bound on the canonical step's reproduction, world units per component.
///
/// A reopened model checkpoint, forwarded at the canonical step, reproduces its generation's
/// published coordinate column within this bound. One order above the measured reproduction
/// floor: independent full-corpus rebuilds of two prior generations reached maximum component
/// errors of `7.6e-5` and `1.03e-4` against their published coordinate columns.
pub(crate) const CERTIFICATE_TOLERANCE: DPositive = d_positive!(1e-3);

/// An error from writing or opening a checkpoint.
#[derive(Debug)]
pub(crate) enum CheckpointError {
    /// Reading or writing the checkpoint bytes failed.
    Io(io::Error),
    /// The framework could not encode or decode the record.
    Record(RecorderError),
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

impl From<RecorderError> for CheckpointError {
    fn from(error: RecorderError) -> Self {
        Self::Record(error)
    }
}

impl From<ArchitectureMismatch> for CheckpointError {
    #[inline]
    fn from(error: ArchitectureMismatch) -> Self {
        Self::Architecture(error)
    }
}

/// One recorded model checkpoint holding the framework's serialized bytes, ready to stage.
///
/// The record-then-stage split keeps the two failure domains apart: recording fails only in the
/// framework's encoder while staging fails only in the writer, so neither error path has to
/// explain the other. Its writer marking admits the value as the published
/// [`artifact::Projector`] entry.
pub(crate) struct RecordedModel(Vec<u8>);

impl RecordedModel {
    /// Records the model's parameters as the checkpoint's byte form.
    ///
    /// Consumes the model. Recording moves the parameters into the record, so a caller that
    /// keeps its own copy clones at the call site where the copy is visible.
    ///
    /// # Errors
    ///
    /// Returns an error when the framework cannot encode the record.
    pub(crate) fn record<B: Backend>(model: Projector<B>) -> Result<Self, CheckpointError> {
        // Burn's "full" precision is f32 (as opposed to half); the model is f32 end to end, so
        // the recorder round-trips the parameters exactly.
        let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
        let bytes = recorder.record(model.into_record(), ())?;
        Ok(Self(bytes))
    }
}

impl WriteInto for RecordedModel {
    type Error = io::Error;

    fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, io::Error> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };
        writer.write_all(&self.0)?;
        Ok(writer.accumulator.finalize())
    }
}

impl WriteAs<artifact::Projector> for RecordedModel {}

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
    let record: ProjectorRecord<B> = recorder.load(bytes, device)?;
    Ok(Projector::from_record(architecture, record, device)?)
}
