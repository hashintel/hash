use crate::config::TaskDistributionConfig;
use crate::simulation::packages::init::packages::jspy::{StartMessage, _into_result};
use crate::simulation::task::args::GetTaskArgs;
use crate::simulation::task::handler::WorkerHandler;
use crate::simulation::task::msg::{TargetedTaskMessage, TaskMessage};
use crate::simulation::task::result::TaskResult;
use crate::simulation::task::Task;
use crate::simulation::Result as SimulationResult;
use crate::worker::runner::comms::MessageTarget;

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
        SimulationResult::Ok(TargetedTaskMessage {
            target: MessageTarget::Python,
            payload: StartMessage {
                initial_state_source: self.initial_state_source.clone(),
            }
            .into(),
        })
    }

    fn into_result(&self, msg: TaskMessage) -> SimulationResult<TaskResult> {
        _into_result(msg)
    }
}
