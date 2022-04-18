pub mod js_py;
pub mod json;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
    sync::Arc,
};

use execution::{package::init::InitTask, task::TargetedTaskMessage};
use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    config::ExperimentConfig,
    simulation::{
        package::{id::PackageIdGenerator, init::PackageCreator, PackageMetadata, PackageType},
        task::handler::{WorkerHandler, WorkerPoolHandler},
        Error, Result,
    },
};

/// All init package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    Json,
    JsPy,
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

impl WorkerHandler for InitTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        match self {
            Self::JsInitTask(inner) => inner.start_message(),
            Self::PyInitTask(inner) => inner.start_message(),
        }
    }
}

impl WorkerPoolHandler for InitTask {}

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn PackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        tracing::debug!("Initializing Init Package Creators");
        use Name::{JsPy, Json};
        let mut m = HashMap::new();
        m.insert(Json, json::Creator::new(experiment_config)?);
        m.insert(JsPy, js_py::Creator::new(experiment_config)?);
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Init Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn PackageCreator>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {} wasn't within the Init Package Creators map",
                    name
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<'_, Name, Box<dyn PackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    pub static ref METADATA: HashMap<Name, PackageMetadata> = {
        use Name::{JsPy, Json};
        let mut id_creator = PackageIdGenerator::new(PackageType::Init);
        let mut m = HashMap::new();
        m.insert(Json, PackageMetadata {
            id: id_creator.next(),
            dependencies: json::Creator::dependencies(),
        });
        m.insert(JsPy, PackageMetadata {
            id: id_creator.next(),
            dependencies: js_py::Creator::dependencies(),
        });
        m
    };
}
