use bytes::Bytes;
use futures::{Stream, TryStreamExt, stream::MapOk};
use harpc_codec::error::EncodedError;
use harpc_net::session::server::SessionId;
use harpc_types::response_kind::ResponseKind;

use crate::{
    body::{Frame, boxed::BoxBody, controlled::Controlled, full::Full, stream::StreamBody},
    extensions::Extensions,
};

#[derive(Debug, Clone)]
pub struct Parts {
    pub session: SessionId,

    pub extensions: Extensions,
}

impl Parts {
    #[must_use]
    pub fn new(session: SessionId) -> Self {
        Self {
            session,
            extensions: Extensions::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Response<B> {
    head: Parts,
    body: B,
}

// we specifically don't have a `B: Body<Control: AsRef<ResponseKind>>` bound here, to allow for
// requests to carry streams
impl<B> Response<B> {
    pub const fn from_parts(parts: Parts, body: B) -> Self {
        Self { head: parts, body }
    }

    pub fn into_parts(self) -> (Parts, B) {
        (self.head, self.body)
    }
}

impl<B> Response<B> {
    pub const fn session(&self) -> SessionId {
        self.head.session
    }

    pub const fn body(&self) -> &B {
        &self.body
    }

    pub fn body_mut(&mut self) -> &mut B {
        &mut self.body
    }

    pub fn into_body(self) -> B {
        self.body
    }

    pub const fn extensions(&self) -> &Extensions {
        &self.head.extensions
    }

    pub fn extensions_mut(&mut self) -> &mut Extensions {
        &mut self.head.extensions
    }

    pub fn map_body<B2>(self, func: impl FnOnce(B) -> B2) -> Response<B2> {
        Response {
            head: self.head,
            body: func(self.body),
        }
    }
}

impl Response<Controlled<ResponseKind, Full<Bytes>>> {
    pub fn from_error(parts: Parts, error: EncodedError) -> Self {
        let (code, bytes) = error.into_parts();

        Self {
            head: parts,
            body: Controlled::new(ResponseKind::Err(code), Full::new(bytes)),
        }
    }
}

impl<S, B, E> Response<Controlled<ResponseKind, StreamBody<MapOk<S, fn(B) -> Frame<B, !>>>>>
where
    S: Stream<Item = Result<B, E>>,
{
    pub fn from_ok(parts: Parts, stream: S) -> Self {
        Self {
            head: parts,
            body: Controlled::new(
                ResponseKind::Ok,
                StreamBody::new(stream.map_ok(Frame::new_data)),
            ),
        }
    }
}

pub type BoxedResponse<E> = Response<BoxBody<Bytes, ResponseKind, E>>;
