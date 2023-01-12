use hash_status::Status as HashStatus;

use crate::api::gen::status_payloads::{ErrorInfo, RequestInfo};

#[derive(Debug)]
pub enum StatusPayloads {
    ErrorInfo(ErrorInfo),
    RequestInfo(RequestInfo),
}

pub type Status = HashStatus<StatusPayloads>;
