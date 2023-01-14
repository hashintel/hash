use std::{
    collections::HashSet,
    sync::{LazyLock, Mutex},
};

use glob::GlobError;
use uuid::Uuid;

/// We use this to keep a list of all the shared-memory segements which are
/// being used by the engine. When the engine exits, we then delete any
/// leftover shared memory segments (in release builds; we error in debug builds).
pub static IN_USE_SHM_SEGMENTS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(Mutex::default);

use crate::{shared_memory::MemoryId, Error, Result};

/// Clean up generated shared memory segments associated with a given `MemoryId`.
///
/// If debug assertions are enabled, this function will panic if there are any shared-memory
/// segments left to clear up. This is because ideally the engine would clean them all up promptly
/// (i.e. when the batch the segment corresponds to is no longer needed).
#[allow(clippy::significant_drop_in_scrutinee)]
pub fn cleanup_by_base_id(id: Uuid) -> Result<()> {
    let segments_not_removed_by_engine: Vec<String> = {
        let mut segments_list_lock = IN_USE_SHM_SEGMENTS.lock().unwrap();

        let mut segments_not_removed_by_engine = Vec::new();

        for os_id in segments_list_lock.iter() {
            if !os_id.starts_with(&format!("{}_*", MemoryId::prefix(id))) {
                continue;
            }

            let shm = shared_memory::ShmemConf::new(true)
                .os_id(&os_id.clone())
                .open();

            match shm {
                Ok(mut mem) => {
                    segments_not_removed_by_engine.push(os_id.clone());
                    let is_owner = mem.set_owner(true);
                    if !is_owner {
                        tracing::warn!(
                            "failed to gain ownership of the shared memory segment (this should \
                             not be possible)"
                        )
                    }
                    // deallocate the shared-memory segment (note: the `drop` call is not required,
                    // and is here to make it clear that we are trying to delete the shared memory
                    // segment)
                    drop(mem)
                }
                Err(e) => {
                    tracing::warn!("error when trying to open shared-memory segment: {e:?}")
                }
            }
        }

        for to_remove in segments_not_removed_by_engine.iter() {
            segments_list_lock.remove(to_remove);
        }

        segments_not_removed_by_engine
    };

    debug_assert!(
        segments_not_removed_by_engine.is_empty(),
        "expected the engine to have cleaned up all the segments it created during the \
         experiment, but segments with these ids remained at the experiment end: \
         {segments_not_removed_by_engine:?}"
    );

    #[cfg(debug_assertions)]
    check_all_deallocated_linux(id)?;

    Ok(())
}

/// On Linux we can obtain a list of all the shared memory segments in use, so we can perform some
/// additional cleanup (this function is mostly useful for testing the implementation of the cleanup
/// code which uses [`static@IN_USE_SHM_SEGMENTS`]).
fn check_all_deallocated_linux(id: Uuid) -> Result<()> {
    if cfg!(target_os = "linux") {
        let shm_files = glob::glob(&format!("/dev/shm/{}_*", MemoryId::prefix(id)))
            .map_err(|e| Error::Unique(format!("cleanup glob error: {}", e)))?;

        let mut not_deallocated: Vec<String> = Vec::new();

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

            debug_assert!(
                not_deallocated.is_empty(),
                "the following shared memory segments were not deallocated at the end of the \
                 experiment: {not_deallocated:?}"
            );
        }
    }

    Ok(())
}
