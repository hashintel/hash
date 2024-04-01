use super::{
    authorization::Authorization, payload::RequestPayload, procedure::Procedure, service::Service,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBegin {
    service: Service,
    procedure: Procedure,

    authorization: Option<Authorization>,

    // begin is 22 bytes, so payload can be 16KiB - 32 bytes (rest is padding for the future)
    // that way the packet won't ever exceed 16KiB
    payload: RequestPayload,
}
