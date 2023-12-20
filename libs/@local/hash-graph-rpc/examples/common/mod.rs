use std::future::{ready, Future};

use bytes::Bytes;
use error_stack::{Result, ResultExt};
use hash_graph_rpc::{
    harpc,
    harpc::{Context, Encode, Stateful},
};
use thiserror::Error;

#[derive(Debug, Copy, Clone, Error)]
#[error("context error")]
pub struct ContextError;

#[derive(Debug, Copy, Clone)]
pub struct JsonContext;

impl Stateful for JsonContext {
    type State = ();

    fn state(&self) -> &Self::State {
        &()
    }
}

impl<T> Encode<T> for JsonContext
where
    T: serde::Serialize,
{
    type Error = ContextError;

    fn encode(&self, value: T) -> impl Future<Output = Result<Bytes, Self::Error>> + Send {
        let value = serde_json::to_vec(&value)
            .change_context(ContextError)
            .map(Bytes::from);

        ready(value)
    }
}

impl<T> harpc::Decode<T> for JsonContext
where
    T: serde::de::DeserializeOwned + Send,
{
    type Error = ContextError;

    fn decode(&self, bytes: Bytes) -> impl Future<Output = Result<T, Self::Error>> + Send {
        let value = serde_json::from_slice(&bytes).change_context(ContextError);

        ready(value)
    }
}

impl Context for JsonContext {}
