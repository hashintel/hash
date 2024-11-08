#![feature(hash_raw_entry, impl_trait_in_assoc_type, never_type)]
#![expect(
    clippy::self_named_module_files,
    reason = "False positive because the modules is named as the crate directory."
)]

extern crate alloc;

use serde::{Deserialize, Serialize};

pub mod account;
pub mod data_type;
pub mod entity;
pub mod entity_type;
pub mod property_type;

pub mod error;
pub mod filter;
pub mod migration;
pub mod subgraph;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ConflictBehavior {
    /// If a conflict is detected, the operation will fail.
    Fail,
    /// If a conflict is detected, the operation will be skipped.
    Skip,
}
