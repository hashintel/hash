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

use crate::proto::{ExperimentRunRepr, SimulationShortID};
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

use crate::{Args, Environment};

#[derive(Clone)]
pub struct SimRunConfig<E: ExperimentRunRepr> {
    pub exp: Arc<ExperimentConfig<E>>,
    pub sim: Arc<SimulationConfig>,
}

pub async fn experiment_config<E: ExperimentRunRepr>(
    args: &Args,
    env: &Environment<E>,
) -> Result<ExperimentConfig<E>> {
    ExperimentConfig::new(
        env.experiment.clone(),
        args.max_workers.unwrap_or_else(num_cpus::get),
    )
}

impl<E: ExperimentRunRepr> SimRunConfig<E> {
    pub fn new(
        global: &Arc<ExperimentConfig<E>>,
        id: SimulationShortID,
        globals: Globals,
        engine: EngineConfig,
        store: StoreConfig,
        persistence: PersistenceConfig,
        max_num_steps: usize,
    ) -> Result<SimRunConfig<E>> {
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

fn simulation_config<E: ExperimentRunRepr>(
    id: SimulationShortID,
    globals: Globals,
    engine: EngineConfig,
    _global: &ExperimentConfig<E>,
    store: StoreConfig,
    persistence: PersistenceConfig,
    max_num_steps: usize,
) -> Result<SimulationConfig> {
    Ok(SimulationConfig {
        id,
        globals: Arc::new(globals),
        engine,
        store: Arc::new(store),
        persistence,
        max_num_steps,
    })
}
