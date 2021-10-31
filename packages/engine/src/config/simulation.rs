use std::sync::Arc;

use crate::hash_types::Properties;
use crate::proto::SimulationShortID;

use super::{EngineConfig, PersistenceConfig, StoreConfig};

pub struct Config {
    pub id: SimulationShortID,
    pub globals: Arc<Properties>,
    pub store: Arc<StoreConfig>,
    pub engine: EngineConfig,
    pub max_num_steps: usize,
    pub persistence: PersistenceConfig,
}
