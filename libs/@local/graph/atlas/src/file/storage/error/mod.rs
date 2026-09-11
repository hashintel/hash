use core::{error::Error, fmt};
use std::io;

use aws_smithy_runtime_api::client::{orchestrator::HttpResponse, result::SdkError};
use aws_smithy_types::byte_stream::error::Error as ByteStreamError;
use tokio::task::JoinError;

#[cfg(test)]
mod tests;

/// A failure to access a configured storage backend or transfer a file.
#[derive(Debug)]
pub enum StorageError {
    /// The storage configuration has no S3 backend.
    S3Unavailable,
    /// A filesystem operation or streamed transfer failed.
    Io(io::Error),
    /// A blocking filesystem worker failed to return its result.
    Join(JoinError),
    /// The local destination has no file name or uses the reserved `.storage-` prefix.
    InvalidLocalDestination,
    /// The revision belongs to a different storage backend.
    RevisionMismatch,
    /// The local destination failed its write precondition.
    PreconditionFailed,
    /// Constructing a file-backed request body failed.
    Body(ByteStreamError),
    /// The object cannot fit within S3's multipart size and part-count bounds.
    ObjectTooLarge {
        /// The rejected object's length in bytes.
        length: u64,
    },
    /// The S3 response omitted a nonnegative object length.
    InvalidContentLength,
    /// The S3 response omitted the entity tag required to complete or copy an object.
    MissingEntityTag,
    /// The S3 response omitted the requested part checksum.
    MissingChecksum,
    /// The S3 response omitted the multipart upload identifier.
    MissingUploadId,
    /// An S3 request failed, retaining its service response or transport failure.
    Request(Box<SdkError<aws_sdk_s3::Error, HttpResponse>>),
}

impl StorageError {
    /// Identifies an absent local file or S3 key.
    pub(crate) fn is_not_found(&self) -> bool {
        match self {
            Self::Io(error) => error.kind() == io::ErrorKind::NotFound,
            Self::Request(error) => matches!(
                error.as_service_error(),
                Some(aws_sdk_s3::Error::NoSuchKey(_))
            ),
            Self::S3Unavailable
            | Self::Join(_)
            | Self::InvalidLocalDestination
            | Self::RevisionMismatch
            | Self::PreconditionFailed
            | Self::Body(_)
            | Self::ObjectTooLarge { .. }
            | Self::InvalidContentLength
            | Self::MissingEntityTag
            | Self::MissingChecksum
            | Self::MissingUploadId => false,
        }
    }

    /// Identifies a rejected conditional write, excluding transport failures.
    pub(crate) fn is_precondition_failed(&self) -> bool {
        match self {
            Self::PreconditionFailed => true,
            Self::Request(error) => {
                error.as_service_error().is_some()
                    && error
                        .raw_response()
                        .is_some_and(|response| response.status().as_u16() == 412)
            }
            Self::S3Unavailable
            | Self::Io(_)
            | Self::Join(_)
            | Self::InvalidLocalDestination
            | Self::RevisionMismatch
            | Self::Body(_)
            | Self::ObjectTooLarge { .. }
            | Self::InvalidContentLength
            | Self::MissingEntityTag
            | Self::MissingChecksum
            | Self::MissingUploadId => false,
        }
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::S3Unavailable => fmt.write_str("S3 storage is not configured"),
            Self::Io(error) => write!(fmt, "file I/O failed: {error}"),
            Self::Join(error) => write!(fmt, "the filesystem worker failed: {error}"),
            Self::InvalidLocalDestination => {
                fmt.write_str("invalid or reserved local storage destination")
            }
            Self::RevisionMismatch => {
                fmt.write_str("the revision belongs to a different storage backend")
            }
            Self::PreconditionFailed => fmt.write_str("the local write precondition failed"),
            Self::Body(error) => write!(fmt, "constructing the S3 request body failed: {error}"),
            Self::ObjectTooLarge { length } => write!(
                fmt,
                "S3 multipart bounds cannot represent an object of {length} bytes"
            ),
            Self::InvalidContentLength => fmt.write_str("S3 returned no nonnegative object length"),
            Self::MissingEntityTag => fmt.write_str("S3 returned no entity tag"),
            Self::MissingChecksum => fmt.write_str("S3 returned no requested part checksum"),
            Self::MissingUploadId => fmt.write_str("S3 returned no multipart upload identifier"),
            Self::Request(error) => write!(fmt, "S3 request failed: {error}"),
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::S3Unavailable
            | Self::InvalidLocalDestination
            | Self::RevisionMismatch
            | Self::PreconditionFailed
            | Self::ObjectTooLarge { .. }
            | Self::InvalidContentLength
            | Self::MissingEntityTag
            | Self::MissingChecksum
            | Self::MissingUploadId => None,
            Self::Io(error) => Some(error),
            Self::Join(error) => Some(error),
            Self::Body(error) => Some(error),
            Self::Request(error) => Some(error.as_ref()),
        }
    }
}

impl From<io::Error> for StorageError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<JoinError> for StorageError {
    fn from(value: JoinError) -> Self {
        Self::Join(value)
    }
}

impl From<ByteStreamError> for StorageError {
    fn from(value: ByteStreamError) -> Self {
        Self::Body(value)
    }
}

impl<E> From<SdkError<E, HttpResponse>> for StorageError
where
    aws_sdk_s3::Error: From<E>,
{
    fn from(value: SdkError<E, HttpResponse>) -> Self {
        Self::Request(Box::new(value.map_service_error(aws_sdk_s3::Error::from)))
    }
}
