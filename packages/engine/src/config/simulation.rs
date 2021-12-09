use std::sync::Arc;

use super::{EngineConfig, PersistenceConfig, StoreConfig};
use crate::{config::Globals, proto::SimulationShortID};

pub struct Config {
    pub id: SimulationShortID,
    pub globals: Arc<Globals>,
    pub store: Arc<StoreConfig>,
    pub engine: Arc<EngineConfig>,
    pub max_num_steps: usize,
    pub persistence: PersistenceConfig,
}
