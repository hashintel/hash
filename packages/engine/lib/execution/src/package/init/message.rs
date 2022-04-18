use serde::{Deserialize, Serialize};

use crate::package::init::script::JsPyInitTaskMessage;

/// All init package task messages are registered in this enum
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum InitTaskMessage {
    JsPyInitTaskMessage(JsPyInitTaskMessage),
}
