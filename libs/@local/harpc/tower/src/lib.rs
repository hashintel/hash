#![feature(
    impl_trait_in_assoc_type,
    never_type,
    type_changing_struct_update,
    min_exhaustive_patterns,
    control_flow_enum,
    error_generic_member_access
)]
#![cfg_attr(test, feature(noop_waker, assert_matches))]

pub use self::extensions::Extensions;

pub mod body;
pub mod either;
pub(crate) mod extensions;
pub mod layer;
pub mod net;
pub mod request;
pub mod response;

// TODO: server impl of Transaction -> Request/Response stream
// TODO: client impl of Transaction -> Request/Response stream
// ^ these are to be implemented in separate crates and should be relatively easy
// TODO: impl body for Request/Response streams (convert into said streams...)
// TODO: and a layer that converts to and from the format used by the sink
