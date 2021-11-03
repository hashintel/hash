use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};

use super::prelude::*;
use crate::simulation::packages::PackageType;
use crate::{
    simulation::packages::id::PackageId, types::TaskID, worker::runner::comms::MessageTarget,
};

#[enum_dispatch]
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
