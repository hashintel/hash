use std::sync::Arc;

use execution::{
    package::simulation::{PackageCreatorConfig, SimulationId},
    worker_pool::WorkerAllocation,
};

use crate::config::StoreConfig;

pub struct Config {
    pub id: SimulationId,
    pub store: Arc<StoreConfig>,
    pub worker_allocation: Arc<WorkerAllocation>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
