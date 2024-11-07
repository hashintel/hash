//! Common utilities used to implement various traits as well as used in the proc-macro.

use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportStreamExt as _};
use futures::{StreamExt as _, stream};
use harpc_codec::encode::Encoder;
use harpc_net::session::server::SessionId;
use harpc_system::{Subsystem, procedure::ProcedureIdentifier};
use harpc_tower::{
    Extensions,
    request::{self, Request},
};
use harpc_types::procedure::ProcedureDescriptor;
use tower::ServiceExt as _;

use crate::{
    connection::{Connection, ConnectionCodec, ConnectionRequestStream, ConnectionService},
    error::{RemoteError, RemoteInvocationError, ResponseExpectedItemCountMismatch},
};

/// Encode a request of an iterator of items.
pub async fn encode_request_iter<P, E, C>(
    codec: E,
    procedure: P,
    items: impl IntoIterator<Item: serde::Serialize, IntoIter: Send> + Send,
) -> Result<Request<ConnectionRequestStream<E>>, Report<[C]>>
where
    P: ProcedureIdentifier + Send,
    E: Encoder<Error = Report<C>, Buf: Send> + Send,
    C: Error + Send + Sync + 'static,
{
    let items: Vec<_> = codec
        .encode(stream::iter(items))
        .try_collect_reports()
        .await?;

    Ok(Request::from_parts(
        request::Parts {
            subsystem: <P::Subsystem as Subsystem>::descriptor(),
            procedure: ProcedureDescriptor {
                id: procedure.into_id(),
            },
            session: SessionId::CLIENT,
            extensions: Extensions::new(),
        },
        stream::iter(items),
    ))
}

/// Delegates a call to a closure with a predetermined amount of inputs and outputs.
///
/// # Errors
///
/// This function returns a `Report<RemoteInvocationError>` in the following cases:
/// - If encoding the request fails
/// - If the service call fails
/// - If the response doesn't contain exactly one item
/// - If decoding the response fails
/// - If the remote server returns an error
pub async fn invoke_call_discrete<Svc, C, O>(
    connection: Connection<Svc, C>,
    procedure: impl ProcedureIdentifier + Send,
    request: impl IntoIterator<Item: serde::Serialize, IntoIter: Send> + Send,
) -> Result<O, Report<RemoteInvocationError>>
where
    Svc: ConnectionService<C>,
    C: ConnectionCodec,
    O: serde::de::DeserializeOwned,
{
    let (service, codec) = connection.into_parts();

    let request = encode_request_iter(codec.clone(), procedure, request)
        .await
        .change_context(RemoteInvocationError)?;

    let response = service
        .oneshot(request)
        .await
        .change_context(RemoteInvocationError)?;

    let (_, body) = response.into_parts();

    let items = codec.decode(body);
    let mut items = core::pin::pin!(items);

    let data: Result<_, _> = items
        .next()
        .await
        .ok_or_else(|| Report::new(ResponseExpectedItemCountMismatch::exactly(1)))
        .change_context(RemoteInvocationError)?
        .change_context(RemoteInvocationError)?;

    data.map_err(RemoteError::new)
        .change_context(RemoteInvocationError)
}
