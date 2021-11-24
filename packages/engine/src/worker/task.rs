use crate::simulation::task::msg::TaskResultOrCancelled;
use crate::{
    datastore::table::task_shared_store::TaskSharedStore,
    simulation::{package::id::PackageId, task::Task},
    types::TaskID,
};

#[derive(new, Debug)]
pub struct WorkerTask {
    pub task_id: TaskID,
    pub package_id: PackageId,
    pub inner: Task,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug, Clone)]
pub struct WorkerTaskResultOrCancelled {
    pub task_id: TaskID,
    pub payload: TaskResultOrCancelled,
}
