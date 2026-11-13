//! Request planning checkpoint contract.
use alloc::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{ArtifactRef, graph::OperationKind};
/// Immutable planned bodies and issue references.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlanOutput {
    pub writes: ArtifactRef,
    pub issues: ArtifactRef,
    pub batches: u32,
    pub counts: BTreeMap<OperationKind, u64>,
}
