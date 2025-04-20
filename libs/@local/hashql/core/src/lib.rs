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
    maybe_uninit_uninit_array_transpose,
    maybe_uninit_slice
)]
#![cfg_attr(test, feature(custom_test_frameworks))]

extern crate alloc;

pub mod arena;
pub mod heap;
pub mod id;
pub mod math;
pub mod span;
pub mod symbol;
pub mod r#type;
