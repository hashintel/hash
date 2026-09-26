//! Extractors whose rejections are problem details responses.
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

pub(in crate::rest) use self::{json::Json, path::Path, query::Query};
