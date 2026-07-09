#![cfg_attr(doc, doc = include_str!("../README.md"))]
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

// `postgres` and `utoipa` pull `postgres-types`/`bytes` and `utoipa`, but those are only consumed
// by the `Real` integration in the `numeric` module, i.e. at the *intersection* of `numeric` and
// the respective feature. Cargo activates a dependency on the feature *union*, so enabling one
// side without `numeric` pulls the dependency without compiling a user of it. Anchor those
// combinations so `cargo::unused_dependencies` (checked across the merge-queue powerset) stays
// quiet.
// `bytes` is additionally pulled by `postgres` (for the `Real` `ToSql` impl), but also used
// directly by the `bytes` and `harpc` modules. Only anchor it when none of its consumers
// compile.
#[cfg(all(
    feature = "postgres",
    not(feature = "numeric"),
    not(feature = "bytes"),
    not(feature = "harpc")
))]
use bytes as _;
#[cfg(all(feature = "postgres", not(feature = "numeric")))]
use postgres_types as _;
#[cfg(all(feature = "utoipa", not(feature = "numeric")))]
use utoipa as _;

#[cfg(feature = "bytes")]
pub mod bytes;
#[cfg(feature = "harpc")]
pub mod harpc;
#[cfg(feature = "numeric")]
pub mod numeric;
#[cfg(feature = "serde")]
pub mod serde;
