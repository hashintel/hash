use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{url::ParseVersionedUrlError, ParsePropertyTypeError, ValidationError};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Deserialize, Serialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseOneOfError {
    #[error("invalid entity type reference: `{0}`")]
    EntityTypeReferenceError(ParseVersionedUrlError),
    #[error("invalid value definition: `{0}`")]
    PropertyValuesError(ParsePropertyTypeError),
    #[error("failed validation: `{0}`")]
    ValidationError(ValidationError),
}
