use serde::{Deserialize, Serialize};

use crate::{package::simulation::PackageInitConfig, Result};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct JsonStateOutputConfig {
    pub retain_hidden: bool,
    pub retain_private: bool,
}

impl JsonStateOutputConfig {
    pub fn new(_config: &PackageInitConfig) -> Result<JsonStateOutputConfig> {
        // TODO: make this configurable
        Ok(JsonStateOutputConfig::default())
    }
}
