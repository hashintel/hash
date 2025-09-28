//! # HashQL Core
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    arbitrary_self_types,
    associated_type_defaults,
    coverage_attribute,
    default_field_values,
    if_let_guard,
    impl_trait_in_assoc_type,
    macro_metavar_expr,
    macro_metavar_expr_concat,
    never_type,
    type_alias_impl_trait,

    // Library Features
    allocator_api,
    array_windows,
    assert_matches,
    binary_heap_into_iter_sorted,
    cold_path,
    iter_map_windows,
    slice_partition_dedup,
    slice_swap_unchecked,
    variant_count,
)]

extern crate alloc;

pub mod algorithms;
pub mod collection;
pub mod heap;
pub mod id;
pub mod intern;
pub mod literal;
pub mod module;
pub mod pretty;
pub mod similarity;
pub mod span;
pub mod symbol;
pub mod r#type;
pub mod value;
