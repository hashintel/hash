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
    if_let_guard,
    impl_trait_in_assoc_type,
    macro_metavar_expr,
    macro_metavar_expr_concat,
    never_type,
    type_alias_impl_trait,

    // Library Features
    allocator_api,
    assert_matches,
    binary_heap_into_iter_sorted,
    clone_from_ref,
    const_cmp,
    const_ops,
    const_trait_impl,
    debug_closure_helpers,
    extend_one,
    formatting_options,
    get_disjoint_mut_helpers,
    iter_intersperse,
    iter_map_windows,
    iter_next_chunk,
    slice_partition_dedup,
    slice_swap_unchecked,
    step_trait,
    str_from_raw_parts,
    try_trait_v2,
    variant_count,
)]

extern crate alloc;

pub mod algorithms;
pub mod collections;
pub mod graph;
pub mod heap;
pub mod id;
pub mod intern;
mod macros;
pub mod module;
pub mod pretty;
pub mod span;
pub mod symbol;
pub mod sync;
pub mod r#type;
pub mod value;

pub use hashql_macros::id;
