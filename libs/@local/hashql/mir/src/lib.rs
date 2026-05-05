//! # HashQL MIR
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    associated_type_defaults,
    coverage_attribute,
    exhaustive_patterns,
    impl_trait_in_assoc_type,
    macro_metavar_expr_concat,
    never_type,
    const_trait_impl,

    // Library Features
    allocator_api,
    binary_heap_drain_sorted,
    clone_from_ref,
    const_type_name,
    get_mut_unchecked,
    iter_array_chunks,
    iter_collect_into,
    likely_unlikely,
    maybe_uninit_fill,
    step_trait,
    try_trait_v2,
    temporary_niche_types,
    const_convert,
    variant_count,
)]
#![cfg_attr(test, feature(
    // Library Features
    maybe_uninit_array_assume_init,
    string_from_utf8_lossy_owned,
))]
#![expect(clippy::indexing_slicing)]
extern crate alloc;

pub mod body;
pub mod builder;
pub mod context;
pub mod def;
pub mod error;
pub mod intern;
pub mod interpret;
mod macros;
pub mod pass;
pub mod pretty;
pub mod reify;
#[cfg(test)]
pub(crate) mod tests;
pub mod visit;
