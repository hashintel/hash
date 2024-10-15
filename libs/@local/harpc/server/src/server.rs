use core::{
    pin::Pin,
    task::{Context, Poll},
};

use error_stack::{Report, ResultExt};
use futures::{Stream, stream::FusedStream};
use harpc_codec::encode::ErrorEncoder;
use harpc_net::{
    session::{
        client::SessionConfig,
        server::{EventStream, ListenStream, SessionLayer, Transaction},
    },
    transport::{TransportConfig, TransportLayer},
};
use tokio_util::sync::{CancellationToken, DropGuard};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ServerError {
    #[error("unable to start the transport layer")]
    StartTransportLayer,
    #[error("unable to listen for incoming connections")]
    Listen,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct ServerConfig {
    pub transport: TransportConfig,
    pub session: SessionConfig,
}

pub struct TransactionStream {
    inner: ListenStream,
    _guard: DropGuard,
}

impl Stream for TransactionStream {
    type Item = Transaction;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.inner.poll_next(cx)
    }
}

impl FusedStream for TransactionStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}

pub struct Server<E> {
    session: SessionLayer<E>,
    guard: DropGuard,
}

impl<E> Server<E> {
    pub async fn new(config: ServerConfig, encoder: E) -> Result<Self, Report<ServerError>> {
        let token = CancellationToken::new();

        let transport = TransportLayer::start(config.transport, (), token.clone())
            .change_context(ServerError::StartTransportLayer)?;

        let session = SessionLayer::new(config.session, transport, encoder);

        Ok(Self {
            session,
            guard: token.drop_guard(),
        })
    }

    pub fn events(&self) -> EventStream
    where
        E: ErrorEncoder + Clone + Send + Sync + 'static,
    {
        self.session.events()
    }

    pub async fn listen(self, address: Multiaddr) -> Result<TransactionStream, Report<ServerError>>
    where
        E: ErrorEncoder + Clone + Send + Sync + 'static,
    {
        let stream = self
            .session
            .listen(address)
            .await
            .change_context(ServerError::Listen)?;

        Ok(TransactionStream {
            inner: stream,
            _guard: self.guard,
        })
    }
}
