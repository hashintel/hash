//! # HashQL Eval
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    coverage_attribute,
    exhaustive_patterns,
    if_let_guard,

    // Library Features
    iterator_try_collect,
)]

extern crate alloc;

#[cfg(feature = "graph")]
pub mod graph;

#[cfg(test)]
mod tests {

    #[test]
    fn it_works() {
        assert_eq!(2, 2); // if this isn't true, then something went *horribly* wrong in the universe.
    }
}
