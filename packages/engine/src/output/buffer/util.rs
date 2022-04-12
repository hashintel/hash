use memory::shared_memory::MemoryId;

use crate::{
    output::{buffer::RELATIVE_PARTS_FOLDER, error::Result, Error},
    proto::ExperimentId,
};

// TODO: move this to top-level
#[derive(PartialEq, Eq, Clone)]
pub enum EngineExitStatus {
    Success,
    Error,
}

// TODO: move this to top-level
/// Shared memory cleanup in the process hard crash case.
/// Not required for pod instances.
pub fn cleanup_experiment(
    experiment_id: &ExperimentId,
    exit_status: EngineExitStatus,
) -> Result<()> {
    MemoryId::clean_up(experiment_id)?;

    // Cleanup python socket files in case the engine didn't
    let frompy_files = glob::glob(&format!("{experiment_id}-frompy*"))
        .map_err(|err| Error::Unique(format!("cleanup glob error: {err}")))?;
    let topy_files = glob::glob(&format!("{experiment_id}-topy*"))
        .map_err(|err| Error::Unique(format!("cleanup glob error: {err}")))?;

    frompy_files
        .chain(topy_files)
        .filter_map(std::result::Result::ok)
        .for_each(|path| match std::fs::remove_file(&path) {
            Ok(_) => {
                match exit_status {
                    EngineExitStatus::Success => tracing::error!(
                        experiment = %experiment_id,
                        "Removed file {path:?} that should've been cleanup by the engine."
                    ),
                    EngineExitStatus::Error => tracing::warn!(
                        experiment = %experiment_id,
                        "Removed file {path:?} that should've been cleanup by the engine."
                    ),
                };
            }
            Err(err) => {
                tracing::warn!(
                    experiment = %experiment_id,
                    "Could not clean up {path:?}: {err}"
                );
            }
        });

    remove_experiment_parts(experiment_id)?;

    Ok(())
}

fn remove_experiment_parts(experiment_id: &ExperimentId) -> Result<()> {
    let path = format!("{RELATIVE_PARTS_FOLDER}/{experiment_id}");
    match std::fs::remove_dir_all(&path) {
        Ok(_) => {
            tracing::trace!(
                experiment = %experiment_id,
                "Removed parts folder for experiment {experiment_id}: {path:?}"
            );
        }
        Err(err) => {
            tracing::warn!(
                experiment = %experiment_id,
                "Could not clean up {path:?}: {err}"
            );
        }
    }

    match std::fs::remove_dir(RELATIVE_PARTS_FOLDER) {
        Ok(_) => tracing::trace!("Removed parts folder."),
        Err(err) => {
            tracing::warn!("Could not remove the parts folder: {err}");
        }
    }

    Ok(())
}
