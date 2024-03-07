use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{url::ParseVersionedUrlError, ParseOneOfError};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseOneOfArrayError {
    #[error("invalid items definition inside array: `{0}`")]
    InvalidItems(ParseOneOfError),
    #[error("error in JSON: `{0}`")]
    InvalidJson(String),
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParsePropertyTypeReferenceArrayError {
    #[error("invalid property type reference inside items: `{0}`")]
    InvalidReference(ParseVersionedUrlError),
    #[error("error in JSON: `{0}`")]
    InvalidJson(String),
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseEntityTypeReferenceArrayError {
    #[error("invalid OneOf entity type reference inside items: `{0}`")]
    InvalidReference(ParseOneOfError),
    #[error("error in JSON: `{0}`")]
    InvalidJson(String),
}
