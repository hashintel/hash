// Attribution: *Heavily* inspired by the Google Cloud API Error Model
//  https://cloud.google.com/apis/design/errors

//! Defines a logical status and error model that is suitable for different programming
//! environments, including REST APIs and RPC APIs.

mod status_code;

use std::fmt::Debug;

use serde::{Deserialize, Serialize};
pub use status_code::StatusCode;

/// The canonical shape of a response object describing the status of a request between services.
#[derive(Clone, Eq, Debug, PartialEq, Serialize, Deserialize)]
pub struct Status<D>
where
    D: Send + Sync + Debug,
{
    code: StatusCode,
    /// A developer-facing description of the status.
    ///
    /// Where possible, this should provide guiding advice for debugging and/or handling the error.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    contents: Vec<D>,
}

impl<D> Status<D>
where
    D: Send + Sync + Debug + Serialize + for<'de> Deserialize<'de>,
{
    #[must_use]
    pub fn new(code: StatusCode, message: Option<String>, contents: Vec<D>) -> Self {
        Self {
            code,
            message,
            contents,
        }
    }

    #[must_use]
    pub const fn code(&self) -> StatusCode {
        self.code
    }

    #[must_use]
    pub const fn message(&self) -> &Option<String> {
        &self.message
    }

    #[must_use]
    pub fn contents(&self) -> &[D] {
        &self.contents
    }
}
