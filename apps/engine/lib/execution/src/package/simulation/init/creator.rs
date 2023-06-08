use std::{collections::HashMap, sync::OnceLock};

use crate::{
    package::simulation::{
        init::{
            js_py::JsPyInitCreator, json::JsonInitCreator, InitPackageCreator, InitPackageName,
        },
        PackageInitConfig,
    },
    Error, Result,
};

pub struct InitPackageCreators {
    creators: HashMap<InitPackageName, Box<dyn InitPackageCreator>>,
}

impl InitPackageCreators {
    pub fn initialize_for_experiment_run(_config: &PackageInitConfig) -> Result<&'static Self> {
        static PACKAGE_CREATORS: OnceLock<InitPackageCreators> = OnceLock::new();
        PACKAGE_CREATORS.get_or_try_init(|| {
            tracing::debug!("Initializing Init Package Creators");
            let mut creators = HashMap::<_, Box<dyn InitPackageCreator>>::with_capacity(2);
            creators.insert(InitPackageName::Json, Box::new(JsonInitCreator));
            creators.insert(InitPackageName::JsPy, Box::new(JsPyInitCreator));
            Ok(Self { creators })
        })
    }

    pub fn get(&self, name: InitPackageName) -> Result<&dyn InitPackageCreator> {
        self.creators
            .get(&name)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
            .map(Box::as_ref)
    }

    pub fn iter(&self) -> impl Iterator<Item = (InitPackageName, &dyn InitPackageCreator)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
