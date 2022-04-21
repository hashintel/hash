use std::fmt;

use serde::Serialize;

/// All output package names are registered in this enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputPackageName {
    Analysis,
    JsonState,
}

impl fmt::Display for OutputPackageName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}
