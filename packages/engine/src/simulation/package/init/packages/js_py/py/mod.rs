use execution::{
    package::{
        init::{
            script::{PyInitTask, StartMessage},
            InitTaskMessage,
        },
        TaskMessage,
    },
    runner::MessageTarget,
    task::TargetedTaskMessage,
};

use crate::simulation::{
    package::init::packages::js_py::JsPyInitTaskMessage, task::handler::WorkerHandler,
    Result as SimulationResult,
};

impl WorkerHandler for PyInitTask {
    fn start_message(&self) -> SimulationResult<TargetedTaskMessage> {
        let start_msg = StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        };
        let jspy_task_msg = JsPyInitTaskMessage::StartMessage(start_msg);
        let init_task_msg = InitTaskMessage::JsPyInitTaskMessage(jspy_task_msg);
        SimulationResult::Ok(TargetedTaskMessage {
            target: MessageTarget::Python,
            payload: TaskMessage::InitTaskMessage(init_task_msg),
        })
    }
}
