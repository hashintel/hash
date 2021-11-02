use std::path::PathBuf;

use crate::output::error::{Error, Result};

use super::RELATIVE_PARTS_FOLDER;

// TODO: move this to top-level
/// Shared memory cleanup in the process hard crash case.
/// Not required for pod instances.
pub fn cleanup_experiment(experiment_id: &str) -> Result<()> {
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

    remove_experiment_parts(experiment_id).or_else(|e| {
        let s = e.to_string();
        if s.contains("kind: NotFound") {
            Ok(())
        } else {
            Err(Error::from(s))
        }
    })?;

    Ok(())
}

fn remove_experiment_parts(experiment_id: &str) -> Result<()> {
    let mut base_path = PathBuf::from(RELATIVE_PARTS_FOLDER);
    base_path.push(experiment_id);
    std::fs::remove_dir_all(base_path)?;
    Ok(())
}
