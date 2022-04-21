pub mod analysis;
pub mod json_state;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
};

use execution::package::{output::OutputPackageName, PackageInitConfig, PackageType};
use lazy_static::lazy_static;

use self::{analysis::AnalysisOutput, json_state::JsonStateOutput};
use crate::simulation::{
    package::{
        ext_traits::PackageCreator,
        id::PackageIdGenerator,
        name::PackageName,
        output::{
            packages::{analysis::AnalysisCreator, json_state::JsonStateCreator},
            OutputPackageCreator,
        },
        PackageMetadata,
    },
    Error, Result,
};

#[derive(Clone)]
pub struct OutputPackagesSimConfig {
    pub map: HashMap<PackageName, serde_json::Value>,
}

#[derive(Debug)]
pub enum Output {
    AnalysisOutput(AnalysisOutput),
    JsonStateOutput(JsonStateOutput),
}

pub struct PackageCreators(SyncOnceCell<HashMap<OutputPackageName, Box<dyn OutputPackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(&self, _config: &PackageInitConfig) -> Result<()> {
        tracing::debug!("Initializing Output Package Creators");
        use OutputPackageName::{Analysis, JsonState};
        let mut m = HashMap::<_, Box<dyn OutputPackageCreator>>::new();
        m.insert(Analysis, Box::new(AnalysisCreator));
        m.insert(JsonState, Box::new(JsonStateCreator));
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Output Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(
        &self,
        name: &OutputPackageName,
    ) -> Result<&Box<dyn OutputPackageCreator>> {
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
    pub(crate) fn iter_checked(
        &self,
    ) -> Result<Iter<'_, OutputPackageName, Box<dyn OutputPackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Output Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    pub(in crate::simulation::package) static ref METADATA: HashMap<OutputPackageName, PackageMetadata> = {
        use OutputPackageName::{Analysis, JsonState};
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
