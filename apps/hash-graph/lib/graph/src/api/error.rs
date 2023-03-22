use std::collections::HashMap;

use hash_status::Status as HashStatus;
use serde::{Deserialize, Serialize};

use crate::api::gen::status_payloads::{ErrorInfo, RequestInfo, ResourceInfo};

#[derive(Serialize, Deserialize, Debug)]
pub enum StatusPayloads {
    ErrorInfo(ErrorInfo),
    RequestInfo(RequestInfo),
    ResourceInfo(ResourceInfo),
}

impl ErrorInfo {
    pub fn new(metadata: HashMap<String, Option<serde_json::Value>>, reason: String) -> Self {
        ErrorInfo {
            domain: "HASH Graph".to_string(),
            metadata,
            reason,
        }
    }
}

pub type Status = HashStatus<StatusPayloads>;
