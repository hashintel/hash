use std::{
    fs::{self, File},
    io,
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};

use super::{ArtifactError, Stored};
use crate::{SourceCapture, storage::ArtifactKey};

/// Returns the file for `key` under `root`, creating its directories.
#[expect(
    clippy::create_dir,
    reason = "checks each directory separately to reject symlink aliases and sync its parent"
)]
pub(super) fn path(root: &Path, key: &ArtifactKey) -> Result<PathBuf, Report<ArtifactError>> {
    let mut directory = root.to_owned();
    let mut segments = key.0.split('/').peekable();
    while let Some(segment) = segments.next() {
        if segments.peek().is_none() {
            return Ok(directory.join(segment));
        }
        let parent = directory.clone();
        directory.push(segment);
        match fs::create_dir(&directory) {
            Ok(()) => File::open(&parent)
                .and_then(|parent| parent.sync_all())
                .change_context(ArtifactError::Write)?,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if !fs::symlink_metadata(&directory)
                    .change_context(ArtifactError::Read)?
                    .file_type()
                    .is_dir()
                {
                    return Err(Report::new(ArtifactError::Read));
                }
            }
            Err(error) => return Err(Report::new(error).change_context(ArtifactError::Write)),
        }
    }
    Err(Report::new(ArtifactError::Read))
}

/// Opens the artifact stored at `key`, if there is one.
#[expect(
    clippy::filetype_is_file,
    reason = "artifacts must be regular files rather than symlinks or special files"
)]
pub(super) fn load(
    root: &Path,
    key: &ArtifactKey,
) -> Result<Option<SourceCapture>, Report<ArtifactError>> {
    let path = path(root, key)?;
    match path.symlink_metadata() {
        Ok(metadata) if metadata.file_type().is_file() => SourceCapture::open(path)
            .map(Some)
            .change_context(ArtifactError::Read),
        Ok(_) => Err(Report::new(ArtifactError::Read)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(Report::new(error).change_context(ArtifactError::Read)),
    }
}

/// Stores `artifact` at `key` unless a file is already there.
///
/// Hard-linking fails if the target exists, so the check and the store are one step.
pub(super) fn store(
    root: &Path,
    key: &ArtifactKey,
    artifact: &SourceCapture,
) -> Result<Stored, Report<ArtifactError>> {
    let target = path(root, key)?;
    match fs::hard_link(artifact.path(), &target) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(Stored::Exists),
        Err(error) => return Err(Report::new(error).change_context(ArtifactError::Write)),
    }
    if let Some(directory) = target.parent() {
        File::open(directory)
            .and_then(|directory| directory.sync_all())
            .change_context(ArtifactError::Write)?;
    }
    Ok(Stored::Created)
}
