use std::{collections::HashMap, fmt};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    package::simulation::{
        init::{js_py::JsPyInitCreator, json::JsonInitCreator},
        Dependencies, PackageCreator, PackageIdGenerator, PackageMetadata, PackageType,
    },
    Error, Result,
};

/// All init package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InitPackageName {
    Json,
    JsPy,
}

impl InitPackageName {
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

impl fmt::Display for InitPackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

lazy_static! {
    static ref METADATA: HashMap<InitPackageName, PackageMetadata> = {
        use InitPackageName::{JsPy, Json};
        let mut id_creator = PackageIdGenerator::new(PackageType::Init);
        let mut m = HashMap::new();
        m.insert(Json, PackageMetadata {
            id: id_creator.next(),
            dependencies: JsonInitCreator::dependencies(),
        });
        m.insert(JsPy, PackageMetadata {
            id: id_creator.next(),
            dependencies: JsPyInitCreator::dependencies(),
        });
        m
    };
}
