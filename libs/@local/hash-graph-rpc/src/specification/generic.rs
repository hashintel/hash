use std::future::{ready, Future};

use bytes::Bytes;
use error_stack::ResultExt;
use thiserror::Error;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{describe::WasmDescribe, JsValue};

use crate::harpc::{Decode, Encode, Stateful};

#[derive(Debug, Copy, Clone, Error)]
#[error("encoding error")]
pub struct EncodingError;

pub struct DefaultEncoder;

impl Stateful for DefaultEncoder {
    type State = ();

    fn state(&self) -> &Self::State {
        &()
    }
}

impl<T> Encode<T> for DefaultEncoder
where
    T: serde::Serialize,
{
    type Error = EncodingError;

    fn encode(
        &self,
        value: T,
    ) -> impl Future<Output = error_stack::Result<Bytes, Self::Error>> + Send {
        let bytes = serde_json::to_vec(&value)
            .change_context(EncodingError)
            .map(Bytes::from);

        ready(bytes)
    }
}

impl<T> Decode<T> for DefaultEncoder
where
    T: serde::de::DeserializeOwned + Send,
{
    type Error = EncodingError;

    fn decode(
        &self,
        bytes: Bytes,
    ) -> impl Future<Output = error_stack::Result<T, Self::Error>> + Send {
        let value = serde_json::from_slice(&bytes).change_context(EncodingError);

        ready(value)
    }
}
