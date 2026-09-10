use alloc::borrow::Cow;
use core::{fmt, str::FromStr};

use camino::{Utf8Path, Utf8PathBuf};
use tokio::{
    fs::{self, OpenOptions},
    io::AsyncBufRead,
};
use tokio_util::either::Either;
use uuid::Uuid;

use self::error::FilePathError;
use super::{Storage, error::StorageError, s3::path::S3Path};

pub(crate) mod error;
#[cfg(test)]
mod tests;

#[derive(Debug)]
enum FilePathVariant {
    Local(Utf8PathBuf),
    S3(Box<S3Path>),
}

/// A local file or an S3 object location.
#[derive(Debug)]
pub(crate) struct FilePath {
    variant: FilePathVariant,
}

impl FilePath {
    pub(crate) fn as_s3(&self) -> Option<&S3Path> {
        match &self.variant {
            FilePathVariant::Local(_) => None,
            FilePathVariant::S3(path) => Some(path),
        }
    }

    /// Opens a file for incremental reading.
    ///
    /// Read failures after opening are reported by the returned reader.
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
            FilePathVariant::S3(path) => storage.s3()?.read(path).await.map(Either::Right),
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
            FilePathVariant::S3(path) => path,
        };

        let backend = storage.s3()?;
        let destination = storage.scratch.join(format!("input-{}", Uuid::now_v7()));

        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&destination)
            .await?;

        let result = backend.download(path, &mut output).await;
        drop(output);

        if let Err(error) = result {
            drop(fs::remove_file(&destination).await);
            return Err(error);
        }

        Ok(Cow::Owned(destination))
    }
}

impl fmt::Display for FilePath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.variant {
            FilePathVariant::Local(path) => fmt::Display::fmt(path, fmt),
            FilePathVariant::S3(path) => fmt::Display::fmt(path, fmt),
        }
    }
}

impl FromStr for FilePath {
    type Err = FilePathError;

    fn from_str(path: &str) -> Result<Self, Self::Err> {
        let variant = if path.starts_with("s3://") {
            FilePathVariant::S3(path.parse()?)
        } else {
            FilePathVariant::Local(Utf8PathBuf::from(path))
        };

        Ok(Self { variant })
    }
}
