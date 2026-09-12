//! Assembling one generation in a staging directory before it publishes.

use alloc::collections::BTreeSet;
use std::{
    fs::{self, File},
    io::{self, BufWriter, Write as _},
};

use camino::{Utf8Path, Utf8PathBuf};

use super::{GenerationDocument, GenerationId, METADATA_FILE, SealError};
use crate::{
    file::{
        WriteAs,
        repository::{Artifact, Binding, FileName},
        salt::SaltRepository,
    },
    integrity::Sha256Digest,
};

#[cfg(test)]
mod tests;

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

    fn validate_files(&self, repository: &SaltRepository) -> Result<BTreeSet<FileName>, SealError> {
        // artifact names are distinct and exclude the metadata document's name.
        let expected: BTreeSet<FileName> = repository.files.files().map(|file| file.name).collect();

        let mut staged = BTreeSet::<FileName>::new();
        for entry in self.path.read_dir_utf8()? {
            let entry = entry?;
            let name = entry.file_name();

            match FileName::new(name.to_owned()) {
                Some(valid) => {
                    staged.insert(valid);
                }
                None => {
                    return Err(SealError::Unlisted {
                        name: name.to_owned(),
                    });
                }
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

        Ok(staged)
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

    fn publish(
        self,
        id: GenerationId,
        document: &[u8],
        staged: &BTreeSet<FileName>,
    ) -> Result<PublishedGeneration, SealError> {
        let destination = self.root.join(id.to_string());
        if destination.exists() {
            return Err(SealError::AlreadyPublished(id));
        }

        self.persist(document, staged, &destination)?;
        Ok(PublishedGeneration { id })
    }

    /// Seals the staging into a published generation.
    ///
    /// The staged file set must match the manifest exactly. Every file drops its write permission
    /// before publication. A successful seal syncs every file and the staging directory before the
    /// rename, then syncs the root directory. The returned generation is visible and durable.
    ///
    /// # Errors
    ///
    /// Returns [`SealError`] if the staged file set differs from the manifest, serialization fails
    /// or publication fails. An error after rename can leave the generation visible.
    pub(crate) fn seal(
        self,
        repository: &SaltRepository,
    ) -> Result<PublishedGeneration, SealError> {
        let staged = self.validate_files(repository)?;
        let document = serde_json::to_vec_pretty(repository)?;
        let id = GenerationId(Sha256Digest::of(&document));

        self.publish(id, &document, &staged)
    }

    /// Publishes staged artifacts with the original metadata bytes and identity.
    ///
    /// The file-set and persistence requirements are those of [`Self::seal`]. Publication preserves
    /// the metadata encoding from [`GenerationDocument`], including its whitespace.
    ///
    /// # Errors
    ///
    /// Returns [`SealError`] if the staged file set differs from the document or publication fails.
    /// An error after rename can leave the generation visible.
    pub(crate) fn import(
        self,
        document: &GenerationDocument,
    ) -> Result<PublishedGeneration, SealError> {
        let staged = self.validate_files(document.repository())?;
        self.publish(document.id(), document.bytes(), &staged)
    }
}

impl Drop for StagedGeneration {
    fn drop(&mut self) {
        if let Err(error) = fs::remove_dir_all(&self.path)
            && error.kind() != io::ErrorKind::NotFound
        {
            tracing::warn!(path = %self.path, ?error, "failed to remove staging directory");
        }
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
