use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPersistenceConfig {
    pub output_folder: PathBuf,
}
