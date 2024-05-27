#![feature(impl_trait_in_assoc_type, never_type, type_changing_struct_update)]

mod body;
mod extensions;
mod layer;
mod request;
mod response;

// TODO: server implementation, encoding/decoding, layer to encode errors into responses
