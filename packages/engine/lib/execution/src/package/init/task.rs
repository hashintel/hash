use crate::{
    package::init::script::{JsInitTask, PyInitTask},
    task::{SharedStore, Task},
    Error, Result,
};

/// All init package tasks are registered in this enum
#[derive(Clone, Debug)]
pub enum InitTask {
    JsInitTask(JsInitTask),
    PyInitTask(PyInitTask),
}

impl Task for InitTask {
    fn name(&self) -> &'static str {
        match self {
            Self::JsInitTask(_) => "JsInit",
            Self::PyInitTask(_) => "PyInit",
        }
    }

    fn verify_store_access(&self, access: &SharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if state.is_disabled() && context.is_disabled() {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Init".into()))
        }
    }
}
