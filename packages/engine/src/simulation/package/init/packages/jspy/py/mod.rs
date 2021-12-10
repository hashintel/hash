use crate::{
    config::TaskDistributionConfig,
    simulation::{
        enum_dispatch::InitTaskMessage,
        package::init::packages::jspy::{JsPyInitTaskMessage, StartMessage},
        task::{
            args::GetTaskArgs,
            handler::{WorkerHandler, WorkerPoolHandler},
            msg::TargetedTaskMessage,
        },
        Result as SimulationResult,
    },
    worker::runner::comms::MessageTarget,
};

#[derive(Clone, Debug)]
pub struct PyInitTask {
    pub initial_state_source: String,
}

impl GetTaskArgs for PyInitTask {
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::None
    }
}

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
