use crate::simulation::enum_dispatch::*;
use serde::{Deserialize, Serialize};

use crate::simulation::packages::PackageType;
use crate::worker::runner::comms::MessageTarget;

#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Debug, Serialize, Deserialize)]
pub enum TaskMessage {
    InitTaskMessage,
    ContextTaskMessage,
    StateTaskMessage,
    OutputTaskMessage,
}

impl From<(String, PackageType)> for TaskMessage {
    fn from(_: (String, PackageType)) -> Self {
        todo!()
    }
}

pub struct TargetedTaskMessage {
    pub target: MessageTarget,
    pub payload: TaskMessage,
}
