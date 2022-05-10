use std::sync::Arc;

use execution::{
    package::{
        experiment::ExperimentName,
        simulation::init::{InitPackageName, InitialStateName},
    },
    runner::RunnerConfig,
    worker::WorkerConfig,
    worker_pool::WorkerPoolConfig,
};
use stateful::global::Globals;

use crate::{
    config::{package, Result},
    proto::{ExperimentRunRepr, ExperimentRunTrait},
};

#[derive(Clone)]
/// Experiment level configuration
pub struct Config {
    pub packages: Arc<package::Config>,
    pub run: Arc<ExperimentRunRepr>,
    pub worker_pool: Arc<WorkerPoolConfig>,
    /// The size at which the engine aims to split a group of agents
    pub target_max_group_size: usize,
    pub base_globals: Globals,
}

impl Config {
    pub(super) fn new(
        experiment_run: ExperimentRunRepr,
        num_workers: usize,
        target_max_group_size: usize,
        js_runner_initial_heap_constraint: Option<usize>,
        js_runner_max_heap_size: Option<usize>,
    ) -> Result<Config> {
        // For differentiation purposes when multiple experiment runs are active in the same system
        let package_config = package::ConfigBuilder::new()
            .add_init_package(
                match experiment_run
                    .base()
                    .project_base
                    .package_init
                    .initial_state
                    .name
                {
                    InitialStateName::InitJson => InitPackageName::Json,
                    InitialStateName::InitPy | InitialStateName::InitJs => InitPackageName::JsPy,
                },
            )
            .build()?;
        let base_globals = Globals::from_json(serde_json::from_str(
            &experiment_run.base().project_base.globals_src,
        )?)?;

        let run = Arc::new(experiment_run);

        let worker_config = WorkerConfig {
            spawn: run.base().create_runner_spawn_config(),
            runner_config: RunnerConfig {
                js_runner_initial_heap_constraint,
                js_runner_max_heap_size,
            },
        };
        let worker_pool = Arc::new(WorkerPoolConfig::new(worker_config, num_workers));

        Ok(Config {
            packages: Arc::new(package_config),
            run,
            base_globals,
            target_max_group_size,
            worker_pool,
        })
    }

    // Downcast this config
    pub fn to_base(&self) -> Result<Config> {
        let run_base = self.run.base().clone();
        Ok(Config {
            packages: self.packages.clone(),
            run: Arc::new(ExperimentRunRepr::ExperimentRunBase(run_base)),
            worker_pool: self.worker_pool.clone(),
            target_max_group_size: self.target_max_group_size,
            base_globals: self.base_globals.clone(),
        })
    }

    pub fn name(&self) -> &ExperimentName {
        &self.run.base().name
    }
}

impl From<&Config> for Config {
    fn from(value: &Config) -> Self {
        Self {
            packages: value.packages.clone(),
            run: Arc::clone(&value.run),
            worker_pool: value.worker_pool.clone(),
            target_max_group_size: value.target_max_group_size,
            base_globals: value.base_globals.clone(),
        }
    }
}
