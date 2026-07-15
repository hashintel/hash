use core::{error::Error, fmt};
use std::{
    fs,
    io::{self, Write as _},
};

use burn::{
    module::Module as _,
    record::{FullPrecisionSettings, NamedMpkBytesRecorder, Recorder as _, RecorderError},
    tensor::backend::Backend,
};
use camino::Utf8Path;

use super::super::{
    ConditionedProjector, PROJECTOR_ARCHITECTURE_VERSION, ProjectorConfig, ProjectorError,
};
use crate::salt::hash::{ContentHash, hash_reader};

const CHECKPOINT_MAGIC: &[u8; 8] = b"SALTPROJ";
const CHECKPOINT_ENVELOPE_VERSION: u32 = 1;
const CHECKPOINT_HEADER_BYTES: usize = 64;

/// Identity and disposition of an immutable projector checkpoint.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedProjectorCheckpoint {
    /// SHA-256 identity of the complete recorder output.
    pub content_hash: ContentHash,
    /// Durable checkpoint length in bytes.
    pub byte_length: u64,
    /// Whether publication reused byte-identical existing content.
    pub reused_existing: bool,
}

/// Failure to record, publish, or load a projector checkpoint.
#[derive(Debug)]
pub(crate) enum ProjectorCheckpointError {
    Io(io::Error),
    Record(RecorderError),
    Architecture(ProjectorError),
    InvalidEnvelope {
        reason: &'static str,
    },
    ArchitectureMismatch {
        expected: ProjectorConfig,
        actual: ProjectorConfig,
    },
    ExistingCheckpointMismatch,
}

impl fmt::Display for ProjectorCheckpointError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "could not access projector checkpoint: {error}"),
            Self::Record(error) => {
                write!(formatter, "could not encode projector checkpoint: {error}")
            }
            Self::Architecture(error) => error.fmt(formatter),
            Self::InvalidEnvelope { reason } => {
                write!(
                    formatter,
                    "projector checkpoint envelope is invalid: {reason}"
                )
            }
            Self::ArchitectureMismatch { expected, actual } => write!(
                formatter,
                "projector checkpoint architecture {actual:?} differs from expected {expected:?}"
            ),
            Self::ExistingCheckpointMismatch => {
                formatter.write_str("existing immutable projector checkpoint has different content")
            }
        }
    }
}

impl Error for ProjectorCheckpointError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Record(error) => Some(error),
            Self::Architecture(error) => Some(error),
            Self::InvalidEnvelope { .. }
            | Self::ArchitectureMismatch { .. }
            | Self::ExistingCheckpointMismatch => None,
        }
    }
}

impl From<io::Error> for ProjectorCheckpointError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<RecorderError> for ProjectorCheckpointError {
    #[inline]
    fn from(error: RecorderError) -> Self {
        Self::Record(error)
    }
}

impl From<ProjectorError> for ProjectorCheckpointError {
    #[inline]
    fn from(error: ProjectorError) -> Self {
        Self::Architecture(error)
    }
}

/// Records and atomically no-clobber publishes one model checkpoint.
///
/// # Errors
///
/// This returns an error when recording or durable I/O fails, or different
/// immutable checkpoint bytes already occupy `path`.
pub(crate) fn publish_projector_checkpoint<B: Backend>(
    path: &Utf8Path,
    model: &ConditionedProjector<B>,
) -> Result<PublishedProjectorCheckpoint, ProjectorCheckpointError> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("projector checkpoint path {path} has no parent"),
        )
    })?;
    fs::create_dir_all(parent)?;
    let staging = tempfile::tempdir_in(parent)?;
    let recorded = staging.path().join("projector.mpk");
    let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
    let payload = recorder.record(model.clone().into_record(), ())?;
    let header = checkpoint_header(model.config(), payload.len())?;
    let mut file = fs::File::create(&recorded)?;
    file.write_all(&header)?;
    file.write_all(&payload)?;
    file.sync_all()?;
    let byte_length = u64::try_from(CHECKPOINT_HEADER_BYTES + payload.len()).map_err(|_| {
        ProjectorCheckpointError::InvalidEnvelope {
            reason: "checkpoint length does not fit u64",
        }
    })?;
    let content_hash = hash_reader(fs::File::open(&recorded)?)?;

    let reused_existing = match fs::hard_link(&recorded, path) {
        Ok(()) => {
            fs::File::open(parent)?.sync_all()?;
            false
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            let existing_hash = hash_reader(fs::File::open(path)?)?;
            if existing_hash != content_hash {
                return Err(ProjectorCheckpointError::ExistingCheckpointMismatch);
            }
            true
        }
        Err(error) => return Err(ProjectorCheckpointError::Io(error)),
    };
    Ok(PublishedProjectorCheckpoint {
        content_hash,
        byte_length,
        reused_existing,
    })
}

