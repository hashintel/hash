use std::fmt;

use serde::Serialize;

/// All init package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InitPackageName {
    Json,
    JsPy,
}

impl fmt::Display for InitPackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}
