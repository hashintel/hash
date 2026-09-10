use camino::{Utf8Path, Utf8PathBuf};
use tokio::fs::{self, File, OpenOptions};
use uuid::Uuid;

use crate::file::storage::error::StorageError;

pub(crate) struct ScratchFile {
    pub file: File,
    path: Utf8PathBuf,
}

impl ScratchFile {
    /// Creates a unique input file in `directory`.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if creating the file fails.
    pub(crate) async fn new(directory: &Utf8Path) -> Result<Self, StorageError> {
        let path = directory.join(format!("input-{}", Uuid::now_v7()));
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .await?;

        Ok(Self { file, path })
    }

    /// Retains a completed input or removes a failed transfer's partial file.
    ///
    /// # Errors
    ///
    /// Returns the original transfer error after attempting to remove the partial file.
    pub(crate) async fn finish(
        self,
        result: Result<(), StorageError>,
    ) -> Result<Utf8PathBuf, StorageError> {
        drop(self.file);

        if let Err(error) = result {
            drop(fs::remove_file(&self.path).await);
            return Err(error);
        }

        Ok(self.path)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;
    use std::{fs, io};

    use tokio::io::AsyncWriteExt as _;

    use super::ScratchFile;
    use crate::file::storage::{error::StorageError, tests::TemporaryDirectory};

    #[tokio::test]
    async fn finish_distinct_files() {
        let directory = TemporaryDirectory::new();
        let mut first = ScratchFile::new(directory.path())
            .await
            .expect("should create the first input");
        let mut second = ScratchFile::new(directory.path())
            .await
            .expect("should create the second input");
        first
            .file
            .write_all(b"first body")
            .await
            .expect("should write the first input");
        first
            .file
            .flush()
            .await
            .expect("should finish writing the first input");
        second
            .file
            .write_all(b"second body")
            .await
            .expect("should write the second input");
        second
            .file
            .flush()
            .await
            .expect("should finish writing the second input");
        let first = first
            .finish(Ok(()))
            .await
            .expect("should retain the first input");
        let second = second
            .finish(Ok(()))
            .await
            .expect("should retain the second input");
        assert_ne!(
            first, second,
            "should choose distinct names in the shared directory"
        );
        assert_eq!(
            first.parent(),
            Some(directory.path()),
            "should use the supplied scratch directory"
        );
        assert_eq!(
            second.parent(),
            Some(directory.path()),
            "should use the supplied scratch directory"
        );
        assert_eq!(
            fs::read(first).expect("should read the first input"),
            b"first body"
        );
        assert_eq!(
            fs::read(second).expect("should read the second input"),
            b"second body"
        );
        assert_eq!(
            directory.entry_count(),
            2,
            "should retain both completed inputs"
        );
    }

    #[tokio::test]
    async fn finish_partial_failure() {
        let directory = TemporaryDirectory::new();
        let sentinel = directory.path().join("retained.bin");
        fs::write(&sentinel, b"retained").expect("should create an unrelated file");
        let mut partial = ScratchFile::new(directory.path())
            .await
            .expect("should create the partial input");
        partial
            .file
            .write_all(b"short")
            .await
            .expect("should write the initial bytes");
        partial
            .file
            .flush()
            .await
            .expect("should finish writing the initial bytes");
        let error = partial
            .finish(Err(StorageError::Io(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "fixture transfer failure",
            ))))
            .await
            .expect_err("should preserve the transfer error");
        assert_matches!(error, StorageError::Io(error) if error.kind() == io::ErrorKind::UnexpectedEof);
        assert_eq!(
            directory.entry_count(),
            1,
            "should remove only the partial input"
        );
        assert_eq!(
            fs::read(sentinel).expect("should retain the unrelated file"),
            b"retained"
        );
    }
}
