#![feature(
    never_type,
    trait_alias,
    type_alias_impl_trait,
    impl_trait_in_assoc_type
)]

extern crate alloc;

pub mod codec;
mod config;
mod session;
mod transport;

// TODO: payload size layer, timeout layer
// ^ should these be composable via a trait? or nah. Honestly doesn't really matter.
