use core::{error, fmt};

use zerocopy::AllocError;

/// The part of an S3 path a refusal names.
#[derive(Debug)]
pub enum PathComponent {
    /// The bucket component after `s3://`.
    Bucket,
    /// The object key after the bucket separator.
    Key,
}

/// A failure to parse an S3 object location.
#[derive(Debug)]
pub enum FilePathError {
    /// The text does not start with `s3://`.
    Scheme,
    /// The text carries a bucket with no slash after it.
    MissingKey,
    /// Allocating the path failed.
    AllocationFailed(AllocError),
    /// The named component is empty.
    Empty { component: PathComponent },
}

impl fmt::Display for FilePathError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Scheme => fmt.write_str("S3 path must start with s3://"),
            Self::MissingKey => fmt.write_str("S3 path is missing a key"),
            Self::AllocationFailed(_) => fmt.write_str("failed to allocate memory for path"),
            Self::Empty { component } => match component {
                PathComponent::Bucket => fmt.write_str("S3 path has an empty bucket"),
                PathComponent::Key => fmt.write_str("S3 path has an empty key"),
            },
        }
    }
}

impl error::Error for FilePathError {}

impl From<AllocError> for FilePathError {
    fn from(error: AllocError) -> Self {
        Self::AllocationFailed(error)
    }
}
