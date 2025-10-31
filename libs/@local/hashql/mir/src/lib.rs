//! # HashQL MIR
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    coverage_attribute,
    if_let_guard,
    macro_metavar_expr_concat,

    // Library Features
    allocator_api,
    formatting_options,
    iter_array_chunks
)]
#![expect(clippy::indexing_slicing)]
extern crate alloc;

pub mod body;
pub mod def;
pub mod intern;
pub mod pretty;
pub mod reify;

#[cfg(test)]
mod tests {

    #[test]
    fn it_works() {
        assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
    }
}