/// Loads a checkpoint into the exact declared architecture.
///
/// # Errors
///
/// This returns an error when architecture validation, file access, or record
/// decoding fails.
pub(crate) fn load_projector_checkpoint<B: Backend>(
    path: &Utf8Path,
    config: ProjectorConfig,
    device: &B::Device,
) -> Result<ConditionedProjector<B>, ProjectorCheckpointError> {
    let bytes = fs::read(path)?;
    load_projector_checkpoint_bytes(&bytes, config, device)
}

/// Loads a projector from one already verified immutable byte mapping.
///
/// The envelope architecture is checked before Burn decodes any tensor
/// record, preventing a checkpoint with incompatible dimensions from
/// replacing the model initialized from the manifest contract.
///
/// # Errors
///
/// This returns an error when the envelope is malformed, its architecture
/// differs from `config`, model construction fails, or the record cannot be
/// decoded.
pub(crate) fn load_projector_checkpoint_bytes<B: Backend>(
    bytes: &[u8],
    config: ProjectorConfig,
    device: &B::Device,
) -> Result<ConditionedProjector<B>, ProjectorCheckpointError> {
    let (actual, payload) = checkpoint_payload(bytes)?;
    if actual != config {
        return Err(ProjectorCheckpointError::ArchitectureMismatch {
            expected: config,
            actual,
        });
    }
    let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
    let record = recorder.load(payload.to_vec(), device)?;
    Ok(ConditionedProjector::new(config, device)?.load_record(record))
}

fn checkpoint_header(
    config: ProjectorConfig,
    payload_bytes: usize,
) -> Result<[u8; CHECKPOINT_HEADER_BYTES], ProjectorCheckpointError> {
    let total_bytes = CHECKPOINT_HEADER_BYTES.checked_add(payload_bytes).ok_or(
        ProjectorCheckpointError::InvalidEnvelope {
            reason: "checkpoint length overflows usize",
        },
    )?;
    let mut header = [0_u8; CHECKPOINT_HEADER_BYTES];
    header[..8].copy_from_slice(CHECKPOINT_MAGIC);
    header[8..12].copy_from_slice(&CHECKPOINT_ENVELOPE_VERSION.to_le_bytes());
    header[12..16].copy_from_slice(&PROJECTOR_ARCHITECTURE_VERSION.to_le_bytes());
    for (index, value) in [
        config.width,
        config.residual_blocks,
        config.type_context_dimensions,
        config.role_count,
        config.role_dimensions,
    ]
    .into_iter()
    .enumerate()
    {
        let start = 16 + index * 8;
        header[start..start + 8].copy_from_slice(
            &u64::try_from(value)
                .map_err(|_| ProjectorCheckpointError::InvalidEnvelope {
                    reason: "architecture dimension does not fit u64",
                })?
                .to_le_bytes(),
        );
    }
    header[56..64].copy_from_slice(
        &u64::try_from(total_bytes)
            .map_err(|_| ProjectorCheckpointError::InvalidEnvelope {
                reason: "checkpoint length does not fit u64",
            })?
            .to_le_bytes(),
    );
    Ok(header)
}

fn checkpoint_payload(bytes: &[u8]) -> Result<(ProjectorConfig, &[u8]), ProjectorCheckpointError> {
    if bytes.len() < CHECKPOINT_HEADER_BYTES {
        return Err(ProjectorCheckpointError::InvalidEnvelope {
            reason: "file is shorter than its fixed header",
        });
    }
    if &bytes[..8] != CHECKPOINT_MAGIC {
        return Err(ProjectorCheckpointError::InvalidEnvelope {
            reason: "magic bytes differ",
        });
    }
    if read_u32(bytes, 8) != CHECKPOINT_ENVELOPE_VERSION {
        return Err(ProjectorCheckpointError::InvalidEnvelope {
            reason: "envelope version is unsupported",
        });
    }
    if read_u32(bytes, 12) != PROJECTOR_ARCHITECTURE_VERSION {
        return Err(ProjectorCheckpointError::InvalidEnvelope {
            reason: "projector architecture version is unsupported",
        });
    }
    let declared = read_u64(bytes, 56);
    if usize::try_from(declared).ok() != Some(bytes.len()) {
        return Err(ProjectorCheckpointError::InvalidEnvelope {
            reason: "declared file length differs from the mapped bytes",
        });
    }
    let mut dimensions = [0_usize; 5];
    for (index, dimension) in dimensions.iter_mut().enumerate() {
        *dimension = usize::try_from(read_u64(bytes, 16 + index * 8)).map_err(|_| {
            ProjectorCheckpointError::InvalidEnvelope {
                reason: "architecture dimension does not fit usize",
            }
        })?;
    }
    Ok((
        ProjectorConfig {
            width: dimensions[0],
            residual_blocks: dimensions[1],
            type_context_dimensions: dimensions[2],
            role_count: dimensions[3],
            role_dimensions: dimensions[4],
        },
        &bytes[CHECKPOINT_HEADER_BYTES..],
    ))
}

#[inline]
fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("checkpoint header range should be fixed"),
    )
}

#[inline]
fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(
        bytes[offset..offset + 8]
            .try_into()
            .expect("checkpoint header range should be fixed"),
    )
}
