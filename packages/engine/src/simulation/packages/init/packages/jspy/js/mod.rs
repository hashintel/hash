use crate::config::TaskDistributionConfig;
use crate::simulation::packages::init::packages::jspy::{
    JsPyInitTaskMessage, StartMessage, _into_result,
};
use crate::simulation::task::args::GetTaskArgs;
use crate::simulation::task::handler::WorkerHandler;
use crate::simulation::task::msg::{TargetedTaskMessage, TaskMessage};
use crate::simulation::task::result::TaskResult;
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
        let init_task_msg: JsPyInitTaskMessage = StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        }
        .into();
        SimulationResult::Ok(TargetedTaskMessage {
            target: MessageTarget::JavaScript,
            payload: init_task_msg.into(),
        })
    }

    fn into_result(&self, msg: TaskMessage) -> SimulationResult<TaskResult> {
        _into_result(msg)
    }
}
