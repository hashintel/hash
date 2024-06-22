use harpc_net::session::{error::TransactionError, server::SessionId};
use harpc_wire_protocol::response::kind::ResponseKind;

use crate::{
    body::{controlled::Controlled, full::Full, Body},
    extensions::Extensions,
};

pub struct Parts {
    pub session: SessionId,

    pub extensions: Extensions,
}

impl Parts {
    pub fn new(session: SessionId) -> Self {
        Self {
            session,
            extensions: Extensions::new(),
        }
    }
}

pub struct Response<B> {
    head: Parts,
    body: B,
}

impl<B> Response<B>
where
    B: Body<Control: AsRef<ResponseKind>>,
{
    pub fn from_parts(parts: Parts, body: B) -> Self {
        Self { head: parts, body }
    }

    pub fn session(&self) -> SessionId {
        self.head.session
    }

    pub fn body(&self) -> &B {
        &self.body
    }

    pub fn body_mut(&mut self) -> &mut B {
        &mut self.body
    }

    pub fn into_body(self) -> B {
        self.body
    }

    pub fn extensions(&self) -> &Extensions {
        &self.head.extensions
    }

    pub fn extensions_mut(&mut self) -> &mut Extensions {
        &mut self.head.extensions
    }

    pub fn map_body<B2>(self, f: impl FnOnce(B) -> B2) -> Response<B2> {
        Response {
            head: self.head,
            body: f(self.body),
        }
    }
}

impl Response<Controlled<ResponseKind, Full>> {
    pub fn from_error(parts: Parts, error: TransactionError) -> Self {
        Self {
            head: parts,
            body: Controlled::new(ResponseKind::Err(error.code), Full::new(error.bytes)),
        }
    }
}
