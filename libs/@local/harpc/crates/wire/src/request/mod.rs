pub use bytes::Bytes;

use self::{
    begin::RequestBegin, body::RequestBody, flags::RequestFlag, frame::RequestFrame,
    header::RequestHeader, id::RequestId,
};
use crate::protocol::Protocol;

pub mod authorization;
pub mod begin;
pub mod body;
pub mod codec;
pub mod flags;
pub mod frame;
pub mod header;
pub mod id;
pub mod payload;
pub mod procedure;
pub mod service;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    header: RequestHeader,
    body: RequestBody,
}
