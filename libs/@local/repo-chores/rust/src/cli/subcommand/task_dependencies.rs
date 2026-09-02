use error_stack::Report;

use crate::task_dependencies::{TaskDependenciesError, sync_task_dependencies};

/// Runs the task-dependencies process.
///
/// # Errors
///
/// Returns an error if the git root, the task names, the task graph or the package list cannot
/// be read, or if a document cannot be serialized, written or removed.
pub(super) async fn run() -> Result<(), Report<[TaskDependenciesError]>> {
    sync_task_dependencies().await
}
