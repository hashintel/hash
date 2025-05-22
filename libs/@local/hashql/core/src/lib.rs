//! # HashQL Core
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Library Features
    allocator_api,
    assert_matches,
    cold_path,
    iter_map_windows,
    slice_partition_dedup,
    variant_count,
    // Language Features
    arbitrary_self_types,
    associated_type_defaults,
    default_field_values,
    never_type,
    type_alias_impl_trait,
)]

extern crate alloc;

pub mod collection;
pub mod heap;
pub mod id;
pub mod intern;
pub mod literal;
pub mod math;
pub mod module;
pub mod pretty;
pub mod span;
pub mod symbol;
pub mod r#type;
