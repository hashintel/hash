use crate::{
    task::{StoreAccessValidator, Task, TaskDistributionConfig, TaskSharedStore},
    worker::WorkerHandler,
    worker_pool::WorkerPoolHandler,
    Error, Result,
};

/// All output package tasks are registered in this enum
// #[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum OutputTask {}

impl Task for OutputTask {
    fn name(&self) -> &'static str {
        unimplemented!("`OutputTask` does not contain variants")
    }

    fn distribution(&self) -> TaskDistributionConfig {
        unimplemented!("`OutputTask` does not contain variants")
    }
}

impl StoreAccessValidator for OutputTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        // TODO: This check is useless currently as we don't encapsulate the run logic of output
        //   packages into `Task` objects but run them directly. That probably isn't ideal and we
        //   should look at the design, either trying to force things to be wrapped in Tasks,
        //   extracting verification logic out of tasks, for example, we _could_ verify access to
        //   State and Context at a package-level rather than Task level.
        if (state.is_readonly() || state.is_disabled())
            && (context.is_readonly() || context.is_disabled())
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Output".into()))
        }
    }
}

impl WorkerHandler for OutputTask {}

impl WorkerPoolHandler for OutputTask {}
