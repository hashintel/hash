use async_trait::async_trait;
use serde_json::Value;
use stateful::{agent::Agent, field::EngineComponent};

use crate::{
    proto::{ExperimentRunTrait, InitialStateName},
    simulation::{
        package::init::{
            Arc, ExperimentConfig, FieldSpecMapAccessor, GetWorkerExpStartMsg,
            GetWorkerSimStartMsg, MaybeCpuBound, Package as InitPackage, PackageComms,
            PackageCreator, SimRunConfig,
        },
        Error, Result,
    },
};

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        _accessor: FieldSpecMapAccessor<EngineComponent>,
    ) -> Result<Box<dyn InitPackage>> {
        match &config.exp.run.base().project_base.initial_state.name {
            InitialStateName::InitJson => Ok(Box::new(Package {
                initial_state_src: config.exp.run.base().project_base.initial_state.src.clone(),
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

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        // TODO: possibly pass init.json here to optimize
        Ok(Value::Null)
    }
}
pub struct Package {
    initial_state_src: String,
}

impl MaybeCpuBound for Package {
    fn cpu_bound(&self) -> bool {
        false
    }
}

impl GetWorkerSimStartMsg for Package {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl InitPackage for Package {
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
