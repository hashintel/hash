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

use alloc::collections::BTreeSet;
use core::{error::Error, fmt, str::FromStr};
use std::{
    ffi::OsString,
    fs::{self, File},
    io::{self, BufWriter, Write as _},
};

use camino::{Utf8Path, Utf8PathBuf};
use uuid::Uuid;

use super::{
    WriteAs,
    repository::{Artifact, Binding, FileName},
    salt::SaltRepository,
};
use crate::integrity::{ParseHexError, Sha256Digest};

mod lock;
mod open;
#[cfg(test)]
mod tests;

pub(crate) use self::open::{Generation, OpenError};

/// The metadata document's file name within a generation directory.
pub(crate) const METADATA_FILE: &str = "metadata.json";

/// The current-generation pointer's file name within the root.
const CURRENT_FILE: &str = "current";

/// A staging could not seal into a published generation.
#[derive(Debug)]
pub(crate) enum SealError {
    /// A manifest-listed file is absent from the staging directory.
    Missing {
        /// The absent file's name.
        name: FileName,
    },
    /// A staged file is not listed in the manifest.
    Unlisted {
        /// The unlisted file's name.
        name: OsString,
    },
    /// A generation with this metadata document is already published.
    AlreadyPublished(GenerationId),
    /// The metadata document failed to serialize.
    Document(serde_json::Error),
    /// A write, sync, or rename failed.
    Io(io::Error),
}

impl fmt::Display for SealError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing { name } => {
                write!(fmt, "the manifest-listed file {name} is not staged")
            }
            Self::Unlisted { name } => write!(
                fmt,
                "the staged file {} is not listed in the manifest",
                name.display(),
            ),
            Self::AlreadyPublished(id) => {
                write!(fmt, "generation {id} is already published")
            }
            Self::Document(error) => {
                write!(fmt, "the metadata document failed to serialize: {error}")
            }
            Self::Io(error) => write!(fmt, "the generation failed to persist: {error}"),
        }
    }
}

impl Error for SealError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Document(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Missing { .. } | Self::Unlisted { .. } | Self::AlreadyPublished(_) => None,
        }
    }
}

/// Reading the current-generation pointer failed.
#[derive(Debug)]
pub enum CurrentError {
    /// The pointer's content is not a generation id.
    Corrupt(ParseHexError),
    /// Reading the pointer failed.
    Io(io::Error),
}

impl fmt::Display for CurrentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Corrupt(error) => write!(
                fmt,
                "the current-generation pointer does not name a generation: {error}",
            ),
            Self::Io(error) => write!(
                fmt,
                "the current-generation pointer failed to read: {error}",
            ),
        }
    }
}

impl Error for CurrentError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Corrupt(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

/// Activating a generation failed.
#[derive(Debug)]
pub(crate) enum ActivateError {
    /// The generation is not published in this root.
    Unpublished(GenerationId),
    /// Locking the root or replacing the pointer failed.
    Io(io::Error),
}

impl fmt::Display for ActivateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(fmt, "generation {id} is not published in this root")
            }
            Self::Io(error) => write!(fmt, "generation activation failed: {error}"),
        }
    }
}

impl Error for ActivateError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Unpublished(_) => None,
            Self::Io(error) => Some(error),
        }
    }
}

impl From<io::Error> for ActivateError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

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

        Ok(StagedGeneration {
            root: self.path.clone(),
            path,
        })
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
}

/// A dot-prefixed directory for one run's transient working state.
///
/// Dropping the handle removes the whole directory.
#[derive(Debug)]
#[clippy::has_significant_drop]
pub(crate) struct ScratchDirectory {
    path: Utf8PathBuf,
}

impl ScratchDirectory {
    /// Adopts an existing directory as a scratch root.
    ///
    /// Dropping the value removes the directory and everything inside.
    pub(crate) const fn new(path: Utf8PathBuf) -> Self {
        Self { path }
    }

    /// Creates (or reuses) a named subdirectory and returns its path.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the subdirectory fails.
    pub(crate) fn directory(&self, name: &str) -> io::Result<Utf8PathBuf> {
        let path = self.path.join(name);
        fs::create_dir_all(&path)?;

        Ok(path)
    }

    /// Creates a named file directly under the scratch root and returns it with its path.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the scratch root or the file fails.
    pub(crate) fn file(&self, name: &str) -> io::Result<(Utf8PathBuf, File)> {
        let path = self.path.join(name);
        fs::create_dir_all(&self.path)?;

        File::create(&path).map(|file| (path, file))
    }
}

impl Drop for ScratchDirectory {
    fn drop(&mut self) {
        drop(fs::remove_dir_all(&self.path));
    }
}

/// Drops the write permission on a file about to publish.
///
/// Published files reject write handles. Removal uses the containing directory's permissions.
fn make_readonly(file: &File) -> io::Result<()> {
    let mut permissions = file.metadata()?.permissions();
    permissions.set_readonly(true);
    file.set_permissions(permissions)
}

/// A generation under assembly in a staging directory.
///
/// Staged files publish by rename without copying. Dropping an unsealed staging removes it.
#[derive(Debug)]
#[clippy::has_significant_drop]
pub(crate) struct StagedGeneration {
    root: Utf8PathBuf,
    path: Utf8PathBuf,
}

