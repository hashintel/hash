use std::sync::Arc;

use error_stack::{IntoReport, ResultExt};
use execution::{
    package::simulation::init::{InitPackageName, InitialStateName},
    runner::RunnerConfig,
    worker::WorkerConfig,
    worker_pool::WorkerPoolConfig,
};
use stateful::global::Globals;

use crate::{
    config::error::{ConfigError, Result},
    ExperimentRun, PackageConfig, PackageConfigBuilder,
};

#[derive(Clone)]
/// Experiment level configuration
pub struct ExperimentConfig {
    pub packages: Arc<PackageConfig>,
    pub experiment_run: Arc<ExperimentRun>,
    pub worker_pool: Arc<WorkerPoolConfig>,
    /// The size at which the engine aims to split a group of agents
    pub target_max_group_size: usize,
    pub base_globals: Globals,
}

impl ExperimentConfig {
    pub fn new(
        experiment_run: Arc<ExperimentRun>,
        num_workers: usize,
        target_max_group_size: usize,
        runner_config: RunnerConfig,
    ) -> Result<ExperimentConfig> {
        let simulation = experiment_run.simulation();
        // For differentiation purposes when multiple experiment runs are active in the same system
        let package_config = PackageConfigBuilder::new()
            .add_init_package(match simulation.package_init.initial_state.name {
                InitialStateName::InitJson => InitPackageName::Json,
                InitialStateName::InitPy | InitialStateName::InitJs | InitialStateName::InitTs=> InitPackageName::JsPy,
            })
            .build()?;
        let base_globals: Globals = serde_json::from_str(&simulation.globals_src)
            .into_report()
            .attach_printable("Could not parse globals JSON")
            .change_context(ConfigError)?;

        let worker_config = WorkerConfig {
            spawn: experiment_run.create_runner_spawn_config(),
            runner_config,
        };
        let worker_pool = Arc::new(WorkerPoolConfig::new(worker_config, num_workers));

        Ok(ExperimentConfig {
            packages: Arc::new(package_config),
            experiment_run,
            base_globals,
            target_max_group_size,
            worker_pool,
        })
    }
}
