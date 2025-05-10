//! # HashQL Core
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    never_type,
    assert_matches,
    arbitrary_self_types,
    allocator_api,
    slice_partition_dedup,
    let_chains,
    generic_arg_infer,
    iter_map_windows,
    cold_path,
    type_alias_impl_trait
)]

extern crate alloc;

pub mod arena;
pub mod collection;
pub mod heap;
pub mod id;
pub mod intern;
pub mod literal;
pub mod math;
pub mod module;
pub mod span;
pub mod symbol;
pub mod r#type;
