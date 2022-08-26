use glob::GlobError;
use uuid::Uuid;

use super::MemoryId;
use crate::{Error, Result};

/// Clean up generated shared memory segments associated with a given `MemoryId`.
///
/// Note: this function does not work on macOS.
///
/// If debug assertions are enabled, this function will panic if there are any shared-memory
/// segments left to clear up. This is because macOS does not store a reference to the shared-memory
/// segments (anywhere!) - the only one we have is the one we receive when we first create the
/// shared-memory segment. As such, we should consider it a bug if the shared-memory segments have
/// not been cleaned up before the experiment has completed (obviously it is still useful to have
/// this function as a safety fallback for operating systems which provide a list of all the
/// shared-memory segments in use).
pub fn cleanup_by_base_id(id: Uuid) -> Result<()> {
    let shm_files = glob::glob(&format!("/dev/shm/{}_*", MemoryId::prefix(id)))
        .map_err(|e| Error::Unique(format!("cleanup glob error: {}", e)))?;

    #[cfg(debug_assertions)]
    let mut not_deallocated = Vec::new();

    for path in shm_files {
        if let Err(err) = path
            .map_err(GlobError::into_error)
            .map(|path| {
                #[cfg(debug_assertions)]
                not_deallocated.push(path.display().to_string());
                path
            })
            .and_then(std::fs::remove_file)
        {
            tracing::warn!("Could not remove shared memory file: {err}");
        }
    }

    #[cfg(debug_assertions)]
    {
        if !not_deallocated.is_empty() {
            panic!(
                "the following shared memory segments were not deallocated at the end of the \
                 experiment: {not_deallocated:?}"
            )
        }
    }

    Ok(())
}
