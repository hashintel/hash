mod engine;
mod error;
mod experiment;
mod globals;
mod package;
mod persistence;
mod simulation;
mod store;
mod task_distribution;
pub mod topology;
mod worker;
mod worker_pool;

use std::sync::Arc;

pub use self::{
    engine::{Config as EngineConfig, Worker, WorkerAllocation},
    error::{Error, Result},
    experiment::Config as ExperimentConfig,
    globals::Globals,
    package::{Config as PackageConfig, ConfigBuilder as PackageConfigBuilder},
    persistence::Config as PersistenceConfig,
    simulation::Config as SimulationConfig,
    store::Config as StoreConfig,
    task_distribution::{Config as TaskDistributionConfig, StateBatchDistribution},
    topology::Config as TopologyConfig,
    worker::{Config as WorkerConfig, SpawnConfig as WorkerSpawnConfig},
    worker_pool::Config as WorkerPoolConfig,
};
use crate::{env::Environment, proto::SimulationShortId, Args};

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
        args.v8_initial_heap_constraint,
        args.v8_max_heap_constraint,
    )
}

impl SimRunConfig {
    pub fn new(
        global: &Arc<ExperimentConfig>,
        id: SimulationShortId,
        globals: Globals,
        engine: EngineConfig,
        store: StoreConfig,
        persistence: PersistenceConfig,
        max_num_steps: usize,
    ) -> Result<SimRunConfig> {
        let local = simulation_config(
            id,
            globals,
            engine,
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
}

fn simulation_config(
    id: SimulationShortId,
    globals: Globals,
    engine: EngineConfig,
    _global: &ExperimentConfig,
    store: StoreConfig,
    persistence: PersistenceConfig,
    max_num_steps: usize,
) -> Result<SimulationConfig> {
    Ok(SimulationConfig {
        id,
        globals: Arc::new(globals),
        engine: Arc::new(engine),
        store: Arc::new(store),
        persistence,
        max_num_steps,
    })
}
