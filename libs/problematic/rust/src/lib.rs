//! HTTP Problem Details with typed extension members.
//!
//! [`ProblemType`] describes a problem's shared metadata. [`ProblemDetails`] represents an
//! occurrence as a JSON object, with extension members alongside the standard fields.
//!
//! The optional `serde` feature enables serialization and deserialization. The `schemars` feature
//! independently adds JSON Schema support to [`ProblemDetails`] and [`NoExtensions`].

#![cfg_attr(doc, feature(doc_cfg))]

extern crate alloc;

mod problem_details;
mod problem_type;
#[cfg(feature = "serde")]
mod serde;

pub use http::StatusCode;

pub use self::{
    problem_details::{NoExtensions, ProblemDetails},
    problem_type::ProblemType,
};
