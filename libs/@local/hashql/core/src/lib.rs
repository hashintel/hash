//! # HashQL Core
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    arbitrary_self_types,
    associated_type_defaults,
    coverage_attribute,
    impl_trait_in_assoc_type,
    macro_metavar_expr,
    macro_metavar_expr_concat,
    type_alias_impl_trait,

    // Library Features
    allocator_ext,
    binary_heap_into_iter_sorted,
    bound_copied,
    clone_from_ref,
    clone_to_uninit,
    const_clone,
    const_cmp,
    const_convert,
    const_destruct,
    const_index,
    const_iter,
    const_ops,
    const_range,
    const_range_bounds,
    const_trait_impl,
    extend_one,
    extern_types,
    get_disjoint_mut_helpers,
    get_mut_unchecked,
    iter_intersperse,
    iter_map_windows,
    iter_next_chunk,
    maybe_uninit_fill,
    nonpoison_mutex,
    slice_partition_dedup,
    slice_swap_unchecked,
    step_trait,
    sync_nonpoison,
    try_trait_v2,
    variant_count,
    vec_repeat,
    const_alloc_error,
    const_closures,
    impl_restriction
)]
#![cfg_attr(
    feature = "zerocopy",
    expect(uncommon_codepoints, reason = "used by the zerocopy derive")
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
