use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{url::ParseVersionedUrlError, ParseEntityTypeReferenceArrayError};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseLinksError {
    #[error("invalid link key: `{0}`")]
    InvalidLinkKey(ParseVersionedUrlError),
    #[error("invalid array definition: `{0}`")]
    InvalidArray(ParseEntityTypeReferenceArrayError),
    #[error("error in JSON: `{0}`")]
    InvalidJson(String),
}
