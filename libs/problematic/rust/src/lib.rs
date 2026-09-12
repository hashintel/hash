//! HTTP Problem Details with typed extension members.
//!
//! [`ProblemType`] describes a problem's shared metadata. [`ProblemDetails`] represents an
//! occurrence as a JSON object, with extension members alongside the standard fields.
//! The `schemars` feature adds JSON Schema support to [`ProblemDetails`] and [`NoExtensions`].
//!
//! [`ProblemDetails`] can borrow the type URI and title from shared metadata and detail and
//! instance from the occurrence. Deserialization produces owned strings for these fields.

extern crate alloc;

mod definition;
mod serialization;

pub use self::definition::{NoExtensions, ProblemDetails, ProblemType};
