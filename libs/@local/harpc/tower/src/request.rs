use harpc_wire_protocol::request::{procedure::ProcedureDescriptor, service::ServiceDescriptor};

use crate::extensions::Extensions;

pub struct Request<B, S> {
    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    body: B,

    session: S,
    extensions: Extensions,
}

// TODO: response to be able to set multiple kinds?! in that case we would need another poll_data
// (instead like a poll_frame?)
