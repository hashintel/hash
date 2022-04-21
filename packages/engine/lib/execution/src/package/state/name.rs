use std::fmt;

use serde::Serialize;

/// All state package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StatePackageName {
    BehaviorExecution,
    Topology,
}

impl fmt::Display for StatePackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}
