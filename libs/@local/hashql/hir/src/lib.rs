//! # HashQL HIR
//!
//! ## Workspace dependencies
#![feature(
    never_type,
    exhaustive_patterns,
    try_trait_v2,
    associated_type_defaults,
    array_chunks,
    coverage_attribute
)]
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

extern crate alloc;

pub mod error;
pub mod fold;
pub mod intern;
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
