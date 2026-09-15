//! Atomic local replacement and content revisions for cooperating storage writers.
use core::{io, io::Seek as _};
use std::fs;

use camino::Utf8Path;
use uuid::Uuid;

use super::{Revision, RevisionKind, error::StorageError};
use crate::{
    file::generation::ScratchDirectory,
    integrity::{Sha256, Sha256Digest, Writer},
};

#[cfg(test)]
mod tests;

/// A precondition checked atomically with destination replacement.
#[derive(Debug, Copy, Clone)]
pub(crate) enum WriteCondition {
    /// Replaces the destination regardless of its current contents.
    Any,
    /// Creates the destination only when it does not exist.
    Absent,
    /// Replaces the destination only when its content identity matches the captured revision.
    Match(Sha256Digest),
}

/// A local storage destination whose writers share a persistent parent-directory lock.
///
/// Names beginning with `.storage-` belong to replacement files and locks. Conditional writes
/// coordinate storage operations on the same path. Filesystem writers that bypass this lock can
/// change contents independently.
pub(crate) struct LocalFile<'path> {
    path: &'path Utf8Path,
}

impl<'path> LocalFile<'path> {
    /// Names a destination without opening or creating anything.
    pub(crate) const fn new(path: &'path Utf8Path) -> Self {
        Self { path }
    }

    /// Opens the contents and hashes them before rewinding the reader.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening, hashing or rewinding fails.
    pub(crate) async fn get(&self) -> Result<(Revision, tokio::fs::File), StorageError> {
        let path = self.path.to_path_buf();

        tokio::task::spawn_blocking(|| {
            let (revision, file) = Self::get_sync(path)?;

            Ok((revision, tokio::fs::File::from_std(file)))
        })
        .await?
    }

    fn get_sync(path: impl AsRef<Utf8Path>) -> Result<(Revision, fs::File), StorageError> {
        let file = fs::File::open(path.as_ref())?;

        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: io::sink(),
        };

        let mut reader = alloc::io::BufReader::new(file);
        alloc::io::copy(&mut reader, &mut writer)?;

        let mut file = reader.into_inner();
        file.rewind()?;

        Ok((
            Revision(RevisionKind::Local(writer.accumulator.finalize())),
            file,
        ))
    }

    /// Replaces the destination atomically after checking its precondition under the lock.
    ///
    /// Staging preserves the previous contents if reading the source fails. The lock serializes
    /// precondition checks with replacement to prevent lost updates.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if preparation, the precondition or publication fails. An error
    /// after rename can leave the new contents visible.
    pub(crate) async fn write(
        &self,
        source: impl alloc::io::Read + Send + 'static,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        let dest = self.path.to_path_buf();

        tokio::task::spawn_blocking(move || Self::write_sync(dest, source, condition)).await?
    }

    pub(crate) fn write_sync(
        dest: impl AsRef<Utf8Path>,
        source: impl alloc::io::Read,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        let dest = dest.as_ref();

        // we reserve `.storage-` names for the staging directory and shared lock.
        if dest.file_name().is_none()
            || dest
                .iter()
                .any(|component| component.starts_with(".storage-"))
        {
            return Err(StorageError::InvalidLocalDestination);
        }

        let parent = dest
            .parent()
            .filter(|path| !path.as_str().is_empty())
            .unwrap_or_else(|| Utf8Path::new("."));
        fs::create_dir_all(parent)?;

        // we persist newly created directory entries before publication, then sync the
        // destination's parent again after rename.
        for ancestor in parent.ancestors() {
            let ancestor = if ancestor.as_str().is_empty() {
                Utf8Path::new(".")
            } else {
                ancestor
            };

            if let Err(error) = fs::File::open(ancestor).and_then(|file| file.sync_all()) {
                tracing::warn!(%ancestor, %error, "failed to sync ancestor directory");
                break; // unlikely that we're able to sync any further
            }
        }

        // keep the lock file in place so cooperating writers continue to lock the same inode.
        let lock = fs::File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(parent.join(".storage-lock"))?;
        lock.lock()?;

        // the held lock keeps other cooperating writers waiting through the condition check and
        // the replacement.
        match condition {
            WriteCondition::Any => {}
            WriteCondition::Absent => match fs::symlink_metadata(dest) {
                Ok(_) => return Err(StorageError::PreconditionFailed),
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            },
            WriteCondition::Match(expected) => match Self::get_sync(dest) {
                Ok((Revision(RevisionKind::Local(actual)), _)) if actual == expected => {}
                Ok(_) => return Err(StorageError::PreconditionFailed),
                Err(error) if error.is_not_found() => {
                    return Err(StorageError::PreconditionFailed);
                }
                Err(error) => return Err(error),
            },
        }

        // we prepare the new contents beside the destination and publish them with rename only
        // after the file is complete and synced.
        let scratch = parent.join(format!(".storage-{}", Uuid::now_v7()));

        #[expect(
            clippy::create_dir,
            reason = "intentional, we made sure that the directory already exists"
        )]
        fs::create_dir(&scratch)?;

        let scratch = ScratchDirectory::new(scratch);
        let (temporary, mut file) = scratch.file("contents")?;

        alloc::io::copy(&mut alloc::io::BufReader::new(source), &mut file)?;

        file.sync_all()?;
        drop(file);

        fs::rename(&temporary, dest)?;

        // now sync the destination's parent directory to persist the replacement entry.
        if let Err(error) = fs::File::open(parent).and_then(|file| file.sync_all()) {
            tracing::warn!(%error, %parent, "failed to sync parent directory");
        }

        drop(scratch);
        drop(lock);
        Ok(())
    }
}
