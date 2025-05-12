//! # HashQL HIR
//!
//! ## Workspace dependencies
#![feature(
    never_type,
    exhaustive_patterns,
    try_trait_v2,
    associated_type_defaults,
    array_chunks
)]
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
pub mod fold;
pub mod intern;
pub mod node;
pub mod path;
pub mod visit;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
