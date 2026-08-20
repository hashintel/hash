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
//! are immutable while the conventions around them stay mutable. The metadata document nested
//! inside the repository grows at a fixed version, so a field added there arrives without an
//! increment. Retired versions stay retired. Deserialization rejects a repository of an earlier
//! layout whole and never reinterprets it. Its store requires a fresh generation.

use alloc::borrow::Cow;
use core::{fmt, marker::PhantomData};

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

/// One artifact class of a repository: the pinned file name its bindings certify.
///
/// An implementation is a unit marker type. The name is an associated constant rather than a
/// stored field, so a binding cannot name one artifact and certify another, and every name is
/// checkable against its whole set at compile and test time.
pub(crate) trait Artifact {
    /// The artifact's pinned file name.
    const NAME: FileName;
}

/// A repository binding typed by the artifact it certifies.
///
/// The value is the digest alone. The file name derives from `A`, so two artifacts' bindings are
/// different types, and a manifest slot for one cannot take the other. Serialization matches
/// [`RepositoryFile`] byte for byte, and deserialization refuses an entry whose name is not
/// `A`'s own.
pub(crate) struct Binding<A> {
    hash: Sha256Digest,
    _artifact: PhantomData<fn(&A)>,
}

impl<A> Binding<A>
where
    A: Artifact,
{
    /// Binds a written artifact's digest.
    ///
    /// The digest is the SHA-256 of the staged file's bytes, accumulated by the write that
    /// produced them.
    #[must_use]
    pub(crate) const fn new(hash: Sha256Digest) -> Self {
        Self {
            hash,
            _artifact: PhantomData,
        }
    }

    /// Returns the artifact's pinned file name.
    #[expect(
        clippy::unused_self,
        reason = "the name is the artifact's constant, read through the value so call sites \
                  mirror `hash()`"
    )]
    #[must_use]
    pub(crate) const fn name(&self) -> FileName {
        A::NAME
    }

    /// Returns the digest of the bound file's bytes.
    #[must_use]
    pub(crate) const fn hash(&self) -> Sha256Digest {
        self.hash
    }

    /// Returns the binding as a plain repository file entry.
    #[must_use]
    pub(crate) const fn file(&self) -> RepositoryFile {
        RepositoryFile {
            name: A::NAME,
            hash: self.hash,
        }
    }
}

impl<A> fmt::Debug for Binding<A>
where
    A: Artifact,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Binding")
            .field("name", &A::NAME)
            .field("hash", &self.hash)
            .finish()
    }
}

impl<A> Copy for Binding<A> {}

impl<A> Clone for Binding<A> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<A> PartialEq for Binding<A> {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}

impl<A> Eq for Binding<A> {}

impl<A> serde::Serialize for Binding<A>
where
    A: Artifact,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.file().serialize(serializer)
    }
}

impl<'de, A> serde::Deserialize<'de> for Binding<A>
where
    A: Artifact,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let file = RepositoryFile::deserialize(deserializer)?;
        if file.name != A::NAME {
            return Err(serde::de::Error::custom(format_args!(
                "the {} entry names {}",
                A::NAME.as_str(),
                file.name.as_str(),
            )));
        }

        Ok(Self::new(file.hash))
    }
}
