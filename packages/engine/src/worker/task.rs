use execution::{
    package::PackageTask,
    task::{TaskId, TaskResultOrCancelled, TaskSharedStore},
};
use stateful::field::PackageId;

#[derive(derive_new::new, Debug)]
pub struct WorkerTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub inner: PackageTask,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug, Clone)]
pub struct WorkerTaskResultOrCancelled {
    pub task_id: TaskId,
    pub payload: TaskResultOrCancelled,
}
