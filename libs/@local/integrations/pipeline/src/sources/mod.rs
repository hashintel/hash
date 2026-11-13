//! Source capture references shared by ingestion stages.

use core::pin::Pin;

use hash_crypto::Secret;
use serde::{Deserialize, Serialize};

use crate::ArtifactRef;

/// Secret bytes held in protected memory.
pub type SecretValue = Pin<Box<Secret<[u8]>>>;

/// An immutable source capture and its row count before staging.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapturedSource {
    pub file: ArtifactRef,
    pub rows: u64,
}
