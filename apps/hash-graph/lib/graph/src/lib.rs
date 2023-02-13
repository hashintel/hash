//! The entity-graph query-layer for the HASH datastore

// Not required, reason: code quality
#![feature(lint_reasons)]
// Not required, reason: Use `std` feature rather than external crate
#![feature(once_cell)]
// Not required, reason: Simpler than using blanket implementations
#![feature(trait_alias)]
// Not required, reason: much more simple bounds
#![feature(associated_type_bounds)]
#![feature(try_find)]
#![feature(type_alias_impl_trait)]
#![feature(hash_raw_entry)]
#![feature(bound_map)]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings, clippy::all)))))]
#![expect(
    clippy::cast_possible_truncation,
    reason = "Postgres doesn't support unsigned values, so we cast from i64 to u32. We don't use \
              the negative part, though"
)]

pub mod api;

pub mod knowledge;
pub mod ontology;
mod shared;

pub mod store;

pub mod logging;

pub use self::shared::*;
