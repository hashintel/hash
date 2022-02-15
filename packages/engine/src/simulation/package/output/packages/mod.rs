pub mod analysis;
pub mod json_state;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
    sync::Arc,
};

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

use self::{analysis::AnalysisOutput, json_state::JsonStateOutput};
use super::PackageCreator;
use crate::{
    datastore::table::task_shared_store::{SharedContext, SharedState},
    simulation::{
        enum_dispatch::*,
        package::{id::PackageIdGenerator, name::PackageName, PackageMetadata, PackageType},
        Error, Result,
    },
    ExperimentConfig,
};
/// All output package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    Analysis,
    JsonState,
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

#[enum_dispatch(OutputRepr)]
#[derive(Debug)]
pub enum Output {
    AnalysisOutput,
    JsonStateOutput,
}

/// All output package tasks are registered in this enum
// #[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum OutputTask {}

impl StoreAccessVerify for OutputTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if (matches!(state, SharedState::Read(_)) || matches!(state, SharedState::None))
            && (matches!(context, SharedContext::Read) || matches!(context, SharedContext::None))
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

impl GetTaskArgs for OutputTask {
    fn distribution(&self) -> TaskDistributionConfig {
        unimplemented!()
    }
}

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
        use Name::*;
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
        use Name::*;
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
