mod local;
mod s3;
#[cfg(test)]
pub(crate) mod tests;

use alloc::sync::Arc;
use std::{
    fs,
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::SourceName;
use tempfile::TempDir;

pub use self::s3::S3Bucket;
use crate::{CaptureError, CaptureRun, SourceCapture, SourceError};

/// Keeps source captures so that retries and restores of a run reuse them.
#[derive(Debug)]
pub enum CaptureStorage {
    /// Captures in a local directory.
    Local(PathBuf),
    /// Captures in an S3 bucket, staged in a temporary directory on their way in and out.
    ///
    /// Dropping the storage deletes the directory, so staged captures can be loaded only while
    /// the storage exists.
    S3 {
        staging: TempDir,
        bucket: Arc<S3Bucket>,
    },
}

impl CaptureStorage {
    /// Creates the local directory captures are kept or staged in and returns its canonical path.
    pub(crate) fn directory(&self) -> Result<PathBuf, Report<CaptureError>> {
        let directory = self.root();
        fs::create_dir_all(directory).change_context(CaptureError::Write)?;
        directory.canonicalize().change_context(CaptureError::Write)
    }

    fn root(&self) -> &Path {
        match self {
            Self::Local(root) => root,
            Self::S3 { staging, .. } => staging.path(),
        }
    }

    /// Returns the capture an earlier attempt of `run` stored for `source`, or stores the one
    /// `write` publishes at the path it is given.
    /// TODO: Not sure how I feel about this tbh
    /// Benefit: we can move the entire storage flow into the storage module, which is nice
    /// Downside: the storage crate essentially decides if we re-capture a source, based on data that is already available
    /// Need to discuss
    pub(crate) async fn capture(
        &self,
        run: CaptureRun,
        source: &SourceName,
        write: impl AsyncFnOnce(PathBuf) -> Result<SourceCapture, Report<SourceError>>,
    ) -> Result<SourceCapture, Report<SourceError>> {
        let target = local::target(self.root(), run, source).change_context(SourceError::Write)?;
        match self {
            Self::Local(_) => local::capture(&target, write).await,
            Self::S3 { bucket, .. } => {
                if let Some(capture) = Arc::clone(bucket)
                    .download(run, source.clone(), target.clone())
                    .await
                    .change_context(SourceError::Read)?
                {
                    return Ok(capture);
                }
                let capture = local::capture(&target, write).await?;
                Arc::clone(bucket)
                    .upload(run, source.clone(), capture.clone())
                    .await
                    .change_context(SourceError::Write)?;
                Ok(capture)
            }
        }
    }
}
