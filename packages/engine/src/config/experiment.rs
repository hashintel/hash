use std::sync::Arc;

use crate::{
    config::{globals::Globals, package, worker, worker_pool, Result},
    proto::{ExperimentName, ExperimentRunRepr, ExperimentRunTrait, InitialStateName},
    simulation::package::init,
};

#[derive(Clone)]
/// Experiment level configuration
pub struct Config {
    pub packages: Arc<package::Config>,
    pub run: Arc<ExperimentRunRepr>,
    pub worker_pool: Arc<worker_pool::Config>,
    /// The size at which the engine aims to split a group of agents
    pub target_max_group_size: usize,
    pub v8_initial_heap_constraint: usize,
    pub v8_max_heap_constraint: usize,
    pub base_globals: Globals,
}

impl Config {
    pub(super) fn new(
        experiment_run: ExperimentRunRepr,
        num_workers: usize,
        target_max_group_size: usize,
        v8_initial_heap_constraint: usize,
        v8_max_heap_constraint: usize,
    ) -> Result<Config> {
        // For differentiation purposes when multiple experiment runs are active in the same system
        let package_config = package::ConfigBuilder::new()
            .add_init_package(
                match experiment_run.base().project_base.initial_state.name {
                    InitialStateName::InitJson => init::Name::Json,
                    InitialStateName::InitPy | InitialStateName::InitJs => init::Name::JsPy,
                },
            )
            .build()?;
        let base_globals = Globals::from_json(serde_json::from_str(
            &experiment_run.base().project_base.globals_src,
        )?)?;

        let run = Arc::new(experiment_run);

        // TODO: Rust, Python
        // TODO: Ask packages for what language execution they require.
        let worker_base_config = worker::Config {
            spawn: worker::SpawnConfig {
                python: true,
                rust: false,
                javascript: true,
            },
            v8_initial_heap_constraint,
            v8_max_heap_constraint,
        };
        let worker_pool = Arc::new(worker_pool::Config::new(worker_base_config, num_workers));

        Ok(Config {
            packages: Arc::new(package_config),
            run,
            base_globals,
            target_max_group_size,
            v8_initial_heap_constraint,
            v8_max_heap_constraint,
            worker_pool,
        })
    }

    // Downcast this config
    pub fn to_base(&self) -> Result<Config> {
        let run_base = self.run.base().clone();
        Ok(Config {
            packages: self.packages.clone(),
            run: Arc::new(run_base.into()),
            worker_pool: self.worker_pool.clone(),
            target_max_group_size: self.target_max_group_size,
            base_globals: self.base_globals.clone(),
            v8_initial_heap_constraint: self.v8_initial_heap_constraint,
            v8_max_heap_constraint: self.v8_max_heap_constraint,
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
            v8_initial_heap_constraint: value.v8_initial_heap_constraint,
            v8_max_heap_constraint: value.v8_max_heap_constraint,
        }
    }
}
