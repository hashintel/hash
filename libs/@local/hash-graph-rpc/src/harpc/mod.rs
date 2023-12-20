mod procedure;
mod service;
pub(crate) mod transport;

use bytes::Bytes;

pub trait Stateful: Send + Sync {
    type State: Send + Sync;

    fn state(&self) -> &Self::State;
}

pub trait Encode<T>: Stateful {
    fn encode(&self, value: T) -> Bytes;
}

pub trait Decode<T>: Stateful {
    fn decode(&self, bytes: Bytes) -> T;
}

pub trait Context: Clone + Stateful + 'static {}
