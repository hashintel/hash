use serde::{Deserialize, Serialize};

/// All output package task messages are registered in this enum
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum OutputTaskMessage {}
