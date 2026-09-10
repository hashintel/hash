//! Atomic local replacement and content revisions for cooperating storage writers.

use core::pin::pin;
use std::io;

use camino::Utf8Path;
use tokio::{
    fs::{self, File},
    io::{AsyncRead, AsyncSeekExt as _, BufReader},
};
use uuid::Uuid;

use super::{Revision, RevisionKind, WriteCondition, error::StorageError};
use crate::{
    file::generation::ScratchDirectory,
    integrity::{Sha256, Writer},
};

#[cfg(test)]
mod tests;

/// A local storage destination whose writers share a persistent parent-directory lock.
///
/// Names beginning with `.storage-` belong to replacement files and locks. Conditional writes
/// coordinate storage operations on the same path. Filesystem writers that bypass this lock can
/// change contents independently.
pub(crate) struct LocalFile<'path> {
    path: &'path Utf8Path,
}

impl<'path> LocalFile<'path> {
    pub(crate) const fn new(path: &'path Utf8Path) -> Self {
        Self { path }
    }

    /// Opens the contents and hashes them before rewinding the reader.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening, hashing or rewinding fails.
    pub(crate) async fn get(&self) -> Result<(Revision, File), StorageError> {
        let file = fs::File::open(self.path).await?;

        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: tokio::io::sink(),
        };

        let mut reader = BufReader::new(file);
        tokio::io::copy_buf(&mut reader, &mut writer).await?;
        let mut file = reader.into_inner();

        file.rewind().await?;

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
    #[expect(
        clippy::create_dir,
        reason = "a staging directory must have a fresh name"
    )]
    pub(crate) async fn write(
        &self,
        mut source: impl AsyncRead,
        condition: &WriteCondition,
    ) -> Result<(), StorageError> {
        // we uses `.storage-` prefixed files for temporary allocation
        if self.path.file_name().is_none()
            || self
                .path
                .iter()
                .any(|component| component.starts_with(".storage-"))
        {
            return Err(StorageError::InvalidLocalDestination);
        }

        if matches!(
            condition,
            WriteCondition::Match(Revision(RevisionKind::Bucket(_)))
        ) {
            return Err(StorageError::RevisionMismatch);
        }

        let parent = self
            .path
            .parent()
            .filter(|path| !path.as_str().is_empty())
            .unwrap_or_else(|| Utf8Path::new("."));
        fs::create_dir_all(parent).await?;

        // readers should be able to see and observe the complete directory structure,
        // this allows us to skip the `sync_all` call on each ancestor after the rename.
        for ancestor in parent.ancestors() {
            let ancestor = if ancestor.as_str().is_empty() {
                Utf8Path::new(".")
            } else {
                ancestor
            };

            File::open(ancestor).await?.sync_all().await?;
        }

        // Persistent lock file, same inode, so that concurrent writers detect contention.
        let lock = fs::File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(parent.join(".storage-lock"))
            .await?;

        // `asyncify` for locks, see: https://github.com/tokio-rs/tokio/issues/7523
        let file = lock.into_std().await;
        let file = tokio::task::spawn_blocking(|| file.lock().map(|()| file)).await??;
        let file = fs::File::from_std(file);

        // given the lock, we can now be sure that we're the only writer, therefore check the write
        // condition now. This has TOCTOU potential, but only through external processes.
        match condition {
            WriteCondition::Any => {}
            WriteCondition::Absent => match fs::symlink_metadata(self.path).await {
                Ok(_) => return Err(StorageError::PreconditionFailed),
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            },
            WriteCondition::Match(Revision(RevisionKind::Local(expected))) => {
                match self.get().await {
                    Ok((Revision(RevisionKind::Local(actual)), _)) if actual == *expected => {}
                    Ok(_) => return Err(StorageError::PreconditionFailed),
                    Err(error) if error.is_not_found() => {
                        return Err(StorageError::PreconditionFailed);
                    }
                    Err(error) => return Err(error),
                }
            }
            WriteCondition::Match(Revision(RevisionKind::Bucket(_))) => {
                return Err(StorageError::RevisionMismatch);
            }
        }

        // stage the temporary file, to make sure that readers are only able to observe the complete
        // contents. we do all the operations here and only once finished we rename it to the final
        // destination.
        let scratch = parent.join(format!(".storage-{}", Uuid::now_v7()));
        fs::create_dir(&scratch).await?;

        let scratch = ScratchDirectory::new(scratch);
        let (temporary, mut file) = scratch.file("contents")?;
        let file = fs::File::from_std(file);

        let mut source = pin!(source);
        tokio::io::copy(&mut source, &mut file).await?;

        file.sync_all().await?;
        drop(file);

        fs::rename(&temporary, self.path).await?;

        // sync the directory (inode) to make sure the rename is visible to readers
        File::open(parent).await?.sync_all().await?;

        drop(scratch);
        drop(lock);
        Ok(())
    }
}
