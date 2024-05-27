use harpc_wire_protocol::{
    request::{procedure::ProcedureDescriptor, service::ServiceDescriptor},
    response::kind::ResponseKind,
};

pub struct Request<B> {
    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    body: B,
}

// TODO: response to be able to set multiple kinds?! in that case we would need another poll_data
// (instead like a poll_frame?)
