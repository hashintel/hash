use std::sync::Arc;

use execution::{
    package::simulation::{PackageCreatorConfig, SimulationId},
    worker_pool::WorkerAllocation,
};
use stateful::field::Schema;

pub struct SimulationConfig {
    pub id: SimulationId,
    pub schema: Arc<Schema>,
    pub worker_allocation: Arc<WorkerAllocation>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
