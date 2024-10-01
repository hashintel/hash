use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::Service;

/// Delegates service calls to an inner typed service.
///
/// This trait acts as a bridge between the generic RPC layer and a typed service implementation.
/// It routes incoming requests to the appropriate methods of the inner service based on the
/// request's procedure ID.
///
/// The implementation is responsible for encoding and decoding the request and response bodies.
///
/// The caller must verify that the version and service of the incoming request match those of
/// [`Self::Service`].
pub trait ServiceDelegate<S, C> {
    /// The inner service type that this delegate wraps.
    type Service: Service;

    /// Handles an incoming request by delegating it to the appropriate method of the inner service.
    fn call<B>(
        &self,
        request: Request<B>,
        session: &S,
        codec: &C,
    ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync;
}
