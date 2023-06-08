use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct RunnerError {
    // TODO: Rename, because "runner errors" should always be internal,
    //       but this might not be.
    pub message: Option<String>,
    pub code: Option<i32>,
    pub line_number: Option<i32>,
    pub file_name: Option<String>,
    pub details: Option<String>,
    pub is_warning: bool,
    pub is_internal: bool,
}
