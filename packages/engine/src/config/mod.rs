mod engine;
mod error;
mod experiment;
pub mod globals;
mod package;
mod persistence;
mod simulation;
mod store;
mod task_distribution;
pub mod topology;
mod worker;
mod worker_pool;

use std::sync::Arc;

pub use engine::{Config as EngineConfig, Worker, WorkerAllocation};
pub use error::{Error, Result};
pub use experiment::Config as ExperimentConfig;
pub use globals::Globals;
pub use package::{Config as PackageConfig, ConfigBuilder as PackageConfigBuilder};
pub use persistence::Config as PersistenceConfig;
pub use simulation::Config as SimulationConfig;
pub use store::Config as StoreConfig;
pub use task_distribution::{Config as TaskDistributionConfig, Distribution};
pub use topology::Config as TopologyConfig;
pub use worker::{Config as WorkerConfig, SpawnConfig as WorkerSpawnConfig};
pub use worker_pool::Config as WorkerPoolConfig;

use crate::{proto::SimulationShortID, Args, Environment};

#[derive(Clone)]
pub struct SimRunConfig {
    pub exp: Arc<ExperimentConfig>,
    pub sim: Arc<SimulationConfig>,
}

pub async fn experiment_config(args: &Args, env: &Environment) -> Result<ExperimentConfig> {
    ExperimentConfig::new(
        env.experiment.clone(),
        args.max_workers.unwrap_or_else(num_cpus::get),
    )
}

impl SimRunConfig {
    pub fn new(
        global: &Arc<ExperimentConfig>,
        id: SimulationShortID,
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
            &global,
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
    id: SimulationShortID,
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
