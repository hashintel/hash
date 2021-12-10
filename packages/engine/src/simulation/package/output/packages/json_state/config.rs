use serde::{Deserialize, Serialize};

use crate::{simulation::Result, ExperimentConfig};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct JsonStateOutputConfig {
    pub retain_hidden: bool,
    pub retain_private: bool,
}

impl JsonStateOutputConfig {
    pub fn new(_config: &ExperimentConfig) -> Result<JsonStateOutputConfig> {
        // TODO: make this configurable
        Ok(JsonStateOutputConfig::default())
    }
}
