pub mod agent_messages;
pub mod api_requests;
pub mod neighbors;

use std::{
    collections::{hash_map::Iter, HashMap},
    lazy::SyncOnceCell,
};

use execution::package::{
    context::{ContextPackageCreator, ContextPackageName},
    PackageInitConfig,
};

use crate::simulation::{
    comms::Comms,
    package::context::{
        agent_messages::AgentMessagesCreator, api_requests::ApiRequestsCreator,
        neighbors::NeighborsCreator,
    },
    Error, Result,
};

pub struct PackageCreators(
    SyncOnceCell<HashMap<ContextPackageName, Box<dyn ContextPackageCreator<Comms>>>>,
);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(&self, _config: &PackageInitConfig) -> Result<()> {
        tracing::debug!("Initializing Context Package Creators");
        use ContextPackageName::{AgentMessages, ApiRequests, Neighbors};
        let mut m = HashMap::<_, Box<dyn ContextPackageCreator<Comms>>>::new();
        m.insert(AgentMessages, Box::new(AgentMessagesCreator));
        m.insert(ApiRequests, Box::new(ApiRequestsCreator));
        m.insert(Neighbors, Box::new(NeighborsCreator));
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Context Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(
        &self,
        name: &ContextPackageName,
    ) -> Result<&Box<dyn ContextPackageCreator<Comms>>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("Context Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {name} wasn't within the Context Package Creators map"
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(
        &self,
    ) -> Result<Iter<'_, ContextPackageName, Box<dyn ContextPackageCreator<Comms>>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Context Package Creators weren't initialized"))?
            .iter())
    }
}
