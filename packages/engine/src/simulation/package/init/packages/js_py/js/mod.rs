use execution::{
    package::{
        init::{
            script::{JsInitTask, StartMessage},
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
