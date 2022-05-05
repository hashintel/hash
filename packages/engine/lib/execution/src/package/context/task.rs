use crate::{
    task::{Task, TaskSharedStore},
    worker::WorkerHandler,
    worker_pool::WorkerPoolHandler,
    Error, Result,
};

/// All context package tasks are registered in this enum
// #[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub struct ContextTask {}

impl Task for ContextTask {
    fn name(&self) -> &'static str {
        unimplemented!()
    }

    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if (state.is_readonly() || state.is_disabled()) && context.is_disabled() {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Context".into()))
        }
    }
}

impl WorkerHandler for ContextTask {}

impl WorkerPoolHandler for ContextTask {}
