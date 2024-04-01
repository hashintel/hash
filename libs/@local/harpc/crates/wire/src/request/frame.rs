use super::payload::RequestPayload;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestFrame {
    payload: RequestPayload,
}
