use std::{fs, path::Path};

use error_stack::{Report, ResultExt as _};
use object_store::local::LocalFileSystem;

use crate::storage::ArtifactError;

// Origin: `ArtifactStore::from_url` for `file://` URLs in labs `pocs/integrations_rs/src/blob.rs`.
/// Opens the local directory `root` as an object store.
pub(super) fn open(root: &Path) -> Result<LocalFileSystem, Report<ArtifactError>> {
    fs::create_dir_all(root).change_context(ArtifactError::Write)?;
    LocalFileSystem::new_with_prefix(root).change_context(ArtifactError::Write)
}
