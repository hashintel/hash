use crate::{
    datastore::table::task_shared_store::TaskSharedStore,
    simulation::{
        packages::id::PackageId,
        task::{result::TaskResultOrCancelled, Task},
    },
    types::TaskID,
};

#[derive(new)]
pub struct WorkerTask {
    pub task_id: TaskID,
    pub package_id: PackageId,
    pub inner: Task,
    pub shared_store: TaskSharedStore,
}

pub struct WorkerTaskResultOrCancelled {
    pub task_id: TaskID,
    pub payload: TaskResultOrCancelled,
}
