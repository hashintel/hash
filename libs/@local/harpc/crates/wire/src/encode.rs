use error_stack::{Context, Result};
use futures::Future;
use tokio::io::AsyncWrite;

pub trait Encode {
    type Error: Context;

    fn encode(
        &self,
        write: impl AsyncWrite + Unpin + Send,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send;
}
