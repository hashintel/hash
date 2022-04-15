pub mod analysis;
pub mod json_state;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
    sync::Arc,
};

use execution::task::SharedStore;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use stateful::field::PackageId;

use self::{analysis::AnalysisOutput, json_state::JsonStateOutput};
use crate::{
    config::ExperimentConfig,
    simulation::{
        package::{
            id::PackageIdGenerator, name::PackageName, output::PackageCreator, PackageMetadata,
            PackageType,
        },
        task::{
            access::StoreAccessVerify,
            args::GetTaskArgs,
            handler::{WorkerHandler, WorkerPoolHandler},
            GetTaskName,
        },
        Error, Result,
    },
};

/// All output package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    Analysis,
    JsonState,
}

impl Name {
    pub fn id(self) -> Result<PackageId> {
        Ok(METADATA
            .get(&self)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package Metadata not registered for package: {self}"
                ))
            })?
            .id)
    }
}

impl std::fmt::Display for Name {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).map_err(|_| std::fmt::Error)?
        )
    }
}

#[derive(Clone)]
pub struct OutputPackagesSimConfig {
    pub map: HashMap<PackageName, serde_json::Value>,
}

#[derive(Debug)]
pub enum Output {
    AnalysisOutput(AnalysisOutput),
    JsonStateOutput(JsonStateOutput),
}

/// All output package tasks are registered in this enum
// #[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum OutputTask {}

impl StoreAccessVerify for OutputTask {
    fn verify_store_access(&self, access: &SharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        // TODO: This check is useless currently as we don't encapsulate the run logic of output
        //   packages into `Task` objects but run them directly. That probably isn't ideal and we
        //   should look at the design, either trying to force things to be wrapped in Tasks,
        //   extracting verification logic out of tasks, for example, we _could_ verify access to
        //   State and Context at a package-level rather than Task level.
        if (state.is_readonly() || state.is_disabled())
            && (context.is_readonly() || context.is_disabled())
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Output".into()))
        }
    }
}

// Empty impls to satisfy constraints enum_dispatch while there are no task variants
impl GetTaskName for OutputTask {
    fn get_task_name(&self) -> &'static str {
        unimplemented!()
    }
}

impl WorkerHandler for OutputTask {}

impl WorkerPoolHandler for OutputTask {}

impl GetTaskArgs for OutputTask {}

/// All output package task messages are registered in this enum
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum OutputTaskMessage {}

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn PackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        tracing::debug!("Initializing Output Package Creators");
        use Name::{Analysis, JsonState};
        let mut m = HashMap::new();
        m.insert(Analysis, analysis::Creator::new(experiment_config)?);
        m.insert(JsonState, json_state::Creator::new(experiment_config)?);
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Output Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn PackageCreator>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("Output Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {} wasn't within the Output Package Creators map",
                    name
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<'_, Name, Box<dyn PackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Output Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    pub static ref METADATA: HashMap<Name, PackageMetadata> = {
        use Name::{Analysis, JsonState};
        let mut id_creator = PackageIdGenerator::new(PackageType::Output);
        let mut m = HashMap::new();
        m.insert(Analysis, PackageMetadata {
            id: id_creator.next(),
            dependencies: analysis::Creator::dependencies(),
        });
        m.insert(JsonState, PackageMetadata {
            id: id_creator.next(),
            dependencies: json_state::Creator::dependencies(),
        });
        m
    };
}
