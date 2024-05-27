use harpc_net::session::server::SessionId;
use harpc_wire_protocol::request::{procedure::ProcedureDescriptor, service::ServiceDescriptor};

use crate::extensions::Extensions;

// TODO: Parts?!

pub struct Request<B> {
    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    session: SessionId,

    body: B,

    extensions: Extensions,
}

impl<B> Request<B> {
    pub fn session(&self) -> SessionId {
        self.session
    }
}

// TODO: response to be able to set multiple kinds?! in that case we would need another poll_data
// (instead like a poll_frame?)
