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
use crate::{CaptureError, CaptureRun, SourceCapture};

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

    /// Returns the capture an earlier attempt of `run` stored for `source`, if there is one.
    pub(crate) async fn load(
        &self,
        run: CaptureRun,
        source: &SourceName,
    ) -> Result<Option<SourceCapture>, Report<CaptureError>> {
        let target = self.target(run, source)?;
        match self {
            Self::Local(_) => local::load(&target),
            Self::S3 { bucket, .. } => {
                Arc::clone(bucket)
                    .download(run, source.clone(), target)
                    .await
            }
        }
    }

    /// Returns the local path a new capture of `source` is published to.
    pub(crate) fn target(
        &self,
        run: CaptureRun,
        source: &SourceName,
    ) -> Result<PathBuf, Report<CaptureError>> {
        local::target(self.root(), run, source)
    }

    /// Stores a capture published at [`Self::target`] so later attempts of `run` can load it.
    pub(crate) async fn store(
        &self,
        run: CaptureRun,
        source: &SourceName,
        capture: &SourceCapture,
    ) -> Result<(), Report<CaptureError>> {
        match self {
            // The capture is already published in the storage directory.
            Self::Local(_) => Ok(()),
            Self::S3 { bucket, .. } => {
                Arc::clone(bucket)
                    .upload(run, source.clone(), capture.clone())
                    .await
            }
        }
    }
}
