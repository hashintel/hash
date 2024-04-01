pub use bytes::Bytes;

use self::{begin::RequestBegin, flags::RequestFlags, frame::RequestFrame, id::RequestId};
use crate::protocol::Protocol;

pub mod authorization;
pub mod begin;
pub mod flags;
pub mod frame;
pub mod id;
pub mod payload;
pub mod procedure;
pub mod service;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestHeader {
    protocol: Protocol,
    request_id: RequestId,

    flags: RequestFlags,
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
