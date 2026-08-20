//! Generation directories: staging, atomic publish, activation, and open.
//!
//! A [`GenerationRoot`] holds published generations, one directory per generation, named by the
//! SHA-256 of the generation's metadata document. Beside them sits the `current` pointer file
//! naming the active generation. [`GenerationRoot::stage`] assembles a generation in a dot-prefixed
//! staging directory. [`StagedGeneration::seal`] writes the metadata document and renames the
//! directory into place, and [`GenerationRoot::activate`] replaces the pointer atomically. Readers
//! resolve the pointer ([`GenerationRoot::current`]) and open the named generation
//! ([`GenerationRoot::open`]), which verifies the document against the hash that names the
//! directory.
//!
//! Every visible entry of the root is a complete generation or the pointer. Dot prefixes mark
//! staging directories and the pointer's replacement file, and the rename into place is atomic, so
//! a failed or interrupted publish leaves only dot-prefixed transients behind, never a partial
//! generation. Sealing syncs the staged files before the rename and the root directory after it, so
//! a generation that is visible is also durable.

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
    WriteAs, WriteInto,
    repository::{Artifact, Binding, FileName},
    salt::SaltRepository,
};
use crate::integrity::{ParseHexError, Sha256, Sha256Digest, Update as _};

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
    /// Replacing the pointer failed.
    Io(io::Error),
}

impl fmt::Display for ActivateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(fmt, "generation {id} is not published in this root")
            }
            Self::Io(error) => write!(
                fmt,
                "the current-generation pointer failed to replace: {error}",
            ),
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

/// The identity of one published generation, the SHA-256 of its metadata document.
///
/// The canonical lowercase hexadecimal form names the generation's directory, so the directory name
/// is verifiable against the document it holds. It is also the serialized form, so a metadata
/// document naming a prior generation names a checkable directory.
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
)]
#[serde(transparent)]
#[schemars(transparent)]
pub struct GenerationId(Sha256Digest);

impl GenerationId {
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
    /// Search-backend environments and other non-artifact working state live here: inside the root,
    /// so the space is on the filesystem sized for generations, and dot-prefixed, so no listing
    /// mistakes it for one. Dropping the handle removes the directory and everything inside.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the directory fails.
    pub(crate) fn scratch(&self) -> io::Result<ScratchDirectory> {
        let path = self.path.join(format!(".scratch-{}", Uuid::now_v7()));
        fs::create_dir_all(&path)?;

        Ok(ScratchDirectory { path })
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
    /// This replaces the pointer atomically, so a concurrent [`current`](Self::current) reads the
    /// previous generation or this one, never a torn value.
    ///
    /// # Errors
    ///
    /// Returns an error when this root has not published the generation or when replacing the
    /// pointer fails.
    pub(crate) fn activate(&self, id: GenerationId) -> Result<(), ActivateError> {
        if !self.generation_path(id).is_dir() {
            return Err(ActivateError::Unpublished(id));
        }

        let temporary = self.path.join(format!(".current-{}", Uuid::now_v7()));

        let result = self.replace_pointer(&temporary, id);
        if result.is_err() {
            drop(fs::remove_file(&temporary));
        }

        result.map_err(ActivateError::Io)
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
/// Nothing here is an artifact. The run that creates the contents also consumes them, and dropping
/// the handle removes the whole directory.
#[derive(Debug)]
#[clippy::has_significant_drop]
pub(crate) struct ScratchDirectory {
    path: Utf8PathBuf,
}

impl ScratchDirectory {
    /// Adopts an existing directory as a scratch root.
    ///
    /// Dropping the value removes the directory and everything inside.
    pub(crate) const fn rooted(path: Utf8PathBuf) -> Self {
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

    pub(crate) fn write<A>(&self, name: &str, artifact: A) -> io::Result<Utf8PathBuf>
    where
        A: WriteInto<Error = io::Error>,
    {
        let (path, file) = self.file(name)?;
        let mut writer = BufWriter::new(file);

        let _digest = artifact.write_into(&mut writer)?;
        writer.flush()?;

        Ok(path)
    }
}

impl Drop for ScratchDirectory {
    fn drop(&mut self) {
        drop(fs::remove_dir_all(&self.path));
    }
}

/// Drops the write permission on a file about to publish.
///
/// A published file is immutable, so rewriting one becomes an OS error, while removal keeps
/// working through the containing directory's permissions.
fn make_readonly(file: &File) -> io::Result<()> {
    let mut permissions = file.metadata()?.permissions();
    permissions.set_readonly(true);
    file.set_permissions(permissions)
}

/// A generation under assembly in a staging directory.
///
/// Stages write their artifacts directly into the staging directory through
/// [`create`](Self::create) and map them back through [`path_of`](Self::path_of), so sealing
/// renames files already in place and never copies. Dropping an unsealed staging removes it.
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

    /// Stages one value as the artifact it is admitted to write.
    ///
    /// The value writes itself into the artifact's pinned staged file through one buffered pass,
    /// and the written bytes' digest binds to the artifact as the typed entry the seal
    /// publishes. The values a given artifact accepts are its [`WriteAs`] impls.
    ///
    /// # Errors
    ///
    /// Returns an error when creating or flushing the staged file fails, and the value's own
    /// error when its write fails.
    #[expect(unused_variables, reason = "used to signal the artifact's pinned name")]
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
    /// The streaming escape for artifacts whose bytes no single value serializes, so the binding
    /// stays typed while the write stays free.
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
    /// The staged file set must match the manifest exactly. Sealing writes the metadata document
    /// beside the staged files and syncs every file and the directory. Every file drops its write
    /// permission before the rename, so rewriting a published path fails with an OS error while
    /// removal keeps working through the directory's own permissions. It then renames the
    /// directory into place under the document's SHA-256 and syncs the root directory after the
    /// rename. The returned generation is therefore visible and durable, and a failure leaves the
    /// staging as it was.
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
        // Typed bindings pin every manifest name: the artifact set holds the names distinct
        // and off the metadata document's own, so the expected set is the manifest's names
        // verbatim and the seal re-checks neither fact.
        let expected: BTreeSet<FileName> = repository.files.files().map(|file| file.name).collect();

        // Manifest names are valid `FileName`s by construction, so this
        // loop reports a staged name that is not one as unlisted before
        // any comparison.
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
        let id = GenerationId(document_digest(&document));

        let destination = self.root.join(id.to_string());
        if destination.exists() {
            return Err(SealError::AlreadyPublished(id));
        }

        self.persist(&document, &staged, &destination)
            .map_err(SealError::Io)?;

        Ok(PublishedGeneration {
            id,
            path: destination,
        })
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
        // Sealing renames the staging away, so removing the stale
        // staging path is then a no-op.
        drop(fs::remove_dir_all(&self.path));
    }
}

/// Digests a metadata document.
///
/// The bytes' SHA-256 is the identity of the generation publishing them.
pub(crate) fn document_digest(bytes: &[u8]) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize()
}

/// A published generation's identity and directory.
#[derive(Debug)]
pub(crate) struct PublishedGeneration {
    pub id: GenerationId,
    pub path: Utf8PathBuf,
}

impl PublishedGeneration {
    /// Returns the generation's identity.
    #[inline]
    #[must_use]
    pub(crate) const fn id(&self) -> GenerationId {
        self.id
    }

    /// Returns the generation's directory.
    #[inline]
    #[must_use]
    pub(crate) fn path(&self) -> &Utf8Path {
        &self.path
    }
}
