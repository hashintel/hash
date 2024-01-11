use std::future::{ready, Future};

use bytes::Bytes;
use error_stack::{Context, Report, ResultExt};
use hash_status::StatusCode;
use thiserror::Error;

use crate::harpc::{Decode, Encode, Stateful};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[cfg_attr(feature = "specta", specta(transparent))]
pub struct Error(hash_status::Status<serde_json::Value>);

impl<C> From<Report<C>> for Error
where
    C: Context,
{
    fn from(value: Report<C>) -> Self {
        let message = value.to_string();

        let status_code = value
            .request_ref::<StatusCode>()
            .next()
            .copied()
            .unwrap_or(StatusCode::Internal);

        let report = serde_json::to_value(&value).unwrap_or_else(|_| {
            tracing::error!("unable to convert error to json");
            serde_json::Value::Array(Vec::new())
        });

        let contents = match report {
            serde_json::Value::Array(reports) => reports,
            report => vec![report],
        };

        let status = hash_status::Status::new(status_code, Some(message), contents);

        Self(status)
    }
}

#[derive(Debug, Copy, Clone, Error)]
#[error("serde error")]
pub struct SerdeError;

pub struct JsonCodec;

impl Stateful for JsonCodec {
    type State = ();

    fn state(&self) -> Self::State {
        ()
    }
}

impl<T> Encode<T> for JsonCodec
where
    T: serde::Serialize,
{
    type Error = SerdeError;

    fn encode(
        &self,
        value: T,
    ) -> impl Future<Output = error_stack::Result<Bytes, Self::Error>> + Send {
        let bytes = serde_json::to_vec(&value)
            .change_context(SerdeError)
            .map(Bytes::from);

        ready(bytes)
    }
}

impl<T> Decode<T> for JsonCodec
where
    T: serde::de::DeserializeOwned + Send,
{
    type Error = SerdeError;

    fn decode(
        &self,
        bytes: Bytes,
    ) -> impl Future<Output = error_stack::Result<T, Self::Error>> + Send {
        let value = serde_json::from_slice(&bytes).change_context(SerdeError);

        ready(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonContext<S> {
    state: S,
}

impl<S> JsonContext<S> {
    #[must_use]
    pub const fn new(state: S) -> Self {
        Self { state }
    }
}

impl<S> Stateful for JsonContext<S>
where
    S: Send + Sync + Clone,
{
    type State = S;

    fn state(&self) -> Self::State {
        self.state.clone()
    }
}

impl<S, T> Encode<T> for JsonContext<S>
where
    S: Send + Sync + Clone,
    T: serde::Serialize,
{
    type Error = SerdeError;

    fn encode(
        &self,
        value: T,
    ) -> impl Future<Output = error_stack::Result<Bytes, Self::Error>> + Send {
        JsonCodec.encode(value)
    }
}

impl<S, T> Decode<T> for JsonContext<S>
where
    S: Send + Sync + Clone,
    T: serde::de::DeserializeOwned + Send,
{
    type Error = SerdeError;

    fn decode(
        &self,
        bytes: Bytes,
    ) -> impl Future<Output = error_stack::Result<T, Self::Error>> + Send {
        JsonCodec.decode(bytes)
    }
}

impl<S> crate::harpc::Context for JsonContext<S> where S: Clone + Send + Sync + 'static {}
