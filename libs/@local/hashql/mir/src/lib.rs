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
    array_windows,
    assert_matches,
    const_type_name,
    formatting_options,
    iter_array_chunks,
    iter_collect_into,
    try_trait_v2,
)]
#![expect(clippy::indexing_slicing)]
extern crate alloc;

pub mod body;
mod context;
pub mod def;
pub mod error;
pub mod intern;
pub mod pass;
pub mod pretty;
pub mod reify;
pub mod visit;

#[cfg(test)]
mod tests {

    #[test]
    fn it_works() {
        assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
    }
}
