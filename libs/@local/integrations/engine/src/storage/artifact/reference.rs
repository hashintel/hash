use hash_crypto::digest::Sha256Digest;
use object_store::path::Path as Location;
use serde::{Deserialize, Serialize};

use crate::storage::ArtifactKey;

// Origin: the media type of `BlobRefV1` and the key extension of `ArtifactStore::publish` in
// labs `pocs/integrations_rs/src/blob.rs`.
/// The format of an artifact, which gives its file extension.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Parquet,
    DuckDb,
    Json,
    Binary,
}

impl Format {
    pub(super) const fn extension(self) -> &'static str {
        match self {
            Self::Parquet => "parquet",
            Self::DuckDb => "duckdb",
            Self::Json => "json",
            Self::Binary => "bin",
        }
    }
}

// Origin: `BlobRef` in labs `pocs/integrations_rs/src/blob.rs`.
/// Identifies a stored artifact by its content.
///
/// Stored as `{"version":"v1","value":{…}}`. A reference that was read back is checked against its
/// key and bytes when it is materialized.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "version",
    content = "value",
    rename_all = "lowercase",
    deny_unknown_fields
)]
pub enum ArtifactRef {
    V1(ArtifactRefV1),
}

// Origin: `BlobRefV1` in labs `pocs/integrations_rs/src/blob.rs`, without the media type, ETag and
// provider version.
/// The first version of an artifact reference.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactRefV1 {
    key: Box<str>,
    #[serde(with = "hex::serde")]
    sha256: [u8; 32],
    size: u64,
    format: Format,
}

impl ArtifactRef {
    /// The reference to an artifact of `format` with `sha256` and `size`, published under
    /// `prefix`.
    pub(super) fn new(
        prefix: &ArtifactKey,
        sha256: Sha256Digest,
        size: u64,
        format: Format,
    ) -> Self {
        let sha256 = sha256.to_bytes();
        Self::V1(ArtifactRefV1 {
            key: format!("{prefix}/{}", address(&sha256, format)).into(),
            sha256,
            size,
            format,
        })
    }

    const fn current(&self) -> &ArtifactRefV1 {
        match self {
            Self::V1(artifact) => artifact,
        }
    }

    /// Where the artifact is stored, relative to the storage root.
    #[must_use]
    pub fn key(&self) -> &str {
        &self.current().key
    }

    /// The SHA-256 digest of the artifact's bytes.
    #[must_use]
    pub const fn sha256(&self) -> [u8; 32] {
        self.current().sha256
    }

    /// The size of the artifact in bytes.
    #[must_use]
    pub const fn size(&self) -> u64 {
        self.current().size
    }

    #[must_use]
    pub const fn format(&self) -> Format {
        self.current().format
    }

    /// Whether bytes with `sha256` and `size` are this artifact.
    pub(super) fn matches(&self, sha256: Sha256Digest, size: u64) -> bool {
        self.size() == size && self.sha256() == sha256.to_bytes()
    }

    // Origin: `validate_blob_reference` in labs `pocs/integrations_rs/src/blob.rs`.
    /// Whether the key is the content-addressed key of the digest and format, under a prefix of
    /// safe segments.
    pub(super) fn is_addressed(&self) -> bool {
        self.key()
            .strip_suffix(&*address(&self.sha256(), self.format()))
            .and_then(|prefix| prefix.strip_suffix('/'))
            .is_some_and(|prefix| {
                prefix
                    .split('/')
                    .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
            })
    }

    pub(super) fn location(&self) -> Location {
        Location::from(self.key())
    }
}

// Origin: the content-addressed key `{prefix}/sha256/{xx}/{sha256}{ext}` built by
// `ArtifactStore::publish` in labs `pocs/integrations_rs/src/blob.rs`.
/// The end of an artifact's key: `sha256/{xx}/{sha256}.{extension}`.
fn address(sha256: &[u8; 32], format: Format) -> String {
    format!(
        "sha256/{:02x}/{}.{}",
        sha256[0],
        hex::encode(sha256),
        format.extension()
    )
}
