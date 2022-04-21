use std::sync::Arc;

use execution::package::PackageCreatorConfig;

use crate::{
    config::{EngineConfig, StoreConfig},
    proto::SimulationShortId,
};

pub struct Config {
    pub id: SimulationShortId,
    pub store: Arc<StoreConfig>,
    pub engine: Arc<EngineConfig>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
