use std::collections::HashMap;

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
    pub fn from_config(_config: &PackageInitConfig) -> Result<Self> {
        tracing::debug!("Initializing Init Package Creators");

        let mut creators = HashMap::<_, Box<dyn InitPackageCreator>>::with_capacity(2);
        creators.insert(InitPackageName::Json, Box::new(JsonInitCreator));
        creators.insert(InitPackageName::JsPy, Box::new(JsPyInitCreator));
        Ok(Self { creators })
    }

    pub fn get(&self, name: InitPackageName) -> Result<&dyn InitPackageCreator> {
        self.creators
            .get(&name)
            .map(Box::as_ref)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
    }

    pub fn iter(&self) -> impl Iterator<Item = (InitPackageName, &dyn InitPackageCreator)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
