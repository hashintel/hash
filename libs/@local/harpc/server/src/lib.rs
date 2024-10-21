#![feature(never_type, impl_trait_in_assoc_type, error_generic_member_access)]

extern crate alloc;

pub mod delegate;
pub mod error;
pub mod route;
pub mod router;
pub mod serve;

pub mod session;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use error_stack::{Report, ResultExt};
use futures::{Stream, StreamExt, stream::FusedStream};
use harpc_net::{
    session::server::{EventStream, ListenStream, SessionConfig, SessionLayer, Transaction},
    transport::{TransportConfig, TransportLayer},
};
use multiaddr::Multiaddr;
use tokio_util::sync::{CancellationToken, DropGuard};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    derive_more::Display,
    derive_more::Error,
)]
pub enum ServerError {
    #[display("unable to start the transport layer")]
    StartTransportLayer,
    #[display("unable to listen for incoming connections")]
    Listen,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
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

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.inner.poll_next_unpin(cx)
    }
}

impl FusedStream for TransactionStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}

pub struct Server {
    session: SessionLayer,
    guard: DropGuard,
}

impl Server {
    /// Creates a new server instance with the given configuration and error encoder.
    ///
    /// # Errors
    ///
    /// This function will return an error if:
    /// - The transport layer fails to start.
    pub fn new(config: ServerConfig) -> Result<Self, Report<ServerError>> {
        let token = CancellationToken::new();

        let transport = TransportLayer::tcp(config.transport, token.clone())
            .change_context(ServerError::StartTransportLayer)?;

        let session = SessionLayer::new(config.session, transport);

        Ok(Self {
            session,
            guard: token.drop_guard(),
        })
    }

    /// Returns the event stream for this server.
    #[must_use]
    pub fn events(&self) -> EventStream {
        self.session.events()
    }

    /// Starts listening for incoming connections on the specified address.
    ///
    /// # Errors
    ///
    /// This function will return an error if:
    /// - The server fails to start listening on the provided address.
    pub async fn listen(
        self,
        address: Multiaddr,
    ) -> Result<TransactionStream, Report<ServerError>> {
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
