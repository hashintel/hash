//! Extractors whose rejections are problem details responses.
//!
//! [`Json`] also answers with a JSON body, and answers a body that fails to serialize with a
//! problem details response.
//!
//! Axum's extractors answer a rejection with plain text. These wrap them and answer
//! `application/problem+json`, with the status axum chose for each rejection they name. Each one
//! lists the ways it rejects a request as the variants of its [`Problem`](problematic::Problem), so
//! an operation documents them through the extractors it reads, together with the variants of every
//! other source at the same status.

mod json;
mod path;
mod query;
#[cfg(test)]
mod tests;

use aide::openapi::Operation;
use serde_json::Value;

pub(in crate::rest) use self::{json::Json, path::Path, query::Query};

/// The part of a request or response an item of this module reads or writes.
///
/// Each item marks the operations it documents with its part, and [`openapi::build`] requires that
/// mark for every path parameter, query parameter, request body and JSON response an operation
/// documents.
///
/// [`openapi::build`]: crate::rest::openapi::build
#[derive(Debug, Clone, Copy)]
pub(in crate::rest) enum MessagePart {
    PathParameters,
    QueryParameters,
    RequestBody,
    ResponseBody,
}

impl MessagePart {
    /// The key of the extension that marks an operation, which [`openapi::build`] removes again.
    ///
    /// [`openapi::build`]: crate::rest::openapi::build
    pub(in crate::rest) const fn extension(self) -> &'static str {
        match self {
            Self::PathParameters => "x-hash-path-parameters",
            Self::QueryParameters => "x-hash-query-parameters",
            Self::RequestBody => "x-hash-request-body",
            Self::ResponseBody => "x-hash-response-body",
        }
    }

    fn mark(self, operation: &mut Operation) {
        operation
            .extensions
            .insert(self.extension().to_owned(), Value::Bool(true));
    }
}
