use std::{fs, path::Path};

use error_stack::{Report, ResultExt as _};
use object_store::local::LocalFileSystem;
use tempfile::TempDir;

use crate::storage::ArtifactError;

// Origin: `ArtifactStore::from_url` for `file://` URLs in labs `pocs/integrations_rs/src/blob.rs`.
/// Opens the local directory `root` as an object store, with a staging directory inside it.
pub(super) fn open(root: &Path) -> Result<(LocalFileSystem, TempDir), Report<ArtifactError>> {
    fs::create_dir_all(root).change_context(ArtifactError::Write)?;
    let staging = tempfile::Builder::new()
        .prefix(".staging")
        .tempdir_in(root)
        .change_context(ArtifactError::Write)?;
    let store = LocalFileSystem::new_with_prefix(root).change_context(ArtifactError::Write)?;
    Ok((store, staging))
}
