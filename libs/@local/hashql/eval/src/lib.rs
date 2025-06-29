//! # HashQL Eval
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Library Features
    coverage_attribute,
    iterator_try_collect,
    // Language Features
    exhaustive_patterns,
    if_let_guard,
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
