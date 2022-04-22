use async_trait::async_trait;
use execution::{
    package::{
        init::{
            script::{JsInitTask, JsPyInitTaskMessage, PyInitTask, SuccessMessage},
            InitPackage, InitTask, InitTaskMessage, InitialState, InitialStateName,
        },
        Comms, MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig, PackageTask, TaskMessage,
    },
    task::{ActiveTask, SharedStore},
};
use stateful::{agent::Agent, field::FieldSpecMapAccessor};

use crate::simulation::{package::init::InitPackageCreator, Error, Result};

pub struct ScriptInitCreator;

impl<C: Comms> InitPackageCreator<C> for ScriptInitCreator {
    fn create(
        &self,
        _config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        comms: PackageComms<C>,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &init_config.initial_state.name {
            InitialStateName::InitPy | InitialStateName::InitJs => Ok(Box::new(ScriptInit {
                initial_state: init_config.initial_state.clone(),
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

impl PackageCreator for ScriptInitCreator {
    // TODO: Since the init.js/py file is the same for the whole experiment
    //      consider sending it out here instead of inside `PyInitTask`
    //      and `JsInitTask`
}

pub struct ScriptInit<C> {
    initial_state: InitialState,
    comms: PackageComms<C>,
}

impl<C> MaybeCpuBound for ScriptInit<C> {
    fn cpu_bound(&self) -> bool {
        false
    }
}

impl<C: Send> Package for ScriptInit<C> {}

#[async_trait]
impl<C: Comms> InitPackage for ScriptInit<C> {
    async fn run(&mut self) -> execution::Result<Vec<Agent>> {
        let task = match &self.initial_state.name {
            InitialStateName::InitPy => InitTask::PyInitTask(PyInitTask {
                initial_state_source: self.initial_state.src.clone(),
            }),
            InitialStateName::InitJs => InitTask::JsInitTask(JsInitTask {
                initial_state_source: self.initial_state.src.clone(),
            }),
            name => {
                // should be unreachable
                return Err(execution::Error::from(format!(
                    "Trying to run an init package for JS/Py but the init source wasn't .js or \
                     .py but instead was: {:?}",
                    name
                )));
            }
        };

        let shared_store = SharedStore::default();
        let active_task = self
            .comms
            .new_task(PackageTask::Init(task), shared_store)
            .await?;
        let task_message = match active_task.drive_to_completion().await? {
            TaskMessage::Init(InitTaskMessage::JsPyInitTaskMessage(message)) => message,
            _ => return Err(execution::Error::from("Not a JsPyInitTaskMessage")),
        };

        match task_message {
            JsPyInitTaskMessage::Success(SuccessMessage { agents }) => Ok(agents),
            _ => Err(execution::Error::from("Init Task failed")),
        }
    }
}
