use std::{
    fs::{self, File},
    io,
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::SourceName;

use crate::{CaptureError, CaptureRun, SourceCapture, SourceError};

/// Reuses the capture published at `target`, or has `write` publish one there.
pub(super) async fn capture(
    target: &Path,
    write: impl AsyncFnOnce(PathBuf) -> Result<SourceCapture, Report<SourceError>>,
) -> Result<SourceCapture, Report<SourceError>> {
    if let Some(capture) = recovered(target).change_context(SourceError::Read)? {
        return Ok(capture);
    }
    let error = match write(target.to_owned()).await {
        Ok(capture) => return Ok(capture),
        Err(error) => error,
    };
    match recovered(target).change_context(SourceError::Read) {
        Ok(capture) => capture.ok_or(error),
        // Keep the capture failure, which explains why the source was contacted, alongside the
        // failure to read a capture another attempt published.
        Err(recovery) => {
            let context = *error.current_context();
            let mut failures = error.expand();
            failures.push(recovery);
            Err(failures.change_context(context))
        }
    }
}

/// The local file the capture of `source` is published to.
#[expect(
    clippy::create_dir,
    reason = "checks each run directory separately to reject symlink aliases and sync its parent"
)]
pub(super) fn target(
    root: &Path,
    run: CaptureRun,
    source: &SourceName,
) -> Result<PathBuf, Report<CaptureError>> {
    fs::create_dir_all(root).change_context(CaptureError::Write)?;
    let mut directory = root.to_owned();
    for component in [run.web, run.id] {
        let parent = directory.clone();
        directory.push(component.to_string());
        match fs::create_dir(&directory) {
            Ok(()) => File::open(&parent)
                .and_then(|parent| parent.sync_all())
                .change_context(CaptureError::Write)?,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if !fs::symlink_metadata(&directory)
                    .change_context(CaptureError::Read)?
                    .file_type()
                    .is_dir()
                {
                    return Err(Report::new(CaptureError::Read));
                }
            }
            Err(error) => return Err(Report::new(error).change_context(CaptureError::Write)),
        }
    }
    Ok(directory.join(format!("{source}.parquet")))
}

/// Opens the capture published at `path`, if there is one.
#[expect(
    clippy::filetype_is_file,
    reason = "captures must be regular files rather than symlinks or special files"
)]
fn recovered(path: &Path) -> Result<Option<SourceCapture>, Report<CaptureError>> {
    match path.symlink_metadata() {
        Ok(metadata) if metadata.file_type().is_file() => {
            SourceCapture::open(path.to_owned()).map(Some)
        }
        Ok(_) => Err(Report::new(CaptureError::Read)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(Report::new(error).change_context(CaptureError::Read)),
    }
}
