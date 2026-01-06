//! # HashQL MIR
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    associated_type_defaults,
    coverage_attribute,
    if_let_guard,
    impl_trait_in_assoc_type,
    macro_metavar_expr_concat,
    never_type,

    // Library Features
    allocator_api,
    assert_matches,
    binary_heap_drain_sorted,
    const_type_name,
    iter_array_chunks,
    iter_collect_into,
    iter_intersperse,
    maybe_uninit_fill,
    step_trait,
    string_from_utf8_lossy_owned,
    try_trait_v2,
    get_mut_unchecked,
)]
#![expect(clippy::indexing_slicing)]
extern crate alloc;

pub mod body;
pub mod context;
pub mod def;
pub mod error;
pub mod intern;
pub mod pass;
pub mod pretty;
pub mod reify;
pub mod visit;

pub mod builder;
mod interpret;
#[cfg(test)]
pub(crate) mod tests;
