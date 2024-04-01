use bytes::Bytes;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestPayload(Bytes);
