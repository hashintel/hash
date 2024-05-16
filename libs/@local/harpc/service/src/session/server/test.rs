use core::future::ready;

use harpc_wire_protocol::response::kind::ErrorCode;
use libp2p::Multiaddr;

use super::{ListenStream, SessionConfig, SessionLayer};
use crate::{
    codec::{ErrorEncoder, PlainError},
    session::error::TransactionError,
    transport::{
        connection::OutgoingConnection,
        test::{address, layer},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct StringEncoder;

impl ErrorEncoder for StringEncoder {
    fn encode_error<E>(&self, error: E) -> impl Future<Output = TransactionError> + Send
    where
        E: PlainError,
    {
        ready(TransactionError {
            code: error.code(),
            bytes: error.to_string().into_bytes().into(),
        })
    }

    fn encode_report<C>(
        &self,
        report: error_stack::Report<C>,
    ) -> impl Future<Output = TransactionError> + Send {
        let code = report
            .request_ref::<ErrorCode>()
            .next()
            .copied()
            .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR);

        ready(TransactionError {
            code,
            bytes: report.to_string().into_bytes().into(),
        })
    }
}

async fn session(config: SessionConfig, address: Multiaddr) -> (ListenStream, impl Drop) {
    let (transport, guard) = layer();
    let layer = SessionLayer::new(config, transport, StringEncoder);

    let stream = layer
        .listen(address)
        .await
        .expect("able to listen on address");

    (stream, guard)
}

#[tokio::test]
async fn single_session() {
    let address = address();

    let (server, _server_guard) = session(SessionConfig::default(), address.clone()).await;
    let (client, _client_guard) = layer();

    let server_id = client
        .lookup_peer(address)
        .await
        .expect("able to lookup server peer");

    let OutgoingConnection { sink, stream, .. } = client
        .dial(server_id)
        .await
        .expect("able to dial server peer");
}

#[tokio::test]
#[ignore]
async fn client_disconnect() {}

#[tokio::test]
#[ignore]
async fn server_disconnect_by_dropping_listen_stream() {}

#[tokio::test]
#[ignore]
async fn server_disconnect_by_swarm_shutdown() {}

#[tokio::test]
#[ignore]
async fn too_many_connections() {}

#[tokio::test]
#[ignore]
async fn connection_reclaim() {}
