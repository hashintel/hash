use std::collections::HashMap;

use execution::package::simulation::{
    output::{
        analysis::AnalysisCreator, json_state::JsonStateCreator, OutputPackageCreator,
        OutputPackageName,
    },
    Comms, PackageInitConfig,
};

use crate::simulation::{Error, Result};

pub struct OutputPackageCreators<C> {
    creators: HashMap<OutputPackageName, Box<dyn OutputPackageCreator<C>>>,
}

impl<C: Comms> OutputPackageCreators<C> {
    pub(crate) fn from_config(_config: &PackageInitConfig) -> Result<Self> {
        tracing::debug!("Initializing Output Package Creators");

        let mut creators = HashMap::<_, Box<dyn OutputPackageCreator<C>>>::with_capacity(2);
        creators.insert(OutputPackageName::Analysis, Box::new(AnalysisCreator));
        creators.insert(OutputPackageName::JsonState, Box::new(JsonStateCreator));
        Ok(Self { creators })
    }

    pub(crate) fn get(&self, name: OutputPackageName) -> Result<&dyn OutputPackageCreator<C>> {
        self.creators
            .get(&name)
            .map(Box::as_ref)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
    }

    #[cfg(test)]
    pub(crate) fn iter(
        &self,
    ) -> impl Iterator<Item = (OutputPackageName, &dyn OutputPackageCreator<C>)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
