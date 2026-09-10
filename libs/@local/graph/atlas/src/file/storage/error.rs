use core::{error::Error, fmt};
use std::io;

use aws_sdk_s3::error::SdkError;

/// A failure to access a configured storage backend or transfer a file.
#[derive(Debug)]
pub(crate) enum StorageError {
    /// The storage configuration has no S3 backend.
    S3Unavailable,
    /// A filesystem operation or streamed transfer failed.
    Io(io::Error),
    /// An S3 request failed, retaining its service response or transport failure.
    Request(Box<SdkError<aws_sdk_s3::Error>>),
}

impl fmt::Display for StorageError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::S3Unavailable => fmt.write_str("S3 storage is not configured"),
            Self::Io(error) => write!(fmt, "file I/O failed: {error}"),
            Self::Request(error) => write!(fmt, "S3 request failed: {error}"),
        }
    }
}

impl Error for StorageError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::S3Unavailable => None,
            Self::Io(error) => Some(error),
            Self::Request(error) => Some(error.as_ref()),
        }
    }
}

impl From<io::Error> for StorageError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
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
