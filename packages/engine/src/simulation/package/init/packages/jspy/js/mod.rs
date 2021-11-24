use crate::config::TaskDistributionConfig;
use crate::simulation::package::init::packages::jspy::{JsPyInitTaskMessage, StartMessage};
use crate::simulation::package::init::InitTaskMessage;
use crate::simulation::task::args::GetTaskArgs;
use crate::simulation::task::handler::{WorkerHandler, WorkerPoolHandler};
use crate::simulation::task::msg::{TargetedTaskMessage, TaskMessage};
use crate::simulation::Result as SimulationResult;
use crate::worker::runner::comms::MessageTarget;

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
