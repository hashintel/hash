use std::sync::Arc;

use crate::config::Globals;
use crate::proto::SimulationShortID;

use super::{EngineConfig, PersistenceConfig, StoreConfig};

pub struct Config {
    pub id: SimulationShortID,
    pub globals: Arc<Globals>,
    pub store: Arc<StoreConfig>,
    pub engine: Arc<EngineConfig>,
    pub max_num_steps: usize,
    pub persistence: PersistenceConfig,
}
