use std::collections::HashMap;

use hash_status::Status as HashStatus;

pub use crate::generated::status_payloads::{ErrorInfo, RequestInfo, ResourceInfo};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub enum StatusPayloads {
    ErrorInfo(ErrorInfo),
    RequestInfo(RequestInfo),
    ResourceInfo(ResourceInfo),
}

impl ErrorInfo {
    #[must_use]
    pub fn new(metadata: HashMap<String, serde_json::Value>, reason: String) -> Self {
        Self {
            domain: "HASH Graph".to_owned(),
            metadata: metadata.into_iter().map(|(k, v)| (k, Some(v))).collect(),
            reason,
        }
    }
}

pub type Status = HashStatus<StatusPayloads>;
