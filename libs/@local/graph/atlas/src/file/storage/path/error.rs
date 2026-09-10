use core::{error, fmt};

use zerocopy::AllocError;

#[derive(Debug)]
pub(crate) enum PathComponent {
    Bucket,
    Key,
}

/// A failure to parse an S3 object location.
#[derive(Debug)]
pub(crate) enum FilePathError {
    Scheme,
    MissingKey,
    AllocationFailed(AllocError),
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
