//! # HaRPC Tower
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    never_type,
    type_changing_struct_update,

    // Library Features
    error_generic_member_access,
)]
#![cfg_attr(test, feature(assert_matches, macro_metavar_expr))]

extern crate alloc;

pub use self::extensions::Extensions;

pub mod body;
pub mod either;
pub(crate) mod extensions;
pub mod layer;
pub mod net;
pub mod request;
pub mod response;
#[cfg(test)]
pub(crate) mod test;
