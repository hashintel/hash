#![feature(impl_trait_in_assoc_type)]
#![feature(marker_trait_attr)]
#![feature(never_type)]
#![feature(associated_type_bounds)]
#![feature(type_alias_impl_trait)]
#![feature(macro_metavar_expr)]
extern crate core;

pub mod codegen;
pub mod harpc;
pub mod specification;
mod types;

pub use harpc::{
    client::{Client, ClientError},
    server::{Server, ServerBuilder, Service, ServiceBuilder},
    transport::{message::actor::ActorId, TransportConfig},
};
