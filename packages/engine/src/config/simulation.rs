use std::sync::Arc;

use execution::package::PackageCreatorConfig;
use simulation_structure::SimulationShortId;

use crate::config::{EngineConfig, StoreConfig};

pub struct Config {
    pub id: SimulationShortId,
    pub store: Arc<StoreConfig>,
    pub engine: Arc<EngineConfig>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
