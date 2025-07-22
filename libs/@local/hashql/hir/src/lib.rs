//! # HashQL HIR
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    associated_type_defaults,
    coverage_attribute,
    exhaustive_patterns,
    never_type,

    // Library Features
    array_chunks,
    iter_intersperse,
    try_trait_v2,
)]

extern crate alloc;

pub mod error;
pub mod fold;
pub mod intern;
pub mod lower;
pub mod node;
pub mod path;
mod pretty;
pub mod reify;
pub mod visit;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
