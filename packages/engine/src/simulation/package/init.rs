use std::collections::HashMap;

use execution::package::simulation::{
    init::{js_py::JsPyInitCreator, json::JsonInitCreator, InitPackageCreator, InitPackageName},
    Comms, PackageInitConfig,
};

use crate::simulation::{Error, Result};

pub struct InitPackageCreators<C> {
    creators: HashMap<InitPackageName, Box<dyn InitPackageCreator<C>>>,
}

impl<C: Comms> InitPackageCreators<C> {
    pub(crate) fn from_config(_config: &PackageInitConfig) -> Result<Self> {
        tracing::debug!("Initializing Init Package Creators");

        let mut creators = HashMap::<_, Box<dyn InitPackageCreator<C>>>::with_capacity(2);
        creators.insert(InitPackageName::Json, Box::new(JsonInitCreator));
        creators.insert(InitPackageName::JsPy, Box::new(JsPyInitCreator));
        Ok(Self { creators })
    }

    pub(crate) fn get(&self, name: InitPackageName) -> Result<&dyn InitPackageCreator<C>> {
        self.creators
            .get(&name)
            .map(Box::as_ref)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
    }

    #[cfg(test)]
    pub(crate) fn iter(
        &self,
    ) -> impl Iterator<Item = (InitPackageName, &dyn InitPackageCreator<C>)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
