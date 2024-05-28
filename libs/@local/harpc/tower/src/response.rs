// Response { kind: ..., body: ... }, the problem is just that this way we're unable to emit
// multiple responses (e.g. on errors)
// actually no it's fine if we just have a ResponseStream!

use harpc_net::session::{error::TransactionError, server::SessionId};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::{
    body::{control::Controlled, full::Full, Body},
    extensions::Extensions,
};

// TODO: into parts?!
pub struct Response<B> {
    session: SessionId,

    body: B,

    extensions: Extensions,
}

impl<B> Response<B>
where
    B: Body<Control: AsRef<ResponseKind>>,
{
    pub fn session(&self) -> SessionId {
        self.session
    }

    pub fn map_body<B2>(self, f: impl FnOnce(B) -> B2) -> Response<B2> {
        Response {
            session: self.session,
            body: f(self.body),
            extensions: self.extensions,
        }
    }
}

impl Response<Controlled<ResponseKind, Full>> {
    pub fn new_error(session: SessionId, error: TransactionError) -> Self {
        Self {
            session,
            body: Controlled::new(ResponseKind::Err(error.code), Full::new(error.bytes)),
            extensions: Extensions::new(),
        }
    }
}
