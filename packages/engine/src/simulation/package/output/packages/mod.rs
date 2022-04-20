pub mod analysis;
pub mod json_state;

use std::{
    collections::{hash_map::Iter, HashMap},
    fmt,
    lazy::SyncOnceCell,
    sync::Arc,
};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use self::{analysis::AnalysisOutput, json_state::JsonStateOutput};
use crate::{
    config::ExperimentConfig,
    simulation::{
        package::{
            ext_traits::PackageCreator,
            id::PackageIdGenerator,
            name::PackageName,
            output::{
                packages::{analysis::AnalysisCreator, json_state::JsonStateCreator},
                OutputPackageCreator,
            },
            PackageMetadata, PackageType,
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

impl fmt::Display for Name {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
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

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn OutputPackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        _experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        tracing::debug!("Initializing Output Package Creators");
        use Name::{Analysis, JsonState};
        let mut m = HashMap::<_, Box<dyn OutputPackageCreator>>::new();
        m.insert(Analysis, Box::new(AnalysisCreator));
        m.insert(JsonState, Box::new(JsonStateCreator));
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Output Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn OutputPackageCreator>> {
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
    pub(crate) fn iter_checked(&self) -> Result<Iter<'_, Name, Box<dyn OutputPackageCreator>>> {
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
            dependencies: AnalysisCreator::dependencies(),
        });
        m.insert(JsonState, PackageMetadata {
            id: id_creator.next(),
            dependencies: JsonStateCreator::dependencies(),
        });
        m
    };
}
