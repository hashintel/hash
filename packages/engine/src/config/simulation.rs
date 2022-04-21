use std::sync::Arc;

use crate::{
    config::{EngineConfig, StoreConfig},
    proto::SimulationShortId,
    simulation::package::PackageCreatorConfig,
};

pub struct Config {
    pub id: SimulationShortId,
    pub store: Arc<StoreConfig>,
    pub engine: Arc<EngineConfig>,
    pub max_num_steps: usize,
    pub package_creator: PackageCreatorConfig,
}
