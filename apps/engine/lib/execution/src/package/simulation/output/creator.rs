use std::{collections::HashMap, sync::OnceLock};

use crate::{
    package::simulation::{
        output::{
            analysis::AnalysisCreator, json_state::JsonStateCreator, OutputPackageCreator,
            OutputPackageName,
        },
        PackageInitConfig,
    },
    Error, Result,
};

pub struct OutputPackageCreators {
    creators: HashMap<OutputPackageName, Box<dyn OutputPackageCreator>>,
}

impl OutputPackageCreators {
    pub fn initialize_for_experiment_run(_config: &PackageInitConfig) -> Result<&'static Self> {
        static PACKAGE_CREATORS: OnceLock<OutputPackageCreators> = OnceLock::new();
        PACKAGE_CREATORS.get_or_try_init(|| {
            tracing::debug!("Initializing Output Package Creators");
            let mut creators = HashMap::<_, Box<dyn OutputPackageCreator>>::with_capacity(2);
            creators.insert(OutputPackageName::Analysis, Box::new(AnalysisCreator));
            creators.insert(OutputPackageName::JsonState, Box::new(JsonStateCreator));
            Ok(Self { creators })
        })
    }

    pub fn get(&self, name: OutputPackageName) -> Result<&dyn OutputPackageCreator> {
        self.creators
            .get(&name)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
            .map(Box::as_ref)
    }

    pub fn iter(&self) -> impl Iterator<Item = (OutputPackageName, &dyn OutputPackageCreator)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
