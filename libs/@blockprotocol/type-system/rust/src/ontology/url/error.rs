use serde::{Deserialize, Serialize};
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

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

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, Error)]
#[serde(tag = "reason", content = "inner")]
pub enum ParseVersionedUrlError {
    #[error("incorrect formatting")]
    IncorrectFormatting,
    #[error("missing version")]
    MissingVersion,
    #[error("invalid version `{0}`: {1}")]
    InvalidVersion(String, String),
    #[error("additional end content: {0}")]
    AdditionalEndContent(String),
    #[error("invalid base url: {0}")]
    InvalidBaseUrl(ParseBaseUrlError),
    #[error("URL cannot cannot be more than 2048 characters long")]
    TooLong,
}
