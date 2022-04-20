pub mod js_py;
pub mod json;

use std::{
    collections::{hash_map::Iter, HashMap},
    fmt,
    lazy::SyncOnceCell,
    sync::Arc,
};

use lazy_static::lazy_static;
use serde::Serialize;
use stateful::field::PackageId;

use crate::{
    config::ExperimentConfig,
    simulation::{
        package::{
            ext_traits::PackageCreator,
            id::PackageIdGenerator,
            init::{
                packages::{js_py::ScriptInitCreator, json::JsonInitCreator},
                InitPackageCreator,
            },
            PackageMetadata, PackageType,
        },
        Error, Result,
    },
};

/// All init package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Name {
    Json,
    JsPy,
}

impl Name {
    pub fn id(self) -> Result<PackageId> {
        Ok(METADATA
            .get(&self)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package Metadata not registered for package: {self}"
                ))
            })?
            .id)
    }
}

impl fmt::Display for Name {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

pub struct PackageCreators(SyncOnceCell<HashMap<Name, Box<dyn InitPackageCreator>>>);

pub static PACKAGE_CREATORS: PackageCreators = PackageCreators(SyncOnceCell::new());

impl PackageCreators {
    pub(crate) fn initialize_for_experiment_run(
        &self,
        _experiment_config: &Arc<ExperimentConfig>,
    ) -> Result<()> {
        tracing::debug!("Initializing Init Package Creators");
        use Name::{JsPy, Json};
        let mut m = HashMap::<_, Box<dyn InitPackageCreator>>::new();
        m.insert(Json, Box::new(JsonInitCreator));
        m.insert(JsPy, Box::new(ScriptInitCreator));
        self.0
            .set(m)
            .map_err(|_| Error::from("Failed to initialize Init Package Creators"))?;
        Ok(())
    }

    pub(crate) fn get_checked(&self, name: &Name) -> Result<&Box<dyn InitPackageCreator>> {
        self.0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .get(name)
            .ok_or_else(|| {
                Error::from(format!(
                    "Package creator: {} wasn't within the Init Package Creators map",
                    name
                ))
            })
    }

    #[allow(dead_code)] // It is used in a test in deps.rs but the compiler fails to pick it up
    pub(crate) fn iter_checked(&self) -> Result<Iter<'_, Name, Box<dyn InitPackageCreator>>> {
        Ok(self
            .0
            .get()
            .ok_or_else(|| Error::from("Init Package Creators weren't initialized"))?
            .iter())
    }
}

lazy_static! {
    pub static ref METADATA: HashMap<Name, PackageMetadata> = {
        use Name::{JsPy, Json};
        let mut id_creator = PackageIdGenerator::new(PackageType::Init);
        let mut m = HashMap::new();
        m.insert(
            Json,
            PackageMetadata::new(id_creator.next(), JsonInitCreator::dependencies()),
        );
        m.insert(
            JsPy,
            PackageMetadata::new(id_creator.next(), ScriptInitCreator::dependencies()),
        );
        m
    };
}
