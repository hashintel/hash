//! Published files and their identities.
//!
//! A repository is a directory of immutable published files. Each file is
//! known by its name, relative to the repository root, and by the SHA-256
//! of its bytes. The name locates the file; the hash is its identity:
//! verification tooling recomputes it, and equal hashes across
//! repositories mean the file can be shared rather than copied.
//!
//! The repository itself is versioned by [`RepositoryVersion`], recorded
//! in the metadata document that describes it. It is the JSON analog of
//! the pinned binary headers: deserialization admits only versions this
//! module implements, so reading a repository of another version fails
//! before anything is interpreted.
//!
//! The layout (directory structure, naming) is version 0 and **mutable**:
//! change it freely to fit what the pipeline needs and increment
//! [`RepositoryVersion`] when you do; published files are immutable, the
//! conventions around them are not, until they stabilize.

use crate::integrity::Sha256Digest;

#[cfg(test)]
mod tests;

/// A repository layout version this module implements.
///
/// Serialized as a plain integer. Deserialization admits no other value;
/// increment on any layout change.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[serde(into = "u32", try_from = "u32")]
pub(crate) enum RepositoryVersion {
    V0 = 0,
}

impl From<RepositoryVersion> for u32 {
    #[inline]
    fn from(version: RepositoryVersion) -> Self {
        version as Self
    }
}

impl TryFrom<u32> for RepositoryVersion {
    type Error = UnknownRepositoryVersion;

    #[inline]
    fn try_from(value: u32) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::V0),
            _ => Err(UnknownRepositoryVersion(value)),
        }
    }
}

/// A repository version this module does not implement.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UnknownRepositoryVersion(u32);

impl core::fmt::Display for UnknownRepositoryVersion {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(formatter, "unknown repository version {}", self.0)
    }
}

impl core::error::Error for UnknownRepositoryVersion {}

/// One published file: its name within the repository and the SHA-256 of
/// its bytes.
///
/// The name is a plain file name without path separators; files of one
/// repository live flat in its directory.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RepositoryFile {
    pub name: String,
    pub hash: Sha256Digest,
}
