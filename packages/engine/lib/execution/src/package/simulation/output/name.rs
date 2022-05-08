use std::{collections::HashMap, fmt};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    package::simulation::{
        output::{analysis::AnalysisCreator, json_state::JsonStateCreator},
        Dependencies, PackageCreator, PackageIdGenerator, PackageMetadata, PackageType,
    },
    Error, Result,
};

/// All output package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputPackageName {
    Analysis,
    JsonState,
}

impl OutputPackageName {
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

impl fmt::Display for OutputPackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

lazy_static! {
    static ref METADATA: HashMap<OutputPackageName, PackageMetadata> = {
        use OutputPackageName::{Analysis, JsonState};
        let mut id_creator = PackageIdGenerator::new(PackageType::Output);
        let mut m = HashMap::new();
        m.insert(Analysis, PackageMetadata {
            id: id_creator.next(),
            dependencies: AnalysisCreator::dependencies(),
        });
        m.insert(JsonState, PackageMetadata {
            id: id_creator.next(),
            dependencies: JsonStateCreator::dependencies(),
        });
        m
    };
}
