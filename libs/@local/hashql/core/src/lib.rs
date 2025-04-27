//! # HashQL Core
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    never_type,
    decl_macro,
    assert_matches,
    arbitrary_self_types,
    allocator_api,
    slice_partition_dedup,
    let_chains,
    generic_arg_infer,
    iter_map_windows,
    cold_path
)]
#![cfg_attr(test, feature(custom_test_frameworks))]
#![expect(clippy::todo)]

extern crate alloc;

pub mod arena;
pub mod collection;
pub mod heap;
pub mod id;
pub mod intern;
pub mod math;
pub mod module;
pub mod span;
pub mod symbol;
pub mod r#type;
