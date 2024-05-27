// Response { kind: ..., body: ... }, the problem is just that this way we're unable to emit
// multiple responses (e.g. on errors)
// actually no it's fine if we just have a ResponseStream!

use harpc_net::session::server::SessionId;
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::extensions::Extensions;

pub struct Response<B> {
    kind: ResponseKind,

    session: SessionId,

    body: B,

    extensions: Extensions,
}

pub struct ResponseStream<S> {
    stream: S,
}
