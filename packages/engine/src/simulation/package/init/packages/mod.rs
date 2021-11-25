use std::collections::hash_map::Iter;
use std::collections::HashMap;
use std::sync::Arc;

use super::PackageCreator;
use crate::simulation::enum_dispatch::*;
use crate::simulation::package::{
    id::{PackageId, PackageIdGenerator},
    PackageType,
};
use crate::simulation::{Error, Result};
use crate::ExperimentConfig;
use jspy::js::JsInitTask;
use jspy::py::PyInitTask;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::lazy::SyncOnceCell;
use strum_macros::IntoStaticStr;

pub mod json;
pub mod jspy;

/// All init package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, IntoStaticStr)]
pub enum Name {
    JSON,
    JSPY,
}

/// All init package tasks are registered in this enum
#[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum InitTask {
    JsInitTask,
    PyInitTask,
}

/// All init package task messages are registered in this enum
#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum InitTaskMessage {
    JsPyInitTaskMessage,
}

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn super::PackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        use Name::*;
        let mut m = HashMap::new();
        m.insert(JSON, json::Creator::new(experiment_config)?);
        m.insert(JSPY, jspy::Creator::new(experiment_config)?);
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Init Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn super::PackageCreator>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                let pkg_name: &str = name.into();
                Error::from(format!(
                    "Package creator: {} wasn't within the Init Package Creators map",
                    pkg_name
                ))
            })?)
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<Name, Box<dyn super::PackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    pub static ref IDS: HashMap<Name, PackageId> = {
        use Name::*;
        let mut creator = PackageIdGenerator::new(PackageType::Init);
        let mut m = HashMap::new();
        m.insert(JSON, creator.next());
        m.insert(JSPY, creator.next());
        m
    };
}
