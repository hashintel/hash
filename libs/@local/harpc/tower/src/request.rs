use harpc_net::session::server::{SessionId, transaction::TransactionContext};
use harpc_types::{procedure::ProcedureDescriptor, service::ServiceDescriptor};

use crate::{body::Body, extensions::Extensions};

/// Component parts of a harpc `Request`.
#[derive(Debug, Clone)]
pub struct Parts {
    pub service: ServiceDescriptor,
    pub procedure: ProcedureDescriptor,

    pub session: SessionId,

    pub extensions: Extensions,
}

impl Parts {
    #[must_use]
    pub fn from_transaction(context: &TransactionContext) -> Self {
        Self {
            service: context.service(),
            procedure: context.procedure(),
            session: context.session(),
            extensions: Extensions::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Request<B> {
    head: Parts,
    body: B,
}

impl<B> Request<B>
where
    B: Body<Control = !>,
{
    pub const fn new(parts: Parts, body: B) -> Self {
        Self { head: parts, body }
    }

    pub const fn service(&self) -> ServiceDescriptor {
        self.head.service
    }

    pub const fn procedure(&self) -> ProcedureDescriptor {
        self.head.procedure
    }

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
}
