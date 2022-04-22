pub mod analysis;
pub mod json_state;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
};

use execution::package::{
    output::{OutputPackageCreator, OutputPackageName},
    PackageInitConfig,
};

use crate::simulation::{
    comms::Comms,
    package::output::{analysis::AnalysisCreator, json_state::JsonStateCreator},
    Error, Result,
};

pub struct PackageCreators(
    SyncOnceCell<HashMap<OutputPackageName, Box<dyn OutputPackageCreator<Comms>>>>,
);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(&self, _config: &PackageInitConfig) -> Result<()> {
        tracing::debug!("Initializing Output Package Creators");
        use OutputPackageName::{Analysis, JsonState};
        let mut m = HashMap::<_, Box<dyn OutputPackageCreator<Comms>>>::new();
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
    ) -> Result<&Box<dyn OutputPackageCreator<Comms>>> {
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
    ) -> Result<Iter<'_, OutputPackageName, Box<dyn OutputPackageCreator<Comms>>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Output Package Creators weren't initialized"))?
            .iter())
    }
}
