use stateful::field::PackageId;

use crate::{
    datastore::table::task_shared_store::TaskSharedStore,
    simulation::task::{msg::TaskResultOrCancelled, Task},
    types::TaskId,
};

#[derive(derive_new::new, Debug)]
pub struct WorkerTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub inner: Task,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug, Clone)]
pub struct WorkerTaskResultOrCancelled {
    pub task_id: TaskId,
    pub payload: TaskResultOrCancelled,
}
