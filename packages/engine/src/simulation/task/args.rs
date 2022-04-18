use crate::{
    config::TaskDistributionConfig,
    simulation::{
        enum_dispatch::{enum_dispatch, ExecuteBehaviorsTask, InitTask, StateTask},
        package::init::packages::js_py::{js::JsInitTask, py::PyInitTask},
    },
};

#[enum_dispatch]
pub trait GetTaskArgs {
    /// Defines if a [`Task`] has a distributed (split across [`worker`]s) execution.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`worker`]: crate::worker
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::None
    }
}
