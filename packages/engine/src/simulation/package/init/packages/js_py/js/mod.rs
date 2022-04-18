use crate::{
    simulation::{
        package::init::{
            packages::js_py::{JsPyInitTaskMessage, StartMessage},
            InitTaskMessage,
        },
        task::{handler::WorkerHandler, msg::TargetedTaskMessage, GetTaskName},
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
