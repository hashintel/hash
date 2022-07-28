//! The entity-graph query-layer for the HASH datastore

// Not required, reason: code quality
#![feature(lint_reasons)]
// Not required, reason: Use `std` feature rather than external crate
#![feature(once_cell)]
// Not required, reason: Easier than having a separated trait with lifetime bounds
#![feature(generic_associated_types)]
// Not required, reason: Simpler than using blanket implementations
#![feature(trait_alias)]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings, clippy::all)))))]
#![warn(
    clippy::pedantic,
    clippy::nursery,
    // Encountering a lot of false positives appearing on things like `derive` macros. We should revisit
    // periodically in case the bug gets fixed
    // clippy::allow_attributes_without_reason,
    clippy::as_underscore,
    clippy::clone_on_ref_ptr,
    clippy::create_dir,
    clippy::dbg_macro,
    clippy::default_union_representation,
    clippy::deref_by_slicing,
    clippy::empty_structs_with_brackets,
    clippy::filetype_is_file,
    clippy::get_unwrap,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::rc_buffer,
    clippy::rc_mutex,
    clippy::same_name_method,
    clippy::str_to_string,
    clippy::string_add,
    clippy::string_slice,
    clippy::string_to_string,
    clippy::try_err,
    clippy::undocumented_unsafe_blocks,
    clippy::unnecessary_self_imports,
    clippy::unwrap_used,
    clippy::use_debug,
    clippy::verbose_file_reads
)]
#![allow(
    clippy::module_name_repetitions,
    reason = "This encourages importing `as` which breaks IDEs"
)]
#![allow(clippy::use_self, reason = "Too many false positives")]
#![allow(
    clippy::cast_sign_loss,
    clippy::cast_possible_truncation,
    reason = "Postgres doesn't support unsigned values, so we cast from i64 to u32. We don't use \
              the negative part, though"
)]

use crate::{
    knowledge::{Entity, EntityId, Links},
    ontology::{
        types::{DataType, EntityType, LinkType, Persisted, PropertyType},
        VersionId,
    },
    store::{crud::Read, Store, StorePool},
};

pub mod api;

pub mod knowledge;
pub mod ontology;

pub mod store;

pub mod logging;

#[cfg(test)]
#[path = "../../../tests/test_data/lib.rs"]
mod test_data;

/// Abstraction over [`StorePool`] for [`Graph`]s.
pub trait GraphPool = StorePool + 'static where for<'pool> <Self as StorePool>::Store<'pool>: Graph;

/// Interface for a [`Store`].
pub trait Graph = Store
where
    for<'i> Self: Read<'i, VersionId, DataType, Output = Persisted<DataType>>
        + Read<'i, VersionId, PropertyType, Output = Persisted<PropertyType>>
        + Read<'i, VersionId, LinkType, Output = Persisted<LinkType>>
        + Read<'i, VersionId, EntityType, Output = Persisted<EntityType>>
        + Read<'i, EntityId, Entity, Output = Entity>
        + Read<'i, EntityId, Links, Output = Links>;
