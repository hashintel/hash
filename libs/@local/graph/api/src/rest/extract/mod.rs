//! Extractors whose rejections are problem details responses.
//!
//! The framework's own extractors answer plain text. These wrap them, keep the status the
//! framework chose, and answer `application/problem+json`. Each one lists the ways it refuses a
//! request as the variants of its [`Problem`](problematic::Problem), so an operation documents
//! them through the extractors it reads, together with the variants of every other source at the
//! same status.

mod json;
mod path;
mod query;
#[cfg(test)]
mod tests;

pub(in crate::rest) use self::{json::Json, path::Path, query::Query};
