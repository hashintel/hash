use serde::{Deserialize, Serialize};

/// All context package task messages are registered in this enum
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ContextTaskMessage {}
