use std::collections::HashMap;

use execution::package::simulation::{
    state::{
        behavior_execution::BehaviorExecutionCreator, topology::TopologyCreator,
        StatePackageCreator, StatePackageName,
    },
    Comms, PackageInitConfig,
};

use crate::simulation::{Error, Result};

pub struct StatePackageCreators<C> {
    creators: HashMap<StatePackageName, Box<dyn StatePackageCreator<C>>>,
}

impl<C: Comms> StatePackageCreators<C> {
    pub(crate) fn from_config(config: &PackageInitConfig) -> Result<Self> {
        tracing::debug!("Initializing State Package Creators");

        let mut creators = HashMap::<_, Box<dyn StatePackageCreator<C>>>::with_capacity(2);
        creators.insert(
            StatePackageName::BehaviorExecution,
            Box::new(BehaviorExecutionCreator::new::<C>(config)?),
        );
        creators.insert(StatePackageName::Topology, Box::new(TopologyCreator));
        Ok(Self { creators })
    }

    pub(crate) fn get(&self, name: StatePackageName) -> Result<&dyn StatePackageCreator<C>> {
        self.creators
            .get(&name)
            .map(Box::as_ref)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
    }

    #[cfg(test)]
    pub(crate) fn iter(
        &self,
    ) -> impl Iterator<Item = (StatePackageName, &dyn StatePackageCreator<C>)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
