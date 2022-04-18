use crate::{
    config::TaskDistributionConfig,
    simulation::{
        enum_dispatch::InitTaskMessage,
        package::init::packages::js_py::{JsPyInitTaskMessage, StartMessage},
        task::{
            args::GetTaskArgs,
            handler::{WorkerHandler, WorkerPoolHandler},
            msg::TargetedTaskMessage,
            GetTaskName,
        },
        Result as SimulationResult,
    },
    worker::runner::comms::MessageTarget,
};

#[derive(Clone, Debug)]
pub struct PyInitTask {
    pub initial_state_source: String,
}

impl GetTaskName for PyInitTask {
    fn get_task_name(&self) -> &'static str {
        "PyInit"
    }
}

impl GetTaskArgs for PyInitTask {}

impl WorkerHandler for PyInitTask {
    fn start_message(&self) -> SimulationResult<TargetedTaskMessage> {
        let start_msg = StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        };
        let jspy_task_msg: JsPyInitTaskMessage = start_msg.into();
        let init_task_msg: InitTaskMessage = jspy_task_msg.into();
        SimulationResult::Ok(TargetedTaskMessage {
            target: MessageTarget::Python,
            payload: init_task_msg.into(),
        })
    }
}

impl WorkerPoolHandler for PyInitTask {}
