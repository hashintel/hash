mod artifact;
mod bucket;
mod namespace;
mod parquet;
#[cfg(test)]
pub(crate) mod tests;

use core::fmt::Write as _;

pub(crate) use self::parquet::Stored;
pub use self::{
    artifact::{ArtifactRef, ArtifactRefV1, ArtifactStorage, Format},
    bucket::S3Bucket,
    namespace::ArtifactNamespace,
    parquet::ParquetStorage,
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

/// Writes `bytes` as lowercase hexadecimal digits.
fn hex(bytes: &[u8; 32]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(64), |mut hex, byte| {
            let _infallible = write!(hex, "{byte:02x}");
            hex
        })
}
