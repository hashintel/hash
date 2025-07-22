//! # HaRPC Server
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    never_type,

    // Library Features
    error_generic_member_access,
)]

extern crate alloc;

pub mod delegate;
pub mod error;
pub mod route;
pub mod router;
pub mod serve;

pub mod boxed;
pub mod session;
pub mod utils;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use error_stack::{Report, ResultExt as _};
use futures::{Stream, StreamExt as _, stream::FusedStream};
pub use harpc_net::{session::server::SessionConfig, transport::TransportConfig};
use harpc_net::{
    session::server::{EventStream, ListenStream, SessionLayer, Transaction},
    transport::TransportLayer,
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
    cancellation_token: CancellationToken,
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
            cancellation_token: token.clone(),
            guard: token.drop_guard(),
        })
    }

    /// Returns the event stream for this server.
    #[must_use]
    pub fn events(&self) -> EventStream {
        self.session.events()
    }

    /// Returns the cancellation token for this server.
    #[must_use]
    pub fn cancellation_token(&self) -> CancellationToken {
        self.cancellation_token.clone()
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
