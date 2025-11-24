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
    macro_metavar_expr_concat,
    never_type,

    // Library Features
    allocator_api,
    iter_intersperse,
    step_trait,
    try_trait_v2,
    unwrap_infallible,
)]

extern crate alloc;

pub mod context;
pub mod error;
pub mod fold;
pub mod intern;
pub mod lower;
pub mod map;
pub mod node;
pub mod path;
pub mod pretty;
pub mod reify;
pub mod visit;

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
