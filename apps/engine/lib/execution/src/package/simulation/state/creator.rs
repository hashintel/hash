use std::{collections::HashMap, sync::OnceLock};

use crate::{
    package::simulation::{
        state::{
            behavior_execution::BehaviorExecutionCreator, topology::TopologyCreator,
            StatePackageCreator, StatePackageName,
        },
        PackageInitConfig,
    },
    Error, Result,
};

pub struct StatePackageCreators {
    creators: HashMap<StatePackageName, Box<dyn StatePackageCreator>>,
}

impl StatePackageCreators {
    pub fn initialize_for_experiment_run(config: &PackageInitConfig) -> Result<&'static Self> {
        static PACKAGE_CREATORS: OnceLock<StatePackageCreators> = OnceLock::new();
        PACKAGE_CREATORS.get_or_try_init(|| {
            tracing::debug!("Initializing State Package Creators");
            let mut creators = HashMap::<_, Box<dyn StatePackageCreator>>::with_capacity(2);
            creators.insert(
                StatePackageName::BehaviorExecution,
                Box::new(BehaviorExecutionCreator::new(config)?),
            );
            creators.insert(StatePackageName::Topology, Box::new(TopologyCreator));
            Ok(Self { creators })
        })
    }

    pub fn get(&self, name: StatePackageName) -> Result<&dyn StatePackageCreator> {
        self.creators
            .get(&name)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
            .map(Box::as_ref)
    }

    pub fn iter(&self) -> impl Iterator<Item = (StatePackageName, &dyn StatePackageCreator)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
