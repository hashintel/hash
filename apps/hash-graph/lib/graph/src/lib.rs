//! The entity-graph query-layer for the HASH datastore

// Not required, reason: code quality
#![feature(lint_reasons)]
// Not required, reason: Simpler than using blanket implementations
#![feature(trait_alias)]
// Not required, reason: much more simple bounds
#![feature(associated_type_bounds, impl_trait_in_assoc_type)]
#![feature(try_find)]
#![feature(type_alias_impl_trait)]
#![feature(hash_raw_entry)]
#![feature(bound_map)]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings, clippy::all)))))]

mod shared;

pub mod api;

pub mod knowledge;
pub mod ontology;
pub mod subgraph;

pub mod store;

pub mod snapshot;

pub mod logging;

pub use self::shared::*;
