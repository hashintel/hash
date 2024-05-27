// Response { kind: ..., body: ... }, the problem is just that this way we're unable to emit
// multiple responses (e.g. on errors)
// actually no it's fine if we just have a ResponseStream!

use harpc_net::session::{error::TransactionError, server::SessionId};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::{body::full::Full, extensions::Extensions};

// TODO: into parts?!
pub struct Response<B> {
    kind: ResponseKind,

    session: SessionId,

    body: B,

    extensions: Extensions,
}

impl Response<Full> {
    pub(crate) fn new_error(session: SessionId, error: TransactionError) -> Self {
        Self {
            kind: ResponseKind::Err(error.code),
            session,
            body: Full::new(error.bytes),
            extensions: Extensions::new(),
        }
    }
}

impl<B> Response<B> {
    pub fn map_body<NB>(self, func: impl FnOnce(B) -> NB) -> Response<NB> {
        Response {
            body: func(self.body),
            ..self
        }
    }
}

// TODO: consider removing this?!
pub struct ResponseStream<S> {
    stream: S,
}
