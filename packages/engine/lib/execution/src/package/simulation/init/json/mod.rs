//! Initial state generation from a fixed JSON file.

use async_trait::async_trait;
use stateful::{agent::Agent, field::FieldSpecMapAccessor};

use crate::{
    package::simulation::{
        init::{InitPackage, InitPackageCreator, InitialStateName},
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig,
    },
    Error, Result,
};

pub struct JsonInit {
    pub initial_state_src: String,
}

impl Package for JsonInit {}

impl MaybeCpuBound for JsonInit {
    fn cpu_bound(&self) -> bool {
        false
    }
}

#[async_trait]
impl InitPackage for JsonInit {
    async fn run(&mut self) -> Result<Vec<Agent>> {
        // TODO: Map Error when we design package errors
        serde_json::from_str(&self.initial_state_src).map_err(|e| {
            Error::from(format!(
                "Failed to parse agent state JSON to Vec<Agent>: {e:?}"
            ))
        })
    }
}

pub struct JsonInitCreator;

impl InitPackageCreator for JsonInitCreator {
    fn create(
        &self,
        _config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &init_config.initial_state.name {
            InitialStateName::InitJson => Ok(Box::new(JsonInit {
                initial_state_src: init_config.initial_state.src.clone(),
            })),
            name => Err(Error::from(format!(
                "Trying to create a JSON init package but the init file didn't end in .json but \
                 instead was: {:?}",
                name
            ))),
        }
    }
}

// TODO: possibly pass init.json here to optimize
impl PackageCreator for JsonInitCreator {}
