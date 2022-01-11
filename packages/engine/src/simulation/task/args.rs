use crate::{
    config::TaskDistributionConfig,
    simulation::{
        enum_dispatch::*,
        package::init::packages::js_py::{js::JsInitTask, py::PyInitTask},
    },
};

#[enum_dispatch]
pub trait GetTaskArgs {
    fn distribution(&self) -> TaskDistributionConfig;
}
