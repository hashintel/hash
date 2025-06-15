//! # HashQL Core
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Library Features
    allocator_api,
    assert_matches,
    binary_heap_into_iter_sorted,
    cold_path,
    coverage_attribute,
    default_field_values,
    iter_map_windows,
    slice_partition_dedup,
    variant_count,
    // Language Features
    arbitrary_self_types,
    associated_type_defaults,
    impl_trait_in_assoc_type,
    macro_metavar_expr,
    macro_metavar_expr_concat,
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
pub mod similarity;
pub mod span;
pub mod symbol;
pub mod r#type;
