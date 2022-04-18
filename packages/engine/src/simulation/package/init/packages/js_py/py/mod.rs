use crate::{
    simulation::{
        enum_dispatch::{InitTaskMessage, TaskMessage},
        package::init::packages::js_py::{JsPyInitTaskMessage, StartMessage},
        task::{handler::WorkerHandler, msg::TargetedTaskMessage, GetTaskName},
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
