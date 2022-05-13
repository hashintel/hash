use std::{collections::HashMap, fmt};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    package::simulation::{
        context::{
            agent_messages::AgentMessagesCreator, api_requests::ApiRequestsCreator,
            neighbors::NeighborsCreator,
        },
        Dependencies, PackageCreator, PackageIdGenerator, PackageMetadata, PackageType,
    },
    Error, Result,
};

/// All context package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextPackageName {
    AgentMessages,
    ApiRequests,
    Neighbors,
}

impl ContextPackageName {
    fn metadata(&self) -> Result<&PackageMetadata> {
        METADATA.get(self).ok_or_else(|| {
            Error::from(format!(
                "Package Metadata not registered for package: {self}"
            ))
        })
    }

    pub fn id(&self) -> Result<PackageId> {
        Ok(self.metadata()?.id)
    }

    pub fn dependencies(&self) -> Result<&Dependencies> {
        Ok(&self.metadata()?.dependencies)
    }
}

impl fmt::Display for ContextPackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

lazy_static! {
    /// All context package creators are registered in this hashmap
    static ref METADATA: HashMap<ContextPackageName, PackageMetadata> = {
        use ContextPackageName::{AgentMessages, ApiRequests, Neighbors};
        let mut id_creator = PackageIdGenerator::new(PackageType::Context);
        let mut m = HashMap::new();
        m.insert(AgentMessages, PackageMetadata { id: id_creator.next(), dependencies: AgentMessagesCreator::dependencies()});
        m.insert(ApiRequests, PackageMetadata { id: id_creator.next(), dependencies: ApiRequestsCreator::dependencies()});
        m.insert(Neighbors, PackageMetadata { id: id_creator.next(), dependencies: NeighborsCreator::dependencies() });
        m
    };
}
