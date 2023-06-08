use crate::{
    package::simulation::init::{
        js_py::{JsPyInitTaskMessage, StartMessage},
        InitTaskMessage,
    },
    runner::{Language, MessageTarget},
    task::{TargetedTaskMessage, Task, TaskMessage},
    worker::WorkerHandler,
    Result,
};

#[derive(Clone, Debug)]
pub struct JsInitTask {
    pub initial_state_source: String,
}

impl Task for JsInitTask {
    fn name(&self) -> &'static str {
        "JsInit"
    }
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
pub struct TsInitTask {
    pub initial_state_source: String,
}

impl Task for TsInitTask {
    fn name(&self) -> &'static str {
        "TsInit"
    }
}

impl WorkerHandler for TsInitTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        let javascript_source =
            Language::TypeScript.compile_source("init.ts", &self.initial_state_source)?;

        let jspy_init_task_msg = JsPyInitTaskMessage::Start(StartMessage {
            initial_state_source: javascript_source,
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

impl Task for PyInitTask {
    fn name(&self) -> &'static str {
        "PyInit"
    }
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
