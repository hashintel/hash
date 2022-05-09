use std::sync::Arc;

use execution::{package::simulation::PackageCreatorConfig, worker_pool::WorkerAllocation};
use simulation_structure::SimulationShortId;

use crate::config::StoreConfig;

pub struct Config {
    pub id: SimulationShortId,
    pub store: Arc<StoreConfig>,
    pub worker_allocation: Arc<WorkerAllocation>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
