use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
};

use execution::package::simulation::{
    init::{js_py::JsPyInitCreator, json::JsonInitCreator, InitPackageCreator, InitPackageName},
    PackageInitConfig,
};

use crate::simulation::{comms::Comms, Error, Result};

pub struct PackageCreators(
    SyncOnceCell<HashMap<InitPackageName, Box<dyn InitPackageCreator<Comms>>>>,
);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(&self, _config: &PackageInitConfig) -> Result<()> {
        tracing::debug!("Initializing Init Package Creators");
        use InitPackageName::{JsPy, Json};
        let mut m = HashMap::<_, Box<dyn InitPackageCreator<Comms>>>::new();
        m.insert(Json, Box::new(JsonInitCreator));
        m.insert(JsPy, Box::new(JsPyInitCreator));
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Init Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(
        &self,
        name: &InitPackageName,
    ) -> Result<&Box<dyn InitPackageCreator<Comms>>> {
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
    pub(crate) fn iter_checked(
        &self,
    ) -> Result<Iter<'_, InitPackageName, Box<dyn InitPackageCreator<Comms>>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .iter())
    }
}
