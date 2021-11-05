use crate::simulation::enum_dispatch::*;
use serde::{Deserialize, Serialize};

use crate::simulation::package::PackageType;
use crate::worker::runner::comms::MessageTarget;

// TODO OS - We want to do enum_dispatch(Into<TaskResult>) but cannot as the trait itself isn't marked with enum_dispatch,
//  We therefore need to make a wrapper trait that forces/wraps Into<TaskResult> and then use that
#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Clone, Debug, Serialize, Deserialize)]
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
