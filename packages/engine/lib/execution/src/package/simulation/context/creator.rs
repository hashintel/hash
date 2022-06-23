use std::collections::HashMap;

use crate::{
    package::simulation::{
        context::{
            agent_messages::AgentMessagesCreator, api_requests::ApiRequestsCreator,
            neighbors::NeighborsCreator, ContextPackageCreator, ContextPackageName,
        },
        Comms, PackageInitConfig,
    },
    Error, Result,
};

pub struct ContextPackageCreators<C> {
    creators: HashMap<ContextPackageName, Box<dyn ContextPackageCreator<C>>>,
}

impl<C: Comms> ContextPackageCreators<C> {
    pub fn from_config(_config: &PackageInitConfig) -> Result<Self> {
        tracing::debug!("Initializing Context Package Creators");

        let mut creators = HashMap::<_, Box<dyn ContextPackageCreator<C>>>::with_capacity(3);
        creators.insert(
            ContextPackageName::AgentMessages,
            Box::new(AgentMessagesCreator),
        );
        creators.insert(
            ContextPackageName::ApiRequests,
            Box::new(ApiRequestsCreator),
        );
        creators.insert(ContextPackageName::Neighbors, Box::new(NeighborsCreator));
        Ok(Self { creators })
    }

    pub fn get(&self, name: ContextPackageName) -> Result<&dyn ContextPackageCreator<C>> {
        self.creators
            .get(&name)
            .map(Box::as_ref)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
    }

    pub fn iter(
        &self,
    ) -> impl Iterator<Item = (ContextPackageName, &dyn ContextPackageCreator<C>)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
