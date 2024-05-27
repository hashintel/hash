// Response { kind: ..., body: ... }, the problem is just that this way we're unable to emit
// multiple responses (e.g. on errors)
// actually no it's fine if we just have a ResponseStream!

use harpc_wire_protocol::response::kind::ResponseKind;

use crate::extensions::Extensions;

pub struct Response<B, S> {
    kind: ResponseKind,

    body: B,

    session: S,
    extensions: Extensions,
}

pub struct ResponseStream<S> {
    stream: S,
}
