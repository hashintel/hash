mod procedure;
mod service;
pub(crate) mod transport;

use std::future::Future;

use bytes::Bytes;

use crate::harpc::transport::message::actor::ActorId;

pub trait Stateful: Send + Sync {
    type State: Send + Sync;

    fn state(&self) -> &Self::State;
}

pub trait Encode<T>: Stateful {
    type Error: error_stack::Context;

    fn encode(
        &self,
        value: T,
    ) -> impl Future<Output = error_stack::Result<Bytes, Self::Error>> + Send + 'static;
}

pub trait Decode<T>: Stateful {
    type Error: error_stack::Context;

    fn decode(
        &self,
        bytes: Bytes,
    ) -> impl Future<Output = error_stack::Result<T, Self::Error>> + Send + 'static;
}

pub trait Context: Clone + Stateful + 'static {}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestMeta {
    pub actor: ActorId,
}
