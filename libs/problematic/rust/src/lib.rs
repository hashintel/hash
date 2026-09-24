//! HTTP Problem Details with typed extension members.
//!
//! [`ProblemType`] describes a problem's shared metadata. [`ProblemDetails`] represents an
//! occurrence as a JSON object, with extension members alongside the standard fields.
//! [`Problem`] is a set of public failures, each a [`ProblemVariant`], and [`Expose`] answers a
//! failure with one of them.
//!
//! The `aide` feature documents problems as `application/problem+json` responses, and the `axum`
//! feature answers with them.

#![feature(const_convert, const_destruct, const_trait_impl)]
#![cfg_attr(doc, feature(doc_cfg))]

extern crate alloc;

#[cfg(feature = "aide")]
pub mod aide;
#[cfg(feature = "axum")]
pub mod axum;
mod expose;
mod problem;
mod problem_details;
mod problem_type;
mod serde;

pub use http::StatusCode;

pub use self::{
    expose::{Answer, Expose},
    problem::{Header, Problem, ProblemVariant, Variant},
    problem_details::ProblemDetails,
    problem_type::ProblemType,
};
