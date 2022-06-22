use std::sync::Arc;

use execution::{
    package::simulation::init::{InitPackageName, InitialStateName},
    runner::RunnerConfig,
    worker::WorkerConfig,
    worker_pool::WorkerPoolConfig,
};
use simulation_structure::{Experiment, Simulation};
use stateful::global::Globals;

use crate::{
    config::{package, Result},
    proto::ExperimentRun,
};

#[derive(Clone)]
/// Experiment level configuration
pub struct ExperimentConfig {
    pub packages: Arc<package::Config>,
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
        js_runner_initial_heap_constraint: Option<usize>,
        js_runner_max_heap_size: Option<usize>,
    ) -> Result<ExperimentConfig> {
        let experiment = experiment_run.experiment();
        let simulation = experiment_run.simulation();
        // For differentiation purposes when multiple experiment runs are active in the same system
        let package_config = package::ConfigBuilder::new()
            .add_init_package(match simulation.package_init.initial_state.name {
                InitialStateName::InitJson => InitPackageName::Json,
                InitialStateName::InitPy | InitialStateName::InitJs => InitPackageName::JsPy,
            })
            .build()?;
        let base_globals = Globals::from_json(serde_json::from_str(&simulation.globals_src)?)?;

        let worker_config = WorkerConfig {
            spawn: experiment.create_runner_spawn_config(),
            runner_config: RunnerConfig {
                js_runner_initial_heap_constraint,
                js_runner_max_heap_size,
            },
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
