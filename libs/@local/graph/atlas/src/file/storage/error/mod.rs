use core::{error::Error, fmt};
use std::io;

use aws_sdk_s3::{error::SdkError, primitives::ByteStreamError};

use crate::offload::OffloadError;

#[cfg(test)]
mod tests;

/// A failure to access a configured storage backend or transfer a file.
#[derive(Debug)]
pub enum StorageError {
    /// The storage configuration has no S3 backend.
    S3Unavailable,
    /// A filesystem operation or streamed transfer failed.
    Io(io::Error),
    /// The local destination has no file name or uses the reserved `.storage-` prefix.
    InvalidLocalDestination,
    /// The revision belongs to a different storage backend.
    RevisionMismatch,
    /// The local destination failed its write precondition.
    PreconditionFailed,
    /// Constructing a file-backed request body failed.
    Body(ByteStreamError),
    /// The object cannot fit within S3's multipart size and part-count bounds.
    ObjectTooLarge { length: u64 },
    /// The S3 response omitted a nonnegative object length.
    InvalidContentLength,
    /// The S3 response omitted the entity tag required to complete or copy an object.
    MissingEntityTag,
    /// The S3 response omitted the requested part checksum.
    MissingChecksum,
    /// The S3 response omitted the multipart upload identifier.
    MissingUploadId,
    /// An S3 request failed, retaining its service response or transport failure.
    Request(Box<SdkError<aws_sdk_s3::Error>>),
}

impl StorageError {
    pub(crate) fn is_not_found(&self) -> bool {
        match self {
            Self::Io(error) => error.kind() == io::ErrorKind::NotFound,
            Self::Request(error) => matches!(
                error.as_service_error(),
                Some(aws_sdk_s3::Error::NoSuchKey(_))
            ),
            _ => false,
        }
    }

    pub(crate) fn is_precondition_failed(&self) -> bool {
        match self {
            Self::PreconditionFailed => true,
            Self::Request(error) => {
                error.as_service_error().is_some()
                    && error
                        .raw_response()
                        .is_some_and(|response| response.status().as_u16() == 412)
            }
            _ => false,
        }
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::S3Unavailable => fmt.write_str("S3 storage is not configured"),
            Self::Io(error) => write!(fmt, "file I/O failed: {error}"),
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
            Self::Body(error) => Some(error),
            Self::Request(error) => Some(error.as_ref()),
        }
    }
}

impl From<io::Error> for StorageError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<OffloadError> for StorageError {
    fn from(error: OffloadError) -> Self {
        Self::Io(io::Error::other(error))
    }
}

impl From<ByteStreamError> for StorageError {
    fn from(error: ByteStreamError) -> Self {
        Self::Body(error)
    }
}

impl<E> From<SdkError<E>> for StorageError
where
    aws_sdk_s3::Error: From<E>,
{
    fn from(error: SdkError<E>) -> Self {
        Self::Request(Box::new(error.map_service_error(aws_sdk_s3::Error::from)))
    }
}
