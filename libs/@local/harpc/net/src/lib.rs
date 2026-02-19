//! # HaRPC Net
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    never_type,
    stmt_expr_attributes,
    trait_alias,
    type_alias_impl_trait,

    // Library Features
    error_generic_member_access,
)]
#![cfg_attr(test, feature(async_fn_track_caller))]

extern crate alloc;

pub mod session;
pub mod transport;

mod macros;
mod stream;

#[cfg(feature = "test-utils")]
pub mod test_utils {
    pub use crate::session::server::session_id::test_utils::mock_session_id;
}
