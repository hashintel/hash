//! HTTP Problem Details with typed extension members.
//!
//! [`ProblemType`] describes a problem's shared metadata. [`ProblemDetails`] represents an
//! occurrence as a JSON object, with extension members alongside the standard fields.
//! [`Problem`] lets a failure provide the details exposed to the client.
//!
//! The optional `serde` feature enables serialization and deserialization. The `schemars` feature
//! independently adds JSON Schema support to [`ProblemDetails`] and [`NoExtensions`].
//! The `aide` feature documents [`ProblemDetails`] responses as `application/problem+json` and
//! includes `schemars`. Response inference uses the default response because each occurrence
//! supplies its own HTTP status.
//! The `error-stack` feature retrieves problems from error contexts and attachments and includes
//! `serde`.

#![feature(const_convert, const_destruct, const_trait_impl)]
#![cfg_attr(feature = "error-stack", feature(error_generic_member_access))]
#![cfg_attr(doc, feature(doc_cfg))]

extern crate alloc;

#[cfg(feature = "aide")]
mod aide;
#[cfg(feature = "error-stack")]
pub mod error_stack;
mod problem;
mod problem_details;
mod problem_type;
#[cfg(feature = "serde")]
mod serde;

pub use http::StatusCode;

pub use self::{
    problem::Problem,
    problem_details::{NoExtensions, ProblemDetails},
    problem_type::ProblemType,
};
