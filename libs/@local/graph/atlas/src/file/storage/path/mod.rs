use alloc::borrow::Cow;
use core::{fmt, str::FromStr};

use bytes::Bytes;
use camino::{Utf8Path, Utf8PathBuf};
use tokio::{fs, io::AsyncBufRead};
use tokio_util::either::Either;

use self::error::FilePathError;
use super::{
    Revision, RevisionKind, Storage, WriteCondition, error::StorageError, local::LocalFile,
    s3::path::BucketPath,
};
use crate::file::generation::scratch::ScratchFile;

mod contents;
pub(crate) mod error;
#[cfg(test)]
mod tests;

pub(crate) use self::contents::{FileContents, FileOrigin};

#[derive(Debug, Clone)]
enum FilePathVariant {
    Local(Utf8PathBuf),
    Bucket(Box<BucketPath>),
}

/// A local file or an S3 object location.
#[derive(Debug, Clone)]
pub(crate) struct FilePath {
    variant: FilePathVariant,
}

impl FilePath {
    /// Appends a suffix using the destination's path syntax.
    ///
    /// Local suffixes follow filesystem path rules. S3 suffixes append literal key text, separated
    /// by a slash unless the prefix already ends in one.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if allocating the S3 path fails.
    pub(crate) fn join(&self, suffix: &str) -> Result<Self, FilePathError> {
        let variant = match &self.variant {
            FilePathVariant::Local(path) => FilePathVariant::Local(path.join(suffix)),
            FilePathVariant::Bucket(path) => FilePathVariant::Bucket(path.join(suffix)?),
        };

        Ok(Self { variant })
    }

    /// Opens a file together with the content revision used for conditional replacement.
    ///
    /// The revision identifies the opened contents. Local files require a complete SHA-256 read
    /// before returning a reader positioned at the start. S3 files retain the response's entity
    /// tag. Body failures after opening propagate through the reader.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening, local hashing or response metadata validation fails.
    pub(crate) async fn get(
        &self,
        storage: &Storage,
    ) -> Result<FileContents<impl AsyncBufRead + use<>>, StorageError> {
        match &self.variant {
            FilePathVariant::Local(path) => {
                let (revision, file) = LocalFile::new(path).get().await?;

                Ok(FileContents::new(
                    Either::Left(tokio::io::BufReader::new(file)),
                    revision,
                ))
            }
            FilePathVariant::Bucket(path) => {
                let (Some(etag), reader) = storage.s3()?.read(path).await? else {
                    return Err(StorageError::MissingEntityTag);
                };

                Ok(FileContents::new(
                    Either::Right(reader),
                    Revision(RevisionKind::Bucket(etag)),
                ))
            }
        }
    }

    /// Replaces the complete contents under a destination precondition.
    ///
    /// Local writes create parent directories and coordinate through a persistent directory lock.
    /// Replacement uses an atomic rename followed by parent-directory synchronization. Filesystem
    /// writers bypassing that lock can change contents independently. The local `.storage-` name
    /// prefix belongs to temporary storage and lock files. S3 writes make one request attempt.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the condition or write fails. A failure after local rename or a
    /// lost S3 response can leave the write's outcome unknown.
    #[tracing::instrument(skip_all, fields(path = %self), err)]
    pub(crate) async fn put(
        &self,
        storage: &Storage,
        body: Bytes,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        match &self.variant {
            FilePathVariant::Local(path) => {
                LocalFile::new(path).write(body.as_ref(), &condition).await
            }
            FilePathVariant::Bucket(path) => storage
                .s3()?
                .put(path, body, condition.as_s3()?)
                .await
                .map(|_| ()),
        }
    }

    /// Streams a local file into a conditionally replaced destination.
    ///
    /// The source must remain unchanged until transfer completes. Local destinations use the
    /// replacement and locking contract of [`Self::put`]. S3 destinations use multipart transfer
    /// when the file exceeds the single-request bound.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] for source access, destination preconditions or transfer failures.
    #[tracing::instrument(skip_all, fields(path = %self), err)]
    pub(crate) async fn upload(
        &self,
        storage: &Storage,
        source: impl AsRef<Utf8Path>,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        match &self.variant {
            FilePathVariant::Local(path) => {
                let source = fs::File::open(source.as_ref()).await?;
                LocalFile::new(path).write(source, &condition).await
            }
            FilePathVariant::Bucket(path) => {
                storage.s3()?.upload(path, source, condition.as_s3()?).await
            }
        }
    }

