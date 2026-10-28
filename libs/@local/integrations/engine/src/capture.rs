use std::{
    fs::File,
    io,
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use tempfile::NamedTempFile;

/// Reports why a source capture could not be read or published.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum CaptureError {
    #[display("the source capture query failed")]
    Query,
    #[display("the source capture could not be read")]
    Read,
    #[display("the source capture could not be written")]
    Write,
    #[display("a capture already exists at `{}`", path.display())]
    Exists { path: PathBuf },
    #[display("`{}` is one of the workspace's own files", path.display())]
    WorkspaceFile { path: PathBuf },
    #[display("source capture was cancelled")]
    Cancelled,
    #[display("the workspace thread stopped before source capture finished")]
    Stopped,
}

/// A published Parquet file containing the rows captured from a source.
///
/// Capture operations never replace a published file. The caller binds its path to a source and
/// run identity, and reopens that path on retry instead of reading the live source again.
#[derive(Debug, Clone)]
pub struct SourceCapture {
    path: PathBuf,
    rows: u64,
    bytes: u64,
}

impl SourceCapture {
    /// Reads the Parquet footer at `path` to recover a published capture's row and byte counts.
    ///
    /// # Errors
    ///
    /// Returns [`CaptureError::Read`] if the file or its Parquet footer cannot be read.
    pub fn open(path: PathBuf) -> Result<Self, Report<CaptureError>> {
        let file = File::open(&path).change_context(CaptureError::Read)?;
        let bytes = file.metadata().change_context(CaptureError::Read)?.len();
        let reader =
            ParquetRecordBatchReaderBuilder::try_new(file).change_context(CaptureError::Read)?;
        let rows = u64::try_from(reader.metadata().file_metadata().num_rows())
            .change_context(CaptureError::Read)?;
        Ok(Self { path, rows, bytes })
    }

    /// Copies a local Parquet `source` to a new capture at `target`.
    ///
    /// The copy is synced and its footer checked before publication. This performs blocking file
    /// IO; async callers should run it on a blocking thread.
    ///
    /// # Errors
    ///
    /// Returns [`CaptureError::Read`] for an unreadable source or invalid footer,
    /// [`CaptureError::Write`] for a failed copy or sync, or [`CaptureError::Exists`] if `target`
    /// already exists.
    pub fn copy_from(source: &Path, target: &Path) -> Result<Self, Report<CaptureError>> {
        let mut partial = Self::stage(target)?;
        let mut input = File::open(source).change_context(CaptureError::Read)?;
        io::copy(&mut input, partial.as_file_mut()).change_context(CaptureError::Write)?;
        let copied = Self::open(partial.path().to_owned())?;
        Self::publish(partial, target, copied.rows)
    }

    /// The published file to bind to the run's source identity.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The number of rows recorded in the Parquet footer.
    #[must_use]
    pub const fn rows(&self) -> u64 {
        self.rows
    }

    /// The size of the published Parquet file in bytes.
    #[must_use]
    pub const fn bytes(&self) -> u64 {
        self.bytes
    }

    fn directory(target: &Path) -> &Path {
        target
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."))
    }

    pub(crate) fn stage(target: &Path) -> Result<NamedTempFile, Report<CaptureError>> {
        if target.symlink_metadata().is_ok() {
            return Err(Report::new(CaptureError::Exists {
                path: target.to_owned(),
            }));
        }
        NamedTempFile::new_in(Self::directory(target)).change_context(CaptureError::Write)
    }

    pub(crate) fn publish(
        partial: NamedTempFile,
        target: &Path,
        rows: u64,
    ) -> Result<Self, Report<CaptureError>> {
        let file = partial.as_file();
        file.sync_all().change_context(CaptureError::Write)?;
        let bytes = file.metadata().change_context(CaptureError::Write)?.len();
        let file = partial.persist_noclobber(target).map_err(|error| {
            let context = if error.error.kind() == io::ErrorKind::AlreadyExists {
                CaptureError::Exists {
                    path: target.to_owned(),
                }
            } else {
                CaptureError::Write
            };
            Report::new(error.error).change_context(context)
        })?;
        drop(file);
        File::open(Self::directory(target))
            .and_then(|directory| directory.sync_all())
            .change_context(CaptureError::Write)?;
        Ok(Self {
            path: target.to_owned(),
            rows,
            bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write as _};

    use tempfile::TempDir;

    use super::{CaptureError, SourceCapture};

    #[test]
    fn publish_competing_writers() {
        let directory = TempDir::new().expect("should create a directory");
        let target = directory.path().join("capture.parquet");
        let mut first = SourceCapture::stage(&target).expect("the first writer should stage");
        let mut second = SourceCapture::stage(&target).expect("the second writer should stage");
        first
            .write_all(b"first")
            .expect("should write the first file");
        second
            .write_all(b"second")
            .expect("should write the second file");
        SourceCapture::publish(first, &target, 1).expect("the first writer should publish");
        let error = SourceCapture::publish(second, &target, 2)
            .expect_err("the second writer should preserve the first capture");
        assert!(matches!(
            error.current_context(),
            CaptureError::Exists { .. }
        ));
        assert_eq!(
            fs::read(target).expect("should read the first capture"),
            b"first"
        );
        assert_eq!(
            fs::read_dir(directory.path())
                .expect("should read the directory")
                .count(),
            1,
            "both temporary files should be removed"
        );
    }
}
