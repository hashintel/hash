use memory::shared_memory::MemoryId;
use simulation_structure::ExperimentId;

use crate::output::buffer::RELATIVE_PARTS_FOLDER;

// TODO: move this to top-level
#[derive(PartialEq, Eq, Clone)]
pub enum EngineExitStatus {
    Success,
    Error,
}

// TODO: move this to top-level
/// Shared memory cleanup in the process hard crash case.
/// Not required for pod instances.
pub fn cleanup_experiment(experiment_id: &ExperimentId, exit_status: EngineExitStatus) {
    MemoryId::clean_up(experiment_id);

    // Cleanup python socket files in case the engine didn't
    let frompy_files = glob::glob(&format!("{experiment_id}-frompy*"));
    let topy_files = glob::glob(&format!("{experiment_id}-topy*"));

    frompy_files
        .into_iter()
        .chain(topy_files)
        .flatten()
        .flatten()
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

    remove_experiment_parts(experiment_id);
}

fn remove_experiment_parts(experiment_id: &ExperimentId) {
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
}
