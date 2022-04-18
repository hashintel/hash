use crate::{task::SharedStore, Error, Result};

/// All output package tasks are registered in this enum
// #[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum OutputTask {}

impl crate::task::Task for OutputTask {
    fn name(&self) -> &'static str {
        unimplemented!()
    }

    fn verify_store_access(&self, access: &SharedStore) -> Result<()> {
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
