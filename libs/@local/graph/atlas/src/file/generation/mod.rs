//! Generation directories: staging, atomic publish, activation, and open.
//!
//! A [`GenerationRoot`] stores generations in directories named by the SHA-256 of their metadata
//! document. [`GenerationRoot::current`] resolves the active generation, and
//! [`GenerationRoot::open`] verifies its metadata against that identity.
//!
//! [`StagedGeneration::seal`] atomically publishes a complete staging directory and syncs the root
//! before returning. Staging directories and pointer replacement files use dot prefixes.
//! [`GenerationRoot::activate`] and [`GenerationRoot::remove`] serialize through a persistent root
//! lock.

use core::{fmt, str::FromStr};
use std::{
    fs::{self, File},
    io::{self, Write as _},
};

use camino::{Utf8Path, Utf8PathBuf};
use uuid::Uuid;

use crate::integrity::{ParseHexError, Sha256Digest};

mod error;
mod open;
mod scratch;
mod staging;
#[cfg(test)]
mod tests;

pub use self::error::CurrentError;
pub(crate) use self::{
    error::{ActivateError, OpenError, RemoveError, SealError},
    open::Generation,
    scratch::ScratchDirectory,
    staging::{PublishedGeneration, StagedGeneration},
};

/// The metadata document's file name within a generation directory.
pub(crate) const METADATA_FILE: &str = "metadata.json";

/// The current-generation pointer's file name within the root.
const CURRENT_FILE: &str = "current";

/// The persistent root lock's file name.
const LOCK_FILE: &str = ".generation.lock";

/// The identity of one published generation, the SHA-256 of its metadata document.
///
/// The canonical lowercase hexadecimal form is both the directory name and serialized identity.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    schemars::JsonSchema,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[serde(transparent)]
#[schemars(transparent)]
#[repr(transparent)]
pub struct GenerationId(Sha256Digest);

impl GenerationId {
    #[inline]
    // salt/wire's tests.rs and fixtures.rs construct ids from raw digests
    #[cfg(test)]
    pub const fn from_digest(digest: Sha256Digest) -> Self {
        Self(digest)
    }

    /// Returns the digest of the generation's metadata document.
    #[inline]
    #[must_use]
    pub(crate) const fn digest(self) -> Sha256Digest {
        self.0
    }
}

impl fmt::Display for GenerationId {
    #[inline]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl FromStr for GenerationId {
    type Err = ParseHexError;

    #[inline]
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value.parse().map(Self)
    }
}

/// The directory of published generations.
#[derive(Debug, Clone)]
pub(crate) struct GenerationRoot {
    path: Utf8PathBuf,
}

impl GenerationRoot {
    /// Opens the root, creating the directory when absent.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the directory fails.
    pub(crate) fn new(path: impl Into<Utf8PathBuf>) -> io::Result<Self> {
        let path = path.into();
        fs::create_dir_all(&path)?;

        Ok(Self { path })
    }

    /// Returns the root directory.
    #[must_use]
    pub(crate) fn path(&self) -> &Utf8Path {
        &self.path
    }

    /// Returns the directory of the given generation.
    ///
    /// The directory exists exactly for published generations.
    #[must_use]
    pub(crate) fn generation_path(&self, id: GenerationId) -> Utf8PathBuf {
        self.path.join(id.to_string())
    }

    /// Creates a scratch directory for one run's transient state.
    ///
    /// Scratch storage uses the root's filesystem and a dot-prefixed directory name. Dropping the
    /// handle removes the directory and everything inside.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the directory fails.
    pub(crate) fn scratch(&self) -> io::Result<ScratchDirectory> {
        let path = self.path.join(format!(".scratch-{}", Uuid::now_v7()));
        fs::create_dir_all(&path)?;

        Ok(ScratchDirectory::new(path))
    }

    /// Creates a staging directory for assembling one generation.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the directory fails.
    pub(crate) fn stage(&self) -> io::Result<StagedGeneration> {
        let path = self.path.join(format!(".stage-{}", Uuid::now_v7()));
        fs::create_dir_all(&path)?;

        Ok(StagedGeneration::new(self.path.clone(), path))
    }

    /// Returns the active generation, or [`None`] before the first activation.
    ///
    /// # Errors
    ///
    /// Returns an error when reading the pointer fails or its content does not name a generation.
    pub(crate) fn current(&self) -> Result<Option<GenerationId>, CurrentError> {
        // Parsed, never mapped: the pointer is one hex line, rewritten
        // on every activation, and hand-editable for rollback.
        let content = match fs::read_to_string(self.path.join(CURRENT_FILE)) {
            Ok(content) => content,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(CurrentError::Io(error)),
        };

        content
            .trim_ascii()
            .parse()
            .map(Some)
            .map_err(CurrentError::Corrupt)
    }

    /// Points `current` at the given published generation.
    ///
    /// Concurrent [`current`](Self::current) reads observe the previous generation or this one,
    /// never a torn value. Activation and [`remove`](Self::remove) serialize through the root's
    /// exclusive lock.
    ///
    /// # Errors
    ///
    /// Returns an error when locking the root fails, this root has not published the generation, or
    /// replacing the pointer fails.
    #[tracing::instrument(skip_all, err, fields(generation = %id))]
    pub(crate) fn activate(&self, id: GenerationId) -> Result<(), ActivateError> {
        let _lock = self.lock()?;
        if !self.generation_path(id).is_dir() {
            return Err(ActivateError::Unpublished(id));
        }

        let temporary = self.path.join(format!(".current-{}", Uuid::now_v7()));

        let result = self.replace_pointer(&temporary, id);
        if result.is_err() {
            drop(fs::remove_file(&temporary));
        }

        result?;
        Ok(())
    }

    fn replace_pointer(&self, temporary: impl AsRef<Utf8Path>, id: GenerationId) -> io::Result<()> {
        let temporary = temporary.as_ref();

        let mut file = File::create(temporary)?;
        writeln!(file, "{id}")?;
        file.sync_all()?;

        fs::rename(temporary, self.path.join(CURRENT_FILE))?;
        File::open(&self.path)?.sync_all()?;

        Ok(())
    }

    fn lock(&self) -> io::Result<File> {
        // The lock file must retain its inode across acquisitions. Removing it would let concurrent
        // opens lock different files for the same root.
        let file = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.path().join(LOCK_FILE))?;
        file.lock()?;
        Ok(file)
    }

    /// Removes an inactive generation while excluding concurrent activation.
    ///
    /// Blocks until the root lock is available and holds it through removal and root
    /// synchronization. Open artifact descriptors remain valid after removal.
    ///
    /// # Errors
    ///
    /// Returns [`RemoveError`] for locking, current-pointer or filesystem failures, including a
    /// still-active generation. A filesystem failure can leave a partially removed directory.
    #[tracing::instrument(skip_all, err, fields(generation = %id))]
    pub(crate) fn remove(&self, id: GenerationId) -> Result<(), RemoveError> {
        let _lock = self.lock()?;
        if self.current()? == Some(id) {
            return Err(RemoveError::Active(id));
        }

        fs::remove_dir_all(self.generation_path(id))?;
        File::open(self.path())?.sync_all()?;
        Ok(())
    }

    /// Opens and verifies the published generation `id`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenError`] for an unpublished generation, an identity mismatch, an unparsable
    /// document, or a read failure.
    pub(crate) fn open(&self, id: GenerationId) -> Result<Generation, OpenError> {
        Generation::open(self, id)
    }
}
