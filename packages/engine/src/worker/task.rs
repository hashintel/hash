use execution::task::SharedStore;
use stateful::field::PackageId;

use crate::{
    simulation::task::{msg::TaskResultOrCancelled, PackageTask},
    types::TaskId,
};

#[derive(derive_new::new, Debug)]
pub struct WorkerTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub inner: PackageTask,
    pub shared_store: SharedStore,
}

#[derive(Debug, Clone)]
pub struct WorkerTaskResultOrCancelled {
    pub task_id: TaskId,
    pub payload: TaskResultOrCancelled,
}
