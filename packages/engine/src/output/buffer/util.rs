use std::path::PathBuf;

use super::RELATIVE_PARTS_FOLDER;
use crate::output::error::{Error, Result};

// TODO: move this to top-level
/// Shared memory cleanup in the process hard crash case.
/// Not required for pod instances.
pub fn cleanup_experiment(experiment_id: &str) -> Result<()> {
    log::trace!("Cleaning up experiment: {}", experiment_id);
    let shm_files = glob::glob(&format!("/dev/shm/shm_{}_*", experiment_id))
        .map_err(|e| Error::Unique(format!("cleanup glob error: {}", e)))?;
    for file in shm_files {
        match file {
            Ok(path) => {
                std::fs::remove_file(&path).ok();
            }
            _ => (),
        }
    }

    // TODO: We don't want to be deleting the parts files by default. We should figure out what to
    //   do with this.
    // remove_experiment_parts(experiment_id).or_else(|e| {
    //     let err_string = e.to_string();
    //     if err_string.contains("kind: NotFound") {
    //         Ok(())
    //     } else {
    //         Err(Error::from(format!(
    //             "Error while trying to remove experiment parts folder: {err_string}"
    //         )))
    //     }
    // })?;

    Ok(())
}

#[allow(dead_code)]
fn remove_experiment_parts(experiment_id: &str) -> Result<()> {
    let mut base_path = PathBuf::from(RELATIVE_PARTS_FOLDER);
    // TODO: this is unused at the moment so it's fine, but this logic is wrong, we name our folders
    //  differently, we should update the design to store the paths and use them here when we use
    //  the clean up code again
    base_path.push(experiment_id);
    log::trace!("Removing all parts files in: {base_path:?}");
    std::fs::remove_dir_all(base_path)?;
    Ok(())
}
