//! # HashQL HIR
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(never_type, exhaustive_patterns)]
pub mod node;
pub mod path;
pub mod visit;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
