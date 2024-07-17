#![feature(
    never_type,
    trait_alias,
    type_alias_impl_trait,
    impl_trait_in_assoc_type,
    stmt_expr_attributes,
    min_exhaustive_patterns,
    error_generic_member_access
)]
#![cfg_attr(test, feature(assert_matches, async_fn_track_caller, iter_repeat_n))]

extern crate alloc;

pub mod codec;
pub mod session;
pub mod transport;

mod macros;
mod stream;

#[cfg(feature = "test-utils")]
pub mod test_utils {
    pub use crate::session::server::session_id::test_utils::mock_session_id;
}
