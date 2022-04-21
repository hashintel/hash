use async_trait::async_trait;
use serde_json::Value;
use stateful::agent::Agent;

use crate::{
    proto::InitialStateName,
    simulation::{
        package::{
            init::{
                Arc, FieldSpecMapAccessor, InitPackage, InitPackageCreator, MaybeCpuBound, Package,
                PackageComms, PackageCreator, SimRunConfig,
            },
            PackageInitConfig,
        },
        Error, Result,
    },
};

pub struct JsonInitCreator;

impl InitPackageCreator for JsonInitCreator {
    fn create(
        &self,
        _config: &Arc<SimRunConfig>,
        init_config: &PackageInitConfig,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn InitPackage>> {
        match &init_config.initial_state.name {
            InitialStateName::InitJson => Ok(Box::new(JsonInit {
                initial_state_src: init_config.initial_state.src.clone(),
            })),
            name => {
                return Err(Error::from(format!(
                    "Trying to create a JSON init package but the init file didn't end in .json \
                     but instead was: {:?}",
                    name
                )));
            }
        }
    }
}

impl PackageCreator for JsonInitCreator {
    fn init_message(&self) -> Result<Value> {
        // TODO: possibly pass init.json here to optimize
        Ok(Value::Null)
    }
}

pub struct JsonInit {
    initial_state_src: String,
}

impl MaybeCpuBound for JsonInit {
    fn cpu_bound(&self) -> bool {
        false
    }
}

impl Package for JsonInit {
    fn start_message(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl InitPackage for JsonInit {
    async fn run(&mut self) -> Result<Vec<Agent>> {
        // TODO: Map Error when we design package errors
        serde_json::from_str(&self.initial_state_src).map_err(|e| {
            Error::from(format!(
                "Failed to parse agent state JSON to Vec<Agent>: {:?}",
                e
            ))
        })
    }
}
