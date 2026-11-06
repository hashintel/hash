mod artifact;
pub(crate) mod layout;
#[cfg(test)]
pub(crate) mod tests;

pub(crate) use self::artifact::Stored;
pub use self::artifact::{ArtifactError, ArtifactStorage, S3Bucket};

/// Where an artifact is stored, relative to the storage root.
///
/// Keys are built only by [`layout`], which is the one place that knows the storage layout.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub(crate) struct ArtifactKey(Box<str>);
