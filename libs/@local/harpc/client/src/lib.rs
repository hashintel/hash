#![feature(never_type, impl_trait_in_assoc_type, type_alias_impl_trait)]

extern crate alloc;

pub mod connection;

use alloc::sync::Arc;

use bytes::Buf;
use error_stack::{Report, ResultExt};
use futures::Stream;
use harpc_net::{
    session::client::{SessionConfig, SessionLayer},
    transport::{TransportConfig, TransportLayer},
};
use harpc_tower::request::Request;
use multiaddr::Multiaddr;
use tokio_util::sync::{CancellationToken, DropGuard};
use tower::{Layer, Service};

use self::connection::{
    Connection,
    default::{self, DefaultLayer, DefaultService},
    service::ConnectionService,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct ClientConfig {
    pub transport: TransportConfig,
    pub session: SessionConfig,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ClientError {
    #[error("unable to connect to server")]
    Connect,
    #[error("unable to start the transport layer")]
    StartTransportLayer,
}

/// A guard that ensures the transport layer is dropped when all remaining clients and connections
/// are dropped.
///
/// We cannot drop whenever the last client is dropped because there may still be multiple
/// connections that are still active.
#[derive(Debug, Clone)]
pub(crate) struct TransportLayerGuard(
    #[expect(dead_code, reason = "drop guard is only used for dropping")] Arc<DropGuard>,
);

#[derive(Debug, Clone)]
pub struct Client<C> {
    session: Arc<SessionLayer>,
    codec: C,

    guard: TransportLayerGuard,
}

impl<C> Client<C> {
    /// Creates a new `Client` with the given configuration.
    ///
    /// # Errors
    ///
    /// Returns a `ClientError::StartTransportLayer` if unable to start the transport layer.
    pub fn new(config: ClientConfig, codec: C) -> Result<Self, Report<ClientError>> {
        let token = CancellationToken::new();

        let transport = TransportLayer::tcp(config.transport, token.clone())
            .change_context(ClientError::StartTransportLayer)?;

        let session = SessionLayer::new(config.session, transport);

        let guard = Arc::new(token.drop_guard());

        Ok(Self {
            session: Arc::new(session),
            codec,
            guard: TransportLayerGuard(guard),
        })
    }

    /// Connects to a target address.
    ///
    /// # Errors
    ///
    /// Returns a `ClientError::Connect` if unable to establish a connection to the server.
    pub async fn connect<B>(
        &self,
        target: Multiaddr,
    ) -> Result<Connection<default::Default<B>, C>, Report<ClientError>>
    where
        B: Buf + 'static,
        C: Clone + Sync,
    {
        let connection = self
            .connect_with_service(DefaultLayer::new(), target)
            .await?;

        Ok(Connection::new(
            default::Default::new(connection),
            self.codec.clone(),
        ))
    }

    pub async fn connect_with<L, B>(
        &self,
        layer: L,
        target: Multiaddr,
    ) -> Result<Connection<L::Service, C>, Report<ClientError>>
    where
        L: Layer<ConnectionService, Service: Service<Request<B>>> + Send,
        C: Clone + Sync,
    {
        let connection = self.connect_with_service(layer, target).await?;

        Ok(Connection::new(connection, self.codec.clone()))
    }

    async fn connect_with_service<L, B>(
        &self,

        layer: L,
        target: Multiaddr,
    ) -> Result<<L as Layer<ConnectionService>>::Service, Report<ClientError>>
    where
        L: Layer<ConnectionService, Service: Service<Request<B>>> + Send,
        C: Sync,
    {
        let connection = self
            .session
            .dial(target)
            .await
            .change_context(ClientError::Connect)?;

        let inner = ConnectionService::new(connection, self.guard.clone());
        let connection = layer.layer(inner);

        Ok(connection)
    }
}
