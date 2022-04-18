pub mod behavior_execution;
pub mod topology;

use std::{
    collections::{hash_map::Iter, HashMap},
    fmt,
    lazy::SyncOnceCell,
    sync::Arc,
};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    config::ExperimentConfig,
    simulation::{
        package::{id::PackageIdGenerator, state::PackageCreator, PackageMetadata, PackageType},
        Error, Result,
    },
};

/// All state package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    BehaviorExecution,
    Topology,
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

impl fmt::Display for Name {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
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
        m.insert(
            BehaviorExecution,
            PackageMetadata::new(
                id_creator.next(),
                behavior_execution::Creator::dependencies(),
            ),
        );
        m.insert(
            Topology,
            PackageMetadata::new(id_creator.next(), topology::Creator::dependencies()),
        );
        m
    };
}
