use std::sync::Arc;

use execution::{
    package::simulation::init::{InitPackageName, InitialStateName},
    runner::RunnerConfig,
    worker::WorkerConfig,
    worker_pool::WorkerPoolConfig,
};
use simulation_structure::{Experiment, ExperimentRun, Simulation};
use stateful::global::Globals;

use crate::config::{package, Result};

#[derive(Clone)]
/// Experiment level configuration
pub struct ExperimentConfig {
    pub packages: Arc<package::PackageConfig>,
    pub run: Arc<ExperimentRun>,
    pub worker_pool: Arc<WorkerPoolConfig>,
    /// The size at which the engine aims to split a group of agents
    pub target_max_group_size: usize,
    pub base_globals: Globals,
}

impl ExperimentConfig {
    pub(super) fn new(
        experiment_run: Arc<ExperimentRun>,
        num_workers: usize,
        target_max_group_size: usize,
        runner_config: RunnerConfig,
    ) -> Result<ExperimentConfig> {
        let experiment = experiment_run.experiment();
        let simulation = experiment_run.simulation();
        // For differentiation purposes when multiple experiment runs are active in the same system
        let package_config = package::PackageConfigBuilder::new()
            .add_init_package(match simulation.package_init.initial_state.name {
                InitialStateName::InitJson => InitPackageName::Json,
                InitialStateName::InitPy | InitialStateName::InitJs => InitPackageName::JsPy,
            })
            .build()?;
        let base_globals = Globals::from_json(serde_json::from_str(&simulation.globals_src)?)?;

        let worker_config = WorkerConfig {
            spawn: experiment.create_runner_spawn_config(),
            runner_config,
        };
        let worker_pool = Arc::new(WorkerPoolConfig::new(worker_config, num_workers));

        Ok(ExperimentConfig {
            packages: Arc::new(package_config),
            run: experiment_run,
            base_globals,
            target_max_group_size,
            worker_pool,
        })
    }

    pub fn experiment(&self) -> &Experiment {
        self.run.experiment()
    }

    pub fn simulation(&self) -> &Simulation {
        self.experiment().simulation()
    }
}
