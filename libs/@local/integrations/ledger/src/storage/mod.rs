mod artifact;
mod bucket;
mod namespace;
#[cfg(test)]
pub(crate) mod tests;

pub(crate) use self::artifact::Bound;
pub use self::{
    artifact::{ArtifactRef, ArtifactRefV1, ArtifactStorage, Format},
    bucket::S3Bucket,
    namespace::ArtifactNamespace,
};

/// Reports why an artifact could not be read or stored.
#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub enum ArtifactError {
    #[display("the artifact could not be read")]
    Read,
    #[display("the artifact could not be written")]
    Write,
    #[display("the artifact does not match its reference")]
    Mismatch,
}

/// Where an artifact is stored, relative to the storage root.
///
/// Keys are built only by [`ArtifactNamespace`], which is the one place that knows the storage
/// layout.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub struct ArtifactKey(Box<str>);
