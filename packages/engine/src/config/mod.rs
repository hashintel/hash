use std::sync::Arc;

use execution::{
    package::{PackageCreatorConfig, PersistenceConfig},
    worker_pool::WorkerAllocation,
};
use simulation_structure::SimulationShortId;
use stateful::{global::Globals, state::StateCreateParameters};

pub use self::{
    error::{Error, Result},
    experiment::Config as ExperimentConfig,
    package::{Config as PackageConfig, ConfigBuilder as PackageConfigBuilder},
    simulation::Config as SimulationConfig,
    store::Config as StoreConfig,
};
use crate::{env::Environment, proto::ExperimentRunTrait, Args};

mod error;
mod experiment;
mod package;
mod simulation;
mod store;

pub const MIN_AGENTS_PER_GROUP: usize = 10;

#[derive(Clone)]
pub struct SimRunConfig {
    pub exp: Arc<ExperimentConfig>,
    pub sim: Arc<SimulationConfig>,
}

pub async fn experiment_config(args: &Args, env: &Environment) -> Result<ExperimentConfig> {
    ExperimentConfig::new(
        env.experiment.clone(),
        args.num_workers,
        args.target_max_group_size,
        args.js_runner_initial_heap_constraint,
        args.js_runner_max_heap_size,
    )
}

impl SimRunConfig {
    pub fn new(
        global: &Arc<ExperimentConfig>,
        id: SimulationShortId,
        globals: Globals,
        worker_allocation: WorkerAllocation,
        store: StoreConfig,
        persistence: PersistenceConfig,
        max_num_steps: usize,
    ) -> Result<SimRunConfig> {
        let local = simulation_config(
            id,
            globals,
            worker_allocation,
            global,
            store,
            persistence,
            max_num_steps,
        )?;
        Ok(SimRunConfig {
            exp: global.clone(),
            sim: Arc::new(local),
        })
    }

    pub fn to_state_create_parameters(&self) -> StateCreateParameters {
        StateCreateParameters {
            target_min_groups: self.exp.worker_pool.num_workers,
            target_group_size: MIN_AGENTS_PER_GROUP..self.exp.target_max_group_size,
            memory_base_id: self.exp.run.base().id,
            agent_schema: Arc::clone(&self.sim.store.agent_schema),
            message_schema: Arc::clone(&self.sim.store.message_schema),
        }
    }
}

fn simulation_config(
    id: SimulationShortId,
    globals: Globals,
    worker_allocation: WorkerAllocation,
    _global: &ExperimentConfig,
    store: StoreConfig,
    persistence: PersistenceConfig,
    max_num_steps: usize,
) -> Result<SimulationConfig> {
    Ok(SimulationConfig {
        id,
        package_creator: PackageCreatorConfig {
            agent_schema: Arc::clone(&store.agent_schema),
            globals,
            persistence,
        },
        worker_allocation: Arc::new(worker_allocation),
        store: Arc::new(store),
        max_num_steps,
    })
}
