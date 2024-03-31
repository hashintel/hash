pub use bytes::Bytes;

use self::{
    authorization::Authorization, flags::RequestFlags, procedure::Procedure, service::Service,
};
use crate::protocol::Protocol;

pub mod authorization;
pub mod flags;
pub mod procedure;
pub mod service;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestId(u16);

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestHeader {
    protocol: Protocol,
    request_id: RequestId,

    flags: RequestFlags,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestPayload(Bytes);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBegin {
    service: Service,
    procedure: Procedure,

    authorization: Option<Authorization>,

    payload: RequestPayload,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestFrame {
    payload: RequestPayload,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RequestBody {
    Begin(RequestBegin),
    Frame(RequestFrame),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    header: RequestHeader,
    body: RequestBody,
}
