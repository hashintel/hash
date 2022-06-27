use std::{collections::HashMap, sync::OnceLock};

use crate::{
    package::simulation::{
        context::{
            agent_messages::AgentMessagesCreator, api_requests::ApiRequestsCreator,
            neighbors::NeighborsCreator, ContextPackageCreator, ContextPackageName,
        },
        PackageInitConfig,
    },
    Error, Result,
};

pub struct ContextPackageCreators {
    creators: HashMap<ContextPackageName, Box<dyn ContextPackageCreator>>,
}

impl ContextPackageCreators {
    pub fn initialize_for_experiment_run(_config: &PackageInitConfig) -> Result<&'static Self> {
        static PACKAGE_CREATORS: OnceLock<ContextPackageCreators> = OnceLock::new();
        PACKAGE_CREATORS.get_or_try_init(|| {
            tracing::debug!("Initializing Context Package Creators");
            let mut creators = HashMap::<_, Box<dyn ContextPackageCreator>>::with_capacity(3);
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
        })
    }

    pub fn get(&self, name: ContextPackageName) -> Result<&dyn ContextPackageCreator> {
        self.creators
            .get(&name)
            .ok_or_else(|| Error::from(format!("Package {name} was not initialized")))
            .map(Box::as_ref)
    }

    pub fn iter(&self) -> impl Iterator<Item = (ContextPackageName, &dyn ContextPackageCreator)> {
        self.creators
            .iter()
            .map(|(name, creator)| (*name, creator.as_ref()))
    }
}
