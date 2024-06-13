#![feature(
    impl_trait_in_assoc_type,
    never_type,
    type_changing_struct_update,
    min_exhaustive_patterns
)]

pub mod body;
pub mod either;
pub mod extensions;
pub mod layer;
pub mod request;
pub mod response;

// TODO: server implementation, encoding/decoding, layer to encode errors into responses
