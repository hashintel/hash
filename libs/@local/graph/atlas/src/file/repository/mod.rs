//! Published files and their identities.
//!
//! A repository is a directory of immutable published files. Each file has a name relative to the
//! repository root and a SHA-256 hash of its bytes. The name locates the file. The hash is its
//! identity, which verification tooling recomputes. Equal hashes across repositories let the
//! repositories share one file rather than copy it.
//!
//! [`RepositoryVersion`] versions the repository itself. The metadata document that describes the
//! repository records it. That version is the JSON analog of the pinned binary headers. It leads
//! the serialized document, so deserialization rejects a repository of another layout before it
//! interprets the rest of the document. Field order carries that guarantee for documents this crate
//! wrote. Whichever field fails first rejects a document whose keys arrive in another order.
//!
//! The layout is version 2 and **mutable**, covering the directory structure and naming. Change it
//! to fit what the pipeline needs and increment [`RepositoryVersion`] when you do. Published files
//! are immutable while the conventions around them stay mutable until they stabilize. Retired
//! versions stay retired. Deserialization rejects a repository of an earlier layout whole and never
//! reinterprets it. Its store requires a fresh generation.

use alloc::borrow::Cow;

use crate::integrity::Sha256Digest;

#[cfg(test)]
mod tests;

/// A repository layout version this module implements.
///
/// Serialized as a plain integer. Deserialization admits no other value; increment on any layout
/// change.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[serde(into = "u32", try_from = "u32")]
pub(crate) enum RepositoryVersion {
    /// The resolved-recall layout, the only version a reader accepts.
    ///
    /// The recall evidence records the sampling resolution its verdict sample achieved, and the
    /// metadata document's configuration echo carries the recall check's sampling budget.
    V2 = 2,
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
            2 => Ok(Self::V2),
            _ => Err(UnknownRepositoryVersion(value)),
        }
    }
}

/// A repository version this module does not implement: retired or not yet defined.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UnknownRepositoryVersion(u32);

impl core::fmt::Display for UnknownRepositoryVersion {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(fmt, "unsupported repository version {}", self.0)
    }
}

impl core::error::Error for UnknownRepositoryVersion {}

/// A plain, visible file name within a repository directory.
///
/// Names contain no path separators or NUL bytes and never start with a dot. Files of one
/// repository live flat in its directory, and dot-prefixed entries are transient staging state
/// rather than published files. Pinned names borrow ([`pinned`](Self::pinned), validated at compile
/// time in const position). Names read from disk or documents own their text.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct FileName(Cow<'static, str>);

impl FileName {
    /// Wraps a plain, visible file name.
    ///
    /// Returns [`None`] when the name is empty, contains a path separator or NUL byte, or starts
    /// with a dot.
    #[must_use]
    pub(crate) fn new(name: impl Into<Cow<'static, str>>) -> Option<Self> {
        let name = name.into();

        Self::valid(&name).then_some(Self(name))
    }

    /// Wraps a pinned file name.
    ///
    /// # Panics
    ///
    /// This panics when the name is not a plain, visible file name. In const position the panic is
    /// a compile error, so a pinned name that exists is valid. For untrusted input, use
    /// [`Self::new`] instead.
    #[must_use]
    pub(crate) const fn pinned(name: &'static str) -> Self {
        assert!(
            Self::valid(name),
            "a pinned file name is nonempty, contains no path separator or NUL byte, and does not \
             start with a dot",
        );

        Self(Cow::Borrowed(name))
    }

    /// Returns the name.
    #[inline]
    #[must_use]
    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }

    const fn valid(name: &str) -> bool {
        let bytes = name.as_bytes();
        if bytes.is_empty() || bytes[0] == b'.' {
            return false;
        }

        let mut index = 0;
        while index < bytes.len() {
            if bytes[index] == b'/' || bytes[index] == 0 {
                return false;
            }
            index += 1;
        }

        true
    }
}

impl core::fmt::Display for FileName {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(&self.0)
    }
}

impl From<FileName> for String {
    #[inline]
    fn from(name: FileName) -> Self {
        name.0.into_owned()
    }
}

impl TryFrom<String> for FileName {
    type Error = InvalidFileName;

    fn try_from(name: String) -> Result<Self, Self::Error> {
        Self::new(name).ok_or(InvalidFileName)
    }
}

/// A name that is not a plain, visible file name.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct InvalidFileName;

impl core::fmt::Display for InvalidFileName {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(
            "a repository file name is nonempty, contains no path separator or NUL byte, and does \
             not start with a dot",
        )
    }
}

impl core::error::Error for InvalidFileName {}

/// One published file, identified by its name within the repository and the SHA-256 of its bytes.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RepositoryFile {
    pub name: FileName,
    pub hash: Sha256Digest,
}
