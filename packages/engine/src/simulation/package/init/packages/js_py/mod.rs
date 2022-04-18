use std::fmt::{Debug, Formatter};

use async_trait::async_trait;
use execution::{
    package::{
        init::{
            script::{JsInitTask, PyInitTask},
            InitTask,
        },
        PackageTask,
    },
    task::SharedStore,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use stateful::agent::Agent;

use crate::{
    config::ExperimentConfig,
    proto::{ExperimentRunTrait, InitialState, InitialStateName},
    simulation::{
        package::init::{
            Arc, FieldSpecMapAccessor, GetWorkerExpStartMsg, GetWorkerSimStartMsg, InitTaskMessage,
            MaybeCpuBound, Package as InitPackage, PackageComms, PackageCreator, SimRunConfig,
        },
        task::msg::TaskMessage,
        Error, Result,
    },
};

pub mod js;
pub mod py;

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &config.exp.run.base().project_base.initial_state.name {
            InitialStateName::InitPy | InitialStateName::InitJs => Ok(Box::new(Package {
                initial_state: config.exp.run.base().project_base.initial_state.clone(),
                comms,
            })),
            name => {
                return Err(Error::from(format!(
                    "Trying to create a JS/Python init package but the initial state source \
                     didn't end in '.js' or '.py': {:?}",
                    name
                )));
            }
        }
    }
}

impl GetWorkerExpStartMsg for Creator {
    // TODO: Since the init.js/py file is the same for the whole experiment
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

impl MaybeCpuBound for Package {
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
        let task = match &self.initial_state.name {
            InitialStateName::InitPy => InitTask::PyInitTask(PyInitTask {
                initial_state_source: self.initial_state.src.clone(),
            }),
            InitialStateName::InitJs => InitTask::JsInitTask(JsInitTask {
                initial_state_source: self.initial_state.src.clone(),
            }),
            name => {
                // should be unreachable
                return Err(Error::from(format!(
                    "Trying to run an init package for JS/Py but the init source wasn't .js or \
                     .py but instead was: {:?}",
                    name
                )));
            }
        };

        let shared_store = SharedStore::default();
        let active_task = self
            .comms
            .new_task(PackageTask::InitTask(task), shared_store)
            .await?;
        let task_message = match active_task.drive_to_completion().await? {
            TaskMessage::InitTaskMessage(InitTaskMessage::JsPyInitTaskMessage(message)) => message,
            _ => return Err(Error::from("Not a JsPyInitTaskMessage")),
        };

        match task_message {
            JsPyInitTaskMessage::SuccessMessage(SuccessMessage { agents }) => Ok(agents),
            _ => Err(Error::from("Init Task failed")),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum JsPyInitTaskMessage {
    StartMessage(StartMessage),
    SuccessMessage(SuccessMessage),
    FailedMessage(FailedMessage),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StartMessage {
    initial_state_source: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SuccessMessage {
    agents: Vec<Agent>,
}

impl Debug for SuccessMessage {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SuccessMessage")
            .field("agents", &{
                if !self.agents.is_empty() {
                    format_args!("[...]") // The Agents JSON can result in huge log lines otherwise
                } else {
                    format_args!("[]")
                }
            })
            .finish()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FailedMessage {}
