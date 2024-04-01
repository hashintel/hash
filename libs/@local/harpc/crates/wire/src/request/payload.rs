use bytes::Bytes;

use crate::codec::{BytesEncodeError, Encode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestPayload(Bytes);

impl Encode for RequestPayload {
    type Error = BytesEncodeError;

    fn encode(
        &self,
        write: impl tokio::io::AsyncWrite + Unpin + Send,
    ) -> impl futures::prelude::Future<Output = error_stack::Result<(), Self::Error>> + Send {
        Bytes::encode(&self.0, write)
    }
}
