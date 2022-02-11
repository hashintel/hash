use crate::{
    config::TaskDistributionConfig,
    simulation::{
        enum_dispatch::*,
        package::init::packages::js_py::{js::JsInitTask, py::PyInitTask},
    },
};

#[enum_dispatch]
pub trait GetTaskArgs {
    /// Defines if a [`Task`] has a distributed (split across [`Worker`]s) execution
    fn distribution(&self) -> TaskDistributionConfig;
}
