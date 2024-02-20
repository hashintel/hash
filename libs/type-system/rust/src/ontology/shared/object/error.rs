use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{
    url::{ParseBaseUrlError, ParseVersionedUrlError},
    ParsePropertyTypeReferenceArrayError, ValidationError,
};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParsePropertyTypeObjectError {
    #[error("invalid property type reference: `{0}`")]
    InvalidPropertyTypeReference(ParseVersionedUrlError),
    #[error("invalid array definition: `{0}`")]
    InvalidArray(ParsePropertyTypeReferenceArrayError),
    #[error("invalid property key: `{0}`")]
    InvalidPropertyKey(ParseBaseUrlError),
    #[error("invalid key inside required: `{0}`")]
    InvalidRequiredKey(ParseBaseUrlError),
    #[error("failed validation: `{0}`")]
    ValidationError(ValidationError),
    #[error("error in JSON: `{0}`")]
    InvalidJson(String),
}
