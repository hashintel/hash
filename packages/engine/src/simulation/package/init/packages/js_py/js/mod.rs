use crate::{
    simulation::{
        package::init::{
            packages::js_py::{JsPyInitTaskMessage, StartMessage},
            InitTaskMessage,
        },
        task::{
            handler::WorkerHandler,
            msg::{TargetedTaskMessage, TaskMessage},
            GetTaskName,
        },
        Result as SimulationResult,
    },
    worker::runner::comms::MessageTarget,
};

#[derive(Clone, Debug)]
pub struct JsInitTask {
    pub initial_state_source: String,
}

impl GetTaskName for JsInitTask {
    fn get_task_name(&self) -> &'static str {
        "JsInit"
    }
}

impl WorkerHandler for JsInitTask {
    fn start_message(&self) -> SimulationResult<TargetedTaskMessage> {
        let jspy_init_task_msg = JsPyInitTaskMessage::StartMessage(StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        });
        let init_task_msg = InitTaskMessage::JsPyInitTaskMessage(jspy_init_task_msg);
        SimulationResult::Ok(TargetedTaskMessage {
            target: MessageTarget::JavaScript,
            payload: TaskMessage::InitTaskMessage(init_task_msg),
        })
    }
}