    /// Copies a source file under this destination's write precondition.
    ///
    /// S3-to-S3 copies remain remote. Other copies stream through a local source, downloading an S3
    /// source into the configured scratch directory first. Local sources must remain unchanged
    /// until transfer completes.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] for source access, destination preconditions or transfer failures.
    #[tracing::instrument(skip_all, fields(source = %source, destination = %self), err)]
    pub(crate) async fn copy_from(
        &self,
        storage: &Storage,
        source: &Self,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        if let (FilePathVariant::Bucket(source), FilePathVariant::Bucket(destination)) =
            (&source.variant, &self.variant)
        {
            return storage
                .s3()?
                .copy(source, destination, condition.as_s3()?)
                .await;
        }

        let local = source.sync_to_local(storage).await?;
        let result = self.upload(storage, local.as_ref(), condition).await;

        if let Cow::Owned(temporary) = local
            && let Err(error) = tokio::fs::remove_file(temporary).await
        {
            tracing::warn!(?error, "failed to remove temporary file");
        }

        result
    }

    /// Opens a file for incremental reading.
    ///
    /// The returned reader reports read failures after opening.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the backend is unavailable or opening the file fails.
    pub(crate) async fn read(
        &self,
        storage: &Storage,
    ) -> Result<impl AsyncBufRead + use<>, StorageError> {
        match &self.variant {
            FilePathVariant::Local(path) => {
                let file = tokio::fs::File::open(path).await?;
                Ok(Either::Left(tokio::io::BufReader::new(file)))
            }
            FilePathVariant::Bucket(path) => storage
                .s3()?
                .read(path)
                .await
                .map(|(_, reader)| Either::Right(reader)),
        }
    }

    /// Resolves an input to a local path using the configured scratch directory.
    ///
    /// Local paths borrow their existing spelling. Remote paths name uniquely created files in the
    /// scratch directory supplied to [`Storage`]. The directory's owner removes downloaded files
    /// after use.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the backend is unavailable, creating the destination fails or
    /// the transfer fails. A failed transfer attempts to remove its partial destination.
    pub(crate) async fn sync_to_local<'local>(
        &'local self,
        storage: &Storage,
    ) -> Result<Cow<'local, Utf8Path>, StorageError> {
        let path = match &self.variant {
            FilePathVariant::Local(path) => return Ok(Cow::Borrowed(path)),
            FilePathVariant::Bucket(path) => path,
        };

        let backend = storage.s3()?;

        let mut output = ScratchFile::new(&storage.scratch).await?;
        let result = backend.download(path, &mut output.file).await;

        output.finish(result).await.map(Cow::Owned)
    }

    /// Resolves an owned input using the scratch-file lifecycle of [`Self::sync_to_local`].
    ///
    /// # Errors
    ///
    /// Returns the errors from [`Self::sync_to_local`].
    pub(crate) async fn into_local_file(
        self,
        storage: &Storage,
    ) -> Result<Utf8PathBuf, StorageError> {
        let path = self.sync_to_local(storage).await?;

        match path {
            Cow::Owned(path) => Ok(path),
            Cow::Borrowed(_) => match self.variant {
                FilePathVariant::Local(path) => Ok(path),
                FilePathVariant::Bucket(_) => {
                    unreachable!("only local inputs resolve to borrowed paths")
                }
            },
        }
    }
}

impl fmt::Display for FilePath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.variant {
            FilePathVariant::Local(path) => fmt::Display::fmt(path, fmt),
            FilePathVariant::Bucket(path) => fmt::Display::fmt(path, fmt),
        }
    }
}

impl FromStr for FilePath {
    type Err = FilePathError;

    fn from_str(path: &str) -> Result<Self, Self::Err> {
        let variant = if path.starts_with("s3://") {
            FilePathVariant::Bucket(path.parse()?)
        } else {
            FilePathVariant::Local(Utf8PathBuf::from(path))
        };

        Ok(Self { variant })
    }
}
