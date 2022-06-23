use std::sync::Arc;

use execution::{
    package::simulation::{PackageCreatorConfig, SimulationId},
    worker_pool::WorkerAllocation,
};

use crate::config::SchemaConfig;

pub struct SimulationConfig {
    pub id: SimulationId,
    pub store: Arc<SchemaConfig>,
    pub worker_allocation: Arc<WorkerAllocation>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
