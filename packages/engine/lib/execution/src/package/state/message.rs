use serde::{Deserialize, Serialize};

use crate::package::state::behavior_execution::ExecuteBehaviorsTaskMessage;

/// All state package task messages are registered in this enum
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum StateTaskMessage {
    ExecuteBehaviorsTaskMessage(ExecuteBehaviorsTaskMessage),
}
