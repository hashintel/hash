//! Delivery checkpoint contract.
use serde::{Deserialize, Serialize};

use crate::ArtifactRef;
/// Delivery completion; committing current state remains a separate conditional operation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendOutput {
    pub rejected: Option<ArtifactRef>,
    pub counts: SendCounts,
}
/// The result of every planned write.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SendCounts {
    pub created: u64,
    pub patched: u64,
    pub archived: u64,
    pub absent: u64,
    pub rejected: u64,
}
