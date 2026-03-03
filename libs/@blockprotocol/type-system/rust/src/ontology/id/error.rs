use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

// TODO: Use error-stack
//   see https://linear.app/hash/issue/BE-160/simplify-error-handling-in-type-system-package
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseBaseUrlError {
    #[error("URL is missing a trailing slash")]
    MissingTrailingSlash,
    #[error("{0}")]
    UrlParseError(String), // TODO: can we do better than a string here
    #[error("URL cannot cannot be a base")]
    CannotBeABase,
    #[error("URL cannot cannot be more than 2048 characters long")]
    TooLong,
}

// TODO: Use error-stack
//   see https://linear.app/hash/issue/BE-160/simplify-error-handling-in-type-system-package
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseVersionedUrlError {
    #[error("incorrect formatting")]
    IncorrectFormatting,
    #[error("invalid base url: {0}")]
    InvalidBaseUrl(ParseBaseUrlError),
    #[error("missing version")]
    MissingVersion,
    #[error("invalid version `{0}`: {1}")]
    InvalidVersion(String, ParseOntologyTypeVersionError),
    #[error("URL cannot cannot be more than 2048 characters long")]
    TooLong,
}

// TODO: Use error-stack
//   see https://linear.app/hash/issue/BE-160/simplify-error-handling-in-type-system-package
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseOntologyTypeVersionError {
    #[error("missing version")]
    MissingVersion,
    #[error("not an integer: `{0}`")]
    ParseVersion(String),
    #[error("invalid pre-release `{0}`: {1}")]
    InvalidPreRelease(String, ParseDraftInfoError),
}

// TODO: Use error-stack
//   see https://linear.app/hash/issue/BE-160/simplify-error-handling-in-type-system-package
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseDraftInfoError {
    #[error("incorrect formatting")]
    IncorrectFormatting,
    #[error("invalid lane: {0}")]
    InvalidLane(String),
    #[error("missing revision")]
    MissingRevision,
    #[error("invalid revision `{0}`: {1}")]
    InvalidRevision(String, String),
}
