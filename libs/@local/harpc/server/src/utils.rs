//! Common utilities used to implement various traits as well as used in the proc-macro.

use core::{array, pin::pin};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, stream};
use harpc_codec::{decode::ReportDecoder, encode::Encoder};
use harpc_service::{Subsystem, procedure::ProcedureIdentifier};
use harpc_tower::{
    body::{Body, BodyExt as _, Frame, controlled::Controlled, stream::StreamBody},
    request::Request,
    response::{self, Response},
};
use harpc_types::{
    procedure::ProcedureDescriptor, response_kind::ResponseKind, service::ServiceDescriptor,
};

use crate::error::{DelegationError, ProcedureNotFound, RequestExpectedItemCountMismatch};

/// Parses the procedure identifier from the given request.
///
/// This function extracts the procedure identifier from the request and converts it
/// into the specified `ProcedureIdentifier` type.
///
/// # Errors
///
/// Returns a `DelegationError` if the procedure identifier cannot be parsed into the specified type
/// and is therefore not found.
pub fn parse_procedure_id<P, B>(request: &Request<B>) -> Result<P, Report<DelegationError>>
where
    P: ProcedureIdentifier,
{
    let ProcedureDescriptor { id } = request.procedure();

    P::from_id(id)
        .ok_or(ProcedureNotFound {
            service: ServiceDescriptor {
                id: <P::Service as Subsystem>::ID,
                version: <P::Service as Subsystem>::VERSION,
            },
            procedure: id,
        })
        .change_context(DelegationError)
}

/// Delegates a call to a closure with a single input and output.
pub async fn delegate_call_discrete<B, I, O, C, Fut>(
    request: Request<B>,
    codec: C,
    closure: impl FnOnce(I) -> Fut + Send,
) -> Result<
    Response<
        // Precise capturing of types isn't implemented yet, so we're going to painful
        // route, as we don't want to capture any unnecessary types.
        Controlled<
            ResponseKind,
            StreamBody<
                stream::MapOk<
                    <C as Encoder>::Output<stream::Iter<array::IntoIter<O, 1>>>,
                    fn(<C as Encoder>::Buf) -> Frame<<C as Encoder>::Buf, !>,
                >,
            >,
        >,
    >,
    Report<DelegationError>,
>
where
    B: Body<Control = !, Error: Send + Sync> + Send + Sync,
    I: serde::de::DeserializeOwned,
    O: serde::Serialize + Send,
    C: Encoder + ReportDecoder + Clone + Send,
    Fut: Future<Output = O> + Send,
{
    let session_id = request.session();

    let body = request.into_body();
    let data = body.into_stream().into_data_stream();

    let stream = codec.clone().decode(data);
    let mut stream = pin!(stream);

    let payload = stream
        .next()
        .await
        .ok_or_else(|| RequestExpectedItemCountMismatch::exactly(1))
        .change_context(DelegationError)?
        .change_context(DelegationError)?;

    let response = closure(payload).await;

    let data = codec.encode(stream::iter([response]));

    // In theory we could also box this, or use `Either` if we have multiple responses
    Ok(Response::from_ok(response::Parts::new(session_id), data))
}
