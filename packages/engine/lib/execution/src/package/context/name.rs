use std::fmt;

use serde::Serialize;

/// All context package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextPackageName {
    AgentMessages,
    ApiRequests,
    Neighbors,
}

impl fmt::Display for ContextPackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}
