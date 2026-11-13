//! Hash and diff checkpoint contract.
use alloc::collections::{BTreeMap, BTreeSet};

use hash_integrations_definition::SourceName;
use serde::{Deserialize, Serialize};

use crate::{ArtifactRef, RunId, Target};

/// The desired state and changed rows bound by stage 2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiffOutput {
    pub base: Option<RunId>,
    pub resent: Vec<RunId>,
    pub hashes: ArtifactRef,
    pub archives: ArtifactRef,
    pub issues: ArtifactRef,
    pub targets: BTreeMap<Target, TargetDiff>,
}
/// Changes and counts for one target, including empty targets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetDiff {
    pub changes: Option<ArtifactRef>,
    pub counts: DiffCounts,
}
/// Row classifications for a target.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiffCounts {
    pub inserted: u64,
    pub updated: u64,
    pub resent: u64,
    pub unchanged: u64,
    pub archived: u64,
    pub without_id: u64,
}
/// Rows produced by steps 2 and 3 before diffing.
#[derive(Debug)]
pub struct PreparedRows {
    pub targets: Vec<TargetRows>,
    pub issues: Box<str>,
}
/// A prepared target's table and its mapped inputs.
#[derive(Debug)]
pub struct TargetRows {
    pub target: Target,
    pub table: Box<str>,
    pub columns: Vec<Box<str>>,
    pub sources: BTreeSet<SourceName>,
    pub without_id: u64,
}
