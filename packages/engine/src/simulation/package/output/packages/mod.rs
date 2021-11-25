pub mod analysis;
pub mod json_state;

use self::{analysis::AnalysisOutput, json_state::JSONStateOutput};
use super::PackageCreator;
use crate::simulation::enum_dispatch::*;
use crate::simulation::package::name::PackageName;
use crate::simulation::package::PackageMetadata;
use crate::simulation::package::{id::PackageIdGenerator, PackageType};
use crate::simulation::{Error, Result};
use crate::ExperimentConfig;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::Iter;
use std::collections::HashMap;
use std::lazy::SyncOnceCell;
use std::sync::Arc;
use strum_macros::IntoStaticStr;

/// All output package names are registered in this enum
#[derive(Debug, Clone, PartialEq, Eq, Hash, IntoStaticStr)]
pub enum Name {
    Analysis,
    JSONState,
}

#[derive(Clone)]
pub struct OutputPackagesSimConfig {
    pub map: HashMap<PackageName, serde_json::Value>,
}

#[enum_dispatch(OutputRepr)]
pub enum Output {
    AnalysisOutput,
    JSONStateOutput,
}

/// All output package tasks are registered in this enum
// #[enum_dispatch(WorkerHandler, WorkerPoolHandler, GetTaskArgs)]
#[derive(Clone, Debug)]
pub enum OutputTask {}

// Empty impls to satisfy constraints enum_dispatch while there are no task variants
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

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn super::PackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        log::debug!("Initializing Output Package Creators");
        use Name::*;
        let mut m = HashMap::new();
        m.insert(Analysis, analysis::Creator::new(experiment_config)?);
        m.insert(JSONState, json_state::Creator::new(experiment_config)?);
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Output Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn super::PackageCreator>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Output Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                let pkg_name: &str = name.into();
                Error::from(format!(
                    "Package creator: {} wasn't within the Output Package Creators map",
                    pkg_name
                ))
            })?)
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<Name, Box<dyn super::PackageCreator>>> {
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
        m.insert(
            Analysis,
            PackageMetadata {
                id: id_creator.next(),
                dependencies: analysis::Creator::dependencies(),
            },
        );
        m.insert(
            JSONState,
            PackageMetadata {
                id: id_creator.next(),
                dependencies: json_state::Creator::dependencies(),
            },
        );
        m
    };
}