impl StagedGeneration {
    /// Creates (or truncates) a staged file for writing.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the file fails.
    pub(crate) fn create(&self, name: &FileName) -> io::Result<File> {
        File::create(self.path.join(name.as_str()))
    }

    /// Returns the path of a staged file.
    #[must_use]
    pub(crate) fn path_of(&self, name: &FileName) -> Utf8PathBuf {
        self.path.join(name.as_str())
    }

    /// Writes a value through its artifact's [`WriteAs`] implementation.
    ///
    /// The value writes itself into the artifact's pinned staged file through one buffered pass,
    /// and the written bytes' digest binds to the artifact as the typed entry the seal
    /// publishes. The values a given artifact accepts are its [`WriteAs`] impls.
    ///
    /// # Errors
    ///
    /// Returns an error when creating or flushing the staged file fails, and the value's own
    /// error when its write fails.
    #[expect(
        unused_variables,
        clippy::needless_pass_by_value,
        reason = "used to signal the artifact's pinned name"
    )]
    pub(crate) fn stage<A, V>(&self, artifact: A, value: V) -> Result<Binding<A>, V::Error>
    where
        A: Artifact,
        V: WriteAs<A, Error: From<io::Error>>,
    {
        let mut writer = BufWriter::new(self.create(&A::NAME)?);
        let hash = value.write_into(&mut writer)?;
        writer.flush()?;

        Ok(Binding::new(hash))
    }

    /// Runs `write` against the artifact's buffered staged file and binds the digest it returns.
    ///
    /// # Errors
    ///
    /// Returns an error when creating or flushing the staged file fails or when `write` fails.
    pub(crate) fn stage_with<A>(
        &self,
        _artifact: A,
        write: impl FnOnce(&mut BufWriter<File>) -> io::Result<Sha256Digest>,
    ) -> io::Result<Binding<A>>
    where
        A: Artifact,
    {
        let mut writer = BufWriter::new(self.create(&A::NAME)?);
        let hash = write(&mut writer)?;
        writer.flush()?;

        Ok(Binding::new(hash))
    }

    /// Seals the staging into a published generation.
    ///
    /// The staged file set must match the manifest exactly. Every file drops its write permission
    /// before publication. A successful seal syncs every file and the staging directory before the
    /// rename, then syncs the root directory. The returned generation is visible and durable.
    ///
    /// # Errors
    ///
    /// Returns an error when the manifest disagrees with the staged file set or names a
    /// generation that is already published. Serializing the metadata document returns an error
    /// when it fails. A write, sync, permission, or rename failure returns an error as well.
    pub(crate) fn seal(
        self,
        repository: &SaltRepository,
    ) -> Result<PublishedGeneration, SealError> {
        // Artifact names are distinct and exclude the metadata document's name.
        let expected: BTreeSet<FileName> = repository.files.files().map(|file| file.name).collect();

        let mut staged = BTreeSet::<FileName>::new();
        for entry in fs::read_dir(&self.path).map_err(SealError::Io)? {
            let name = entry.map_err(SealError::Io)?.file_name();
            match name
                .to_str()
                .and_then(|utf8| FileName::new(utf8.to_owned()))
            {
                Some(valid) => {
                    staged.insert(valid);
                }
                None => return Err(SealError::Unlisted { name }),
            }
        }

        if let Some(name) = expected.difference(&staged).next() {
            return Err(SealError::Missing { name: name.clone() });
        }
        if let Some(name) = staged.difference(&expected).next() {
            return Err(SealError::Unlisted {
                name: name.as_str().into(),
            });
        }

        let document = serde_json::to_vec_pretty(repository).map_err(SealError::Document)?;
        let id = GenerationId(Sha256Digest::of(&document));

        let destination = self.root.join(id.to_string());
        if destination.exists() {
            return Err(SealError::AlreadyPublished(id));
        }

        self.persist(&document, &staged, &destination)
            .map_err(SealError::Io)?;

        Ok(PublishedGeneration { id })
    }

    fn persist(
        &self,
        document: &[u8],
        staged: &BTreeSet<FileName>,
        destination: impl AsRef<Utf8Path>,
    ) -> io::Result<()> {
        let destination = destination.as_ref();
        let mut file = File::create(self.path.join(METADATA_FILE))?;
        file.write_all(document)?;
        file.sync_all()?;
        make_readonly(&file)?;

        for name in staged {
            let file = File::open(self.path.join(name.as_str()))?;
            file.sync_all()?;
            make_readonly(&file)?;
        }
        File::open(&self.path)?.sync_all()?;

        fs::rename(&self.path, destination)?;
        File::open(&self.root)?.sync_all()?;

        Ok(())
    }
}

impl Drop for StagedGeneration {
    fn drop(&mut self) {
        drop(fs::remove_dir_all(&self.path));
    }
}

/// A published generation's identity and directory.
#[derive(Debug)]
pub(crate) struct PublishedGeneration {
    pub id: GenerationId,
}

impl PublishedGeneration {
    /// Returns the generation's identity.
    #[inline]
    #[must_use]
    pub(crate) const fn id(&self) -> GenerationId {
        self.id
    }
}
