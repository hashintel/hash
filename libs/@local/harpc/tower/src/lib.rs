#![feature(
    impl_trait_in_assoc_type,
    never_type,
    type_changing_struct_update,
    error_generic_member_access
)]
#![cfg_attr(test, feature(noop_waker, assert_matches, macro_metavar_expr))]

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
