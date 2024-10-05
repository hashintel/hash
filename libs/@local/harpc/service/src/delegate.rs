use error_stack::Report;
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
/// Implementations of this trait should derive or implement `Clone`, and ensure that cloning
/// is a cheap operation. Every request likely will clone the delegate, meaning any expensive clone
/// operation will be repeated for each request and add latency.
///
/// The caller must verify that the version and service of the incoming request match those of
/// [`Self::Service`].
pub trait ServiceDelegate<S, C> {
    /// The inner service type that this delegate wraps.
    type Service: Service;

    type Error;
    type Body: Body<Control: AsRef<ResponseKind>>;

    /// Delegates an incoming request to the appropriate method of the inner service.
    ///
    /// This method is responsible for routing the request to the correct handler within
    /// the inner service based on the request's characteristics.
    ///
    /// # Ownership
    ///
    /// This method consumes `self`. While not strictly necessary, this design choice
    /// aligns with the expectations of the tower service implementation and other
    /// components that may clone the delegate for each request. Long-lived state
    /// should be kept in a smart pointer, such as an `Arc`.
    fn call<B>(
        self,
        request: Request<B>,
        session: S,
        codec: C,
    ) -> impl Future<Output = Result<Response<Self::Body>, Report<Self::Error>>> + Send
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync;
}
