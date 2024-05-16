use alloc::sync::Arc;
use core::future::ready;

use harpc_wire_protocol::response::kind::ErrorCode;

use super::{SessionConfig, SessionLayer};
use crate::{
    codec::{ErrorEncoder, PlainError},
    session::error::TransactionError,
    transport::test::layer,
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

async fn session(config: SessionConfig) {
    let (transport, guard) = layer();
    let layer = SessionLayer::new(config, transport, StringEncoder);
}

#[tokio::test]
async fn normal_session() {
    let (server, _server_drop) = layer();
}

#[tokio::test]
#[ignore]
async fn too_many_connections() {}

#[tokio::test]
#[ignore]
async fn connection_reclaim() {}

#[tokio::test]
#[ignore]
async fn stream_dropped_graceful_shutdown() {}

#[tokio::test]
#[ignore]
async fn swarm_shutdown() {}
