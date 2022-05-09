use stateful::field::PackageId;

use crate::{
    package::simulation::PackageTask,
    task::{TaskId, TaskResultOrCancelled, TaskSharedStore},
};

#[derive(Debug)]
pub struct WorkerTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub task: PackageTask,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug, Clone)]
pub struct WorkerTaskResultOrCancelled {
    pub task_id: TaskId,
    pub payload: TaskResultOrCancelled,
}
