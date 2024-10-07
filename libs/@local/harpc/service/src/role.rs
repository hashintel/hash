use core::marker::PhantomData;

use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_wire_protocol::response::kind::ResponseKind;

mod sealed {
    pub trait Sealed {}
}

/// Represents a role in a client-server communication model.
///
/// This trait defines the basic structure for different roles in a networked
/// application. Two implementors of this trait are provided: [`Server`] and [`Client`].
///
/// The trait cannot be implemented outside of this crate.
pub trait Role: sealed::Sealed {
    /// The session type associated with this role.
    ///
    /// This allows different roles to have different session structures,
    /// tailored to their specific needs in the communication process.
    type Session: Send + Sync;
}

/// Role representing the server side of a session.
///
/// The server role is responsible for handling incoming requests and maintaining
/// stateful sessions. Unlike clients, servers can persist state between requests.
///
/// The associated `Session` type allows the server to store and access
/// session-specific data across multiple requests.
pub struct Server<S> {
    _marker: PhantomData<fn() -> *const S>,
}

impl<S> sealed::Sealed for Server<S> where S: Send + Sync {}

impl<S> Role for Server<S>
where
    S: Send + Sync,
{
    type Session = S;
}

/// Trait representing a client-side session.
///
/// Defines the behavior for sending requests to a specific server and handling responses.
pub trait ClientSession {
    /// The body type for responses received from the server.
    type Body: Body<Control: AsRef<ResponseKind>>;

    /// Sends a request to the server and returns a future that resolves to the response.
    fn send_request<B>(
        &self,
        request: Request<B>,
    ) -> impl Future<Output = Response<Self::Body>> + Send
    where
        B: Body<Control = !>;
}

/// Role representing the client side of a session.
///
/// The client role is stateless and focused solely on the ability to send requests to the server.
/// This contrasts with the server role, which can maintain state between requests.
pub struct Client<S> {
    _marker: PhantomData<fn() -> *const S>,
}

impl<S> sealed::Sealed for Client<S> where S: ClientSession + Send + Sync {}

impl<S> Role for Client<S>
where
    S: ClientSession + Send + Sync,
{
    type Session = S;
}
