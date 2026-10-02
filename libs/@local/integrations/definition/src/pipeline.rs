use alloc::{collections::BTreeMap, vec::Vec};

use crate::{
    name::{CheckpointName, InputAlias, SourceName},
    step::Step,
};

/// Turns the rows of one source into entities.
///
/// A pipeline is named by its source, so each source has at most one pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntityPipeline {
    pub source: SourceName,
    /// Pipelines, named by their sources, that must run before this one.
    pub depends_on: Vec<SourceName>,
    /// Checkpoints that SQL steps read under their aliases.
    pub inputs: BTreeMap<InputAlias, CheckpointName>,
    pub steps: Vec<Step>,
}
