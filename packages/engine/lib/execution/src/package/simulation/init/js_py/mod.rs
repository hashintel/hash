//! Generates the initial state from a provided JavaScript or Python script.

mod message;
mod task;

use async_trait::async_trait;
use stateful::{agent::Agent, field::FieldSpecMapAccessor};

pub use self::{
    message::{FailedMessage, JsPyInitTaskMessage, StartMessage, SuccessMessage},
    task::{JsInitTask, PyInitTask},
};
use crate::{
    package::simulation::{
        init::{
            InitPackage, InitPackageCreator, InitTask, InitTaskMessage, InitialState,
            InitialStateName,
        },
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig, PackageTask,
    },
    task::{TaskMessage, TaskSharedStore},
    Error, Result,
};

pub struct JsPyInit {
    initial_state: InitialState,
    comms: PackageComms,
}

impl MaybeCpuBound for JsPyInit {
    fn cpu_bound(&self) -> bool {
        false
    }
}

impl Package for JsPyInit {}

#[async_trait]
impl InitPackage for JsPyInit {
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

        let shared_store = TaskSharedStore::default();
        let active_task = self
            .comms
            .new_task(PackageTask::Init(task), shared_store)
            .await?;
        let task_message = match active_task.drive_to_completion().await? {
            TaskMessage::Init(InitTaskMessage::JsPyInitTaskMessage(message)) => message,
            _ => return Err(Error::from("Not a JsPyInitTaskMessage")),
        };

        match task_message {
            JsPyInitTaskMessage::Success(SuccessMessage { agents }) => Ok(agents),
            _ => Err(Error::from("Init Task failed")),
        }
    }
}

pub struct JsPyInitCreator;

impl PackageCreator for JsPyInitCreator {
    // TODO: Since the init.js/py file is the same for the whole experiment consider sending it out
    //   here instead of inside `PyInitTask` and `JsInitTask`
}

impl InitPackageCreator for JsPyInitCreator {
    fn create(
        &self,
        _config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &init_config.initial_state.name {
            InitialStateName::InitPy | InitialStateName::InitJs => Ok(Box::new(JsPyInit {
                initial_state: init_config.initial_state.clone(),
                comms,
            })),
            name => Err(Error::from(format!(
                "Trying to create a JS/Python init package but the initial state source didn't \
                 end in '.js' or '.py': {:?}",
                name
            ))),
        }
    }
}
