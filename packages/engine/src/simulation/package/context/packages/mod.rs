pub mod agent_messages;
pub mod api_requests;
pub mod neighbors;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
    sync::Arc,
};

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

use super::PackageCreator;
use crate::{
    simulation::{
        enum_dispatch::{
            enum_dispatch, GetTaskArgs, GetTaskName, RegisterWithoutTrait, StoreAccessVerify,
            TaskDistributionConfig, TaskSharedStore, WorkerHandler, WorkerPoolHandler,
        },
        package::{id::PackageIdGenerator, PackageMetadata, PackageType},
        Error, Result,
    },
    ExperimentConfig,
};

/// All context package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    AgentMessages,
    ApiRequests,
    Neighbors,
}

// TODO: Reduce code duplication between Name enums of different package types.
impl std::fmt::Display for Name {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).map_err(|_| std::fmt::Error)?
        )
    }
}

/// All context package tasks are registered in this enum
// #[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub struct ContextTask {}

impl StoreAccessVerify for ContextTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if (state.is_readonly() || state.is_disabled()) && context.is_disabled() {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Context".into()))
        }
    }
}

// Empty impls to satisfy constraints from enum_dispatch while there are no task variants
impl GetTaskName for ContextTask {
    fn get_task_name(&self) -> &'static str {
        unimplemented!()
    }
}

impl WorkerHandler for ContextTask {}

impl WorkerPoolHandler for ContextTask {}

impl GetTaskArgs for ContextTask {
    fn distribution(&self) -> TaskDistributionConfig {
        unimplemented!()
    }
}

/// All context package task messages are registered in this enum
#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ContextTaskMessage {}

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn PackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        tracing::debug!("Initializing Context Package Creators");
        use Name::{AgentMessages, ApiRequests, Neighbors};
        let mut m = HashMap::new();
        m.insert(
            AgentMessages,
            agent_messages::Creator::new(experiment_config)?,
        );
        m.insert(ApiRequests, api_requests::Creator::new(experiment_config)?);
        m.insert(Neighbors, neighbors::Creator::new(experiment_config)?);
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Context Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn PackageCreator>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("Context Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {name} wasn't within the Context Package Creators map"
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<'_, Name, Box<dyn PackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Context Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    /// All context package creators are registered in this hashmap
    pub static ref METADATA: HashMap<Name, PackageMetadata> = {
        use Name::{AgentMessages, ApiRequests, Neighbors};
        let mut id_creator = PackageIdGenerator::new(PackageType::Context);
        let mut m = HashMap::new();
        m.insert(AgentMessages, PackageMetadata{
            id: id_creator.next(),
            dependencies: agent_messages::Creator::dependencies()
        });
        m.insert(ApiRequests, PackageMetadata{
            id: id_creator.next(),
            dependencies: api_requests::Creator::dependencies()
        });
        m.insert(Neighbors, PackageMetadata{
            id: id_creator.next(),
            dependencies: neighbors::Creator::dependencies()
        });
        m
    };
}
