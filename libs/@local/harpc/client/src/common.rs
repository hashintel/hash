//! Common utilities used to implement various traits as well as used in the proc-macro.

use core::error::Error;

use error_stack::{Report, TryReportStreamExt as _};
use futures::stream;
use harpc_codec::encode::Encoder;
use harpc_net::session::server::SessionId;
use harpc_service::Service;
use harpc_tower::{
    Extensions,
    request::{self, Request},
};
use harpc_types::{procedure::ProcedureDescriptor, service::ServiceDescriptor};

use crate::connection::ConnectionRequestStream;

/// Encode a request of an iterator of items.
pub async fn encode_request_iter<P, E, C>(
    codec: E,
    procedure: P,
    items: impl IntoIterator<Item: serde::Serialize, IntoIter: Send> + Send,
) -> Result<Request<ConnectionRequestStream<E>>, Report<[C]>>
where
    P: harpc_service::procedure::ProcedureIdentifier + Send,
    E: Encoder<Error = Report<C>, Buf: Send> + Send,
    C: Error + Send + Sync + 'static,
{
    let items: Vec<_> = codec
        .encode(stream::iter(items))
        .try_collect_reports()
        .await?;

    Ok(Request::from_parts(
        request::Parts {
            service: ServiceDescriptor {
                id: <P::Service as Service>::ID,
                version: <P::Service as Service>::VERSION,
            },
            procedure: ProcedureDescriptor {
                id: procedure.into_id(),
            },
            session: SessionId::CLIENT,
            extensions: Extensions::new(),
        },
        stream::iter(items),
    ))
}
