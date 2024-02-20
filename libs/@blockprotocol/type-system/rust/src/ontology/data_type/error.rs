use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::url::ParseVersionedUrlError;

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseDataTypeError {
    #[error("invalid `$schema` property, expected `\"https://blockprotocol.org/types/modules/graph/0.3/schema/data-type\"` but received: `{0}`")]
    InvalidMetaSchema(String),
    #[error("invalid versioned URL: `{0}`")]
    InvalidVersionedUrl(ParseVersionedUrlError),
    #[error("error in JSON: `{0}`")]
    InvalidJson(String),
}
