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
                        "Removed file {path:?} that should've been cleanup by the engine."
                    ),
                    EngineExitStatus::Error => tracing::warn!(
                        "Removed file {path:?} that should've been cleanup by the engine."
                    ),
                };
            }
            Err(err) => {
                tracing::warn!("Could not clean up {path:?}: {err}");
            }
        });

    remove_experiment_parts(experiment_id)?;

    Ok(())
}

fn remove_experiment_parts(experiment_id: &ExperimentId) -> Result<()> {
    let parts_fimes = glob::glob(&format!("{RELATIVE_PARTS_FOLDER}/{experiment_id}"))
        .map_err(|err| Error::Unique(format!("cleanup glob error: {err}")))?;

    parts_fimes
        .filter_map(std::result::Result::ok)
        .for_each(|path| match std::fs::remove_dir_all(&path) {
            Ok(_) => {
                tracing::trace!("Removed parts folder for experiment {experiment_id}: {path:?}")
            }
            Err(err) => {
                tracing::warn!("Could not clean up {path:?}: {err}");
            }
        });

    // TODO: use ErrorKind::DirectoryNotEmpty when it's stable and remove the `if`
    if std::fs::read_dir(RELATIVE_PARTS_FOLDER)?.next().is_none() {
        match std::fs::remove_dir(RELATIVE_PARTS_FOLDER) {
            Ok(_) => tracing::trace!("Removed parts folder."),
            // Err(err) if err.kind() == std::io::ErrorKind::DirectoryNotEmpty => {}
            Err(err) => {
                return Err(err.into());
            }
        }
    }

    Ok(())
}
