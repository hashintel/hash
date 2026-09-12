//! Assembling one generation in a staging directory before it publishes.

use alloc::collections::BTreeSet;
use std::{
    fs::{self, File},
    io::{self, BufWriter, Write as _},
};

use camino::{Utf8Path, Utf8PathBuf};

use super::{GenerationId, METADATA_FILE, SealError};
use crate::{
    file::{
        WriteAs,
        repository::{Artifact, Binding, FileName},
        salt::SaltRepository,
    },
    integrity::Sha256Digest,
};

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
    /// Adopts a staging directory under `root`.
    ///
    /// Dropping the value removes the staging directory and everything inside.
    pub(super) const fn new(root: Utf8PathBuf, path: Utf8PathBuf) -> Self {
        Self { root, path }
    }

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
