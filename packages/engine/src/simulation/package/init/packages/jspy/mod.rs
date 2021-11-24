use crate::proto::{InitialState, InitialStateName};
use crate::simulation::enum_dispatch::*;
use crate::simulation::package::init::packages::jspy::js::JsInitTask;
use crate::simulation::package::init::packages::jspy::py::PyInitTask;

use crate::simulation::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::convert::TryInto;

use super::super::*;

pub mod js;
pub mod py;

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
        _accessor: FieldSpecMapAccessor,
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

        let shared_store = TaskSharedStore::default();
        let active_task = self.comms.new_task(task, shared_store).await?;
        let task_message = TryInto::<JsPyInitTaskMessage>::try_into(
            TryInto::<InitTaskMessage>::try_into(active_task.drive_to_completion().await?)?,
        )?;

        match TryInto::<SuccessMessage>::try_into(task_message) {
            Ok(SuccessMessage { agent_json }) => serde_json::from_str(&agent_json).map_err(|e| {
                Error::from(format!(
                    "Failed to parse agent state JSON to Vec<Agent>: {:?}",
                    e
                ))
            }),
            Err(err) => Err(Error::from(format!(
                "Init Task failed: {}",
                err.to_string()
            ))),
        }
    }
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FailedMessage {}
