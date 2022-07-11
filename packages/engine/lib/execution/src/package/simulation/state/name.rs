use std::{collections::HashMap, fmt};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    package::simulation::{
        state::{behavior_execution::BehaviorExecutionCreator, topology::TopologyCreator},
        Dependencies, PackageCreator, PackageIdGenerator, PackageMetadata, PackageType,
    },
    Error, Result,
};

/// All state package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatePackageName {
    BehaviorExecution,
    Topology,
}

impl StatePackageName {
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

impl fmt::Display for StatePackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

lazy_static! {
    static ref METADATA: HashMap<StatePackageName, PackageMetadata> = {
        use StatePackageName::{BehaviorExecution, Topology};
        let mut id_creator = PackageIdGenerator::new(PackageType::State);
        let mut m = HashMap::new();
        m.insert(BehaviorExecution, PackageMetadata {
            id: id_creator.next(),
            dependencies: BehaviorExecutionCreator::dependencies(),
        });
        m.insert(Topology, PackageMetadata {
            id: id_creator.next(),
            dependencies: TopologyCreator::dependencies(),
        });
        m
    };
}
