//! # HashQL HIR
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Library Features
    array_chunks,
    coverage_attribute,
    iter_intersperse,
    try_trait_v2,
    // Language Features
    associated_type_defaults,
    exhaustive_patterns,
    never_type,
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
