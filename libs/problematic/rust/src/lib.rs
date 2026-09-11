//! HTTP Problem Details with typed extension members.
//!
//! [`ProblemType`] describes a problem's shared metadata. [`ProblemDetails`] represents an
//! occurrence as a JSON object, with extension members alongside the standard fields.
//! The `schemars` feature adds JSON Schema support to [`ProblemDetails`] and [`NoExtensions`].

extern crate alloc;

mod definition;

pub use self::definition::{NoExtensions, ProblemDetails, ProblemType};
