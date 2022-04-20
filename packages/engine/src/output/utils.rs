use memory::shared_memory::MemoryId;

use crate::{
    output::buffer::RELATIVE_PARTS_FOLDER, proto::ExperimentId,
    worker::runner::python::cleanup_python_runner,
};

#[derive(PartialEq, Eq, Clone)]
pub enum EngineExitStatus {
    Success,
    Error,
}

/// Shared memory cleanup in the process hard crash case.
/// Not required for pod instances.
pub fn cleanup_experiment(experiment_id: &ExperimentId, exit_status: EngineExitStatus) {
    MemoryId::clean_up(experiment_id);

    cleanup_python_runner(experiment_id, exit_status);

    remove_experiment_parts(experiment_id);
}

// We might want to move the "/parts" folder to a temporary folder (like "/tmp" or "/var/tmp").
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
}
