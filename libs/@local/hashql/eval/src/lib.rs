//! # HashQL Eval
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![expect(clippy::indexing_slicing, unsafe_code)]
#![feature(
    // Language Features
    coverage_attribute,
    exhaustive_patterns,

    // Library Features
    allocator_api,
    const_convert,
    const_trait_impl,
    get_mut_unchecked,
    impl_trait_in_assoc_type,
    iter_array_chunks,
    maybe_uninit_fill,
    try_blocks,
)]
#![cfg_attr(test, feature(
    // Library Features
    iter_intersperse
))]

extern crate alloc;
pub mod context;
pub mod error;
pub mod intern;
pub mod orchestrator;
pub mod postgres;

#[cfg(test)]
mod tests {

    #[test]
    fn it_works() {
        assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
    }
}
