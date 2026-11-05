mod local;
mod s3;

use std::{
    fs,
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::SourceName;

pub use self::s3::S3Bucket;
use crate::{CaptureError, CaptureRun, SourceCapture, SourceError};

/// Keeps source captures so that retries and restores of a run reuse them.
#[derive(Debug)]
pub enum CaptureStorage {
    /// Captures in a local directory.
    Local(PathBuf),
    /// Captures in an S3 bucket, staged in a local directory on their way in and out.
    S3 { staging: PathBuf, bucket: S3Bucket },
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
            Self::S3 { staging, .. } => staging,
        }
    }

    /// Returns the capture an earlier attempt of `run` stored for `source`, or stores the one
    /// `write` publishes at the path it is given.
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
                if let Some(capture) = bucket
                    .download(run, source, &target)
                    .change_context(SourceError::Read)?
                {
                    return Ok(capture);
                }
                let capture = local::capture(&target, write).await?;
                bucket
                    .upload(run, source, &capture)
                    .change_context(SourceError::Write)?;
                Ok(capture)
            }
        }
    }
}
