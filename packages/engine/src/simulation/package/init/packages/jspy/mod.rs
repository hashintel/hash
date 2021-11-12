use crate::proto::{InitialState, InitialStateName};
use crate::simulation::enum_dispatch::*;
use crate::simulation::package::init::packages::jspy::js::JsInitTask;
use crate::simulation::package::init::packages::jspy::py::PyInitTask;
use crate::simulation::task::msg::TaskMessage;
use crate::simulation::task::result::TaskResult;
use crate::simulation::Result as SimulationResult;
use crate::simulation::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::convert::TryInto;

use super::super::*;

pub mod js;
pub mod py;

enum LanguageTarget {
    Python,
    Javascript,
}

pub struct Creator {}

impl Creator {
    pub fn new() -> Box<dyn PackageCreator> {
        Box::new(Creator {})
    }
}

impl PackageCreator for Creator {
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &config.exp.run.project_base.initial_state.name {
            InitialStateName::InitPy | InitialStateName::InitJs => Ok(Box::new(Package {
                initial_state: config.exp.run.project_base.initial_state.clone(),
                comms,
            })
                as Box<dyn InitPackage>),
            name => {
                return Err(Error::from(format!("Trying to create a JS/Python init package but the initial state source didn't end in '.js' or '.py': {:?}", name)));
            }
        }
    }
}

impl GetWorkerExpStartMsg for Creator {
    // TODO Since the init.js/py file is the same for the whole experiment
    //      consider sending it out here instead of inside `PyInitTask`
    //      and `JsInitTask`
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

pub struct Package {
    initial_state: InitialState,
    comms: PackageComms,
}

impl MaybeCPUBound for Package {
    fn cpu_bound(&self) -> bool {
        false
    }
}

impl GetWorkerSimStartMsg for Package {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl InitPackage for Package {
    async fn run(&mut self) -> Result<Vec<Agent>> {
        let task: InitTask = match &self.initial_state.name {
            InitialStateName::InitPy => PyInitTask {
                initial_state_source: self.initial_state.src.clone(),
            }
            .into(),
            InitialStateName::InitJs => JsInitTask {
                initial_state_source: self.initial_state.src.clone(),
            }
            .into(),
            name => {
                // should be unreachable
                return Err(Error::from(format!("Trying to run an init package for JS/Py but the init source wasn't .js or .py: {:?}", name)));
            }
        };

        let active_task = self.comms.new_task(task, Default::default()).await?;
        let task_result = TryInto::<JsPyInitTaskResult>::try_into(
            TryInto::<InitTaskResult>::try_into(active_task.drive_to_completion().await?)?,
        )?;
        match task_result {
            JsPyInitTaskResult::Ok { agent_json } => {
                serde_json::from_str(&agent_json).map_err(|e| {
                    Error::from(format!(
                        "Failed to parse agent state JSON to Vec<Agent>: {:?}",
                        e
                    ))
                })
            }
            JsPyInitTaskResult::Err => {
                Err(Error::from(format!("Init Task failed"))) // TODO Get better error information
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum JsPyInitTaskResult {
    Ok { agent_json: String },
    Err,
}

#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum JsPyInitTaskMessage {
    StartMessage,
    SuccessMessage,
    FailedMessage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StartMessage {
    initial_state_source: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SuccessMessage {
    agent_json: String,
}

impl Into<TaskResult> for SuccessMessage {
    fn into(self) -> TaskResult {
        let init_task_res: InitTaskResult = JsPyInitTaskResult::Ok {
            agent_json: self.agent_json,
        }
        .into();
        init_task_res.into()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FailedMessage {}

impl Into<TaskResult> for FailedMessage {
    fn into(self) -> TaskResult {
        let init_task_res: InitTaskResult = JsPyInitTaskResult::Err.into();
        init_task_res.into()
    }
}

/// Common implementation of WorkerHandler trait "into_result" method to be used by JS and Py impls
fn _into_result(msg: TaskMessage) -> SimulationResult<TaskResult> {
    let js_py_init_task_msg = TryInto::<JsPyInitTaskMessage>::try_into(
        TryInto::<InitTaskMessage>::try_into(msg.clone())?,
    )?;
    if let Ok(success_message) = TryInto::<SuccessMessage>::try_into(js_py_init_task_msg.clone()) {
        Ok(success_message.into())
    } else if let Ok(_) = TryInto::<FailedMessage>::try_into(js_py_init_task_msg) {
        Err(Error::from(format!(
            "Javascript State Initialisation Task failed"
        )))
    } else {
        Err(Error::from(format!(
            "Unrecognised JS/Py Init Task message: {:?}",
            msg
        )))
    }
}
