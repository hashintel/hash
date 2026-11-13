//! Capture checkpoint contract.
use alloc::collections::BTreeMap;

use hash_integrations_definition::SourceName;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::RunId;
pub use crate::sources::CapturedSource;

/// Captures selected by the stage's immutable completion marker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaptureOutput {
    #[serde(with = "time::serde::rfc3339")]
    pub captured_at: OffsetDateTime,
    #[serde(with = "crate::run::serde::sources")]
    pub sources: BTreeMap<SourceName, CapturedSource>,
    pub adopted_from: Option<RunId>,
}
