use crate::{
    package::{
        init::{
            script::{JsPyInitTaskMessage, StartMessage},
            InitTaskMessage,
        },
        TaskMessage,
    },
    runner::MessageTarget,
    task::TargetedTaskMessage,
    worker::WorkerHandler,
    Result,
};

#[derive(Clone, Debug)]
pub struct JsInitTask {
    pub initial_state_source: String,
}

impl WorkerHandler for JsInitTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        let jspy_init_task_msg = JsPyInitTaskMessage::Start(StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        });
        let init_task_msg = InitTaskMessage::JsPyInitTaskMessage(jspy_init_task_msg);
        Ok(TargetedTaskMessage {
            target: MessageTarget::JavaScript,
            payload: TaskMessage::Init(init_task_msg),
        })
    }
}

#[derive(Clone, Debug)]
pub struct PyInitTask {
    pub initial_state_source: String,
}

impl WorkerHandler for PyInitTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        let start_msg = StartMessage {
            initial_state_source: self.initial_state_source.clone(),
        };
        let jspy_task_msg = JsPyInitTaskMessage::Start(start_msg);
        let init_task_msg = InitTaskMessage::JsPyInitTaskMessage(jspy_task_msg);
        Ok(TargetedTaskMessage {
            target: MessageTarget::Python,
            payload: TaskMessage::Init(init_task_msg),
        })
    }
}
