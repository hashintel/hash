use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPersistenceConfig {
    pub output_folder: PathBuf,
}
