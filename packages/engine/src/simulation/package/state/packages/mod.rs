pub mod behavior_execution;
pub mod topology;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
    sync::Arc,
};

use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

use self::behavior_execution::tasks::{ExecuteBehaviorsTask, ExecuteBehaviorsTaskMessage};
use crate::{
    config::ExperimentConfig,
    simulation::{
        enum_dispatch::{enum_dispatch, RegisterWithoutTrait, StoreAccessVerify, TaskSharedStore},
        package::{id::PackageIdGenerator, state::PackageCreator, PackageMetadata, PackageType},
        Error, Result,
    },
};

/// All state package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    BehaviorExecution,
    Topology,
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

/// All state package tasks are registered in this enum
#[enum_dispatch(GetTaskName, WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum StateTask {
    ExecuteBehaviorsTask,
}

impl StoreAccessVerify for StateTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        // All combinations (as of now) are allowed (but still being explicit)
        if (state.is_readwrite() || state.is_readonly() || state.is_disabled())
            && (context.is_readonly() || context.is_disabled())
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "State".into()))
        }
    }
}

/// All state package task messages are registered in this enum
#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum StateTaskMessage {
    ExecuteBehaviorsTaskMessage,
}

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn PackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        tracing::debug!("Initializing State Package Creators");
        use Name::{BehaviorExecution, Topology};
        let mut m = HashMap::new();
        m.insert(
            BehaviorExecution,
            behavior_execution::Creator::new(experiment_config)?,
        );
        m.insert(Topology, topology::Creator::new(experiment_config)?);
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize State Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn PackageCreator>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("State Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {} wasn't within the State Package Creators map",
                    name
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<'_, Name, Box<dyn PackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("State Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    pub static ref METADATA: HashMap<Name, PackageMetadata> = {
        use Name::{BehaviorExecution, Topology};
        let mut id_creator = PackageIdGenerator::new(PackageType::State);
        let mut m = HashMap::new();
        m.insert(BehaviorExecution, PackageMetadata {
            id: id_creator.next(),
            dependencies: behavior_execution::Creator::dependencies(),
        });
        m.insert(Topology, PackageMetadata {
            id: id_creator.next(),
            dependencies: topology::Creator::dependencies(),
        });
        m
    };
}
