use std::collections::HashMap;

use hash_status::Status as HashStatus;
use serde::{Deserialize, Serialize};

pub(in crate::api) use crate::api::gen::status_payloads::{ErrorInfo, RequestInfo, ResourceInfo};

#[derive(Serialize, Deserialize, Debug)]
pub enum StatusPayloads {
    ErrorInfo(ErrorInfo),
    RequestInfo(RequestInfo),
    ResourceInfo(ResourceInfo),
}

impl ErrorInfo {
    pub fn new(metadata: HashMap<String, serde_json::Value>, reason: String) -> Self {
        Self {
            domain: "HASH Graph".to_owned(),
            metadata: metadata.into_iter().map(|(k, v)| (k, Some(v))).collect(),
            reason,
        }
    }
}

pub type Status = HashStatus<StatusPayloads>;
