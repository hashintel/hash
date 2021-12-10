use crate::{
    config::TaskDistributionConfig,
    simulation::{
        package::init::{
            packages::jspy::{JsPyInitTaskMessage, StartMessage},
            InitTaskMessage,
        },
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
pub struct JsInitTask {
    pub initial_state_source: String,
}

impl GetTaskArgs for JsInitTask {
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::None
    }
}

impl WorkerHandler for JsInitTask {
    fn start_message(&self) -> SimulationResult<TargetedTaskMessage> {
        let jspy_init_task_msg: JsPyInitTaskMessage = StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        }
        .into();
        let init_task_msg: InitTaskMessage = jspy_init_task_msg.into();
        SimulationResult::Ok(TargetedTaskMessage {
            target: MessageTarget::JavaScript,
            payload: init_task_msg.into(),
        })
    }
}

impl WorkerPoolHandler for JsInitTask {}
