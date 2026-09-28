use alloc::{collections::BTreeMap, vec::Vec};

use type_system::ontology::VersionedUrl;

use crate::{
    name::{CheckpointName, ColumnName, InputAlias, LinkId, StepId},
    source::SqlQuery,
    step::Properties,
};

/// The table a link pipeline starts from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkInput {
    /// The rows of one checkpoint, which the first step reads as `input`.
    Checkpoint(CheckpointName),
    /// Checkpoints that the first step reads under their aliases. With more than one, a step
    /// must combine them into one table.
    Inputs(BTreeMap<InputAlias, CheckpointName>),
}

/// An SQL step of a link pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkStep {
    pub id: StepId,
    pub query: SqlQuery,
}

/// One end of a link: the entity whose ID is in `column`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkEndpoint {
    pub entity_type: VersionedUrl,
    pub column: ColumnName,
}

/// Writes each row of a table as a link between two entities.
///
/// Link pipelines run after every entity pipeline, so both ends exist when links are written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkPipeline {
    pub id: LinkId,
    pub input: LinkInput,
    pub steps: Vec<LinkStep>,
    pub from: LinkEndpoint,
    pub to: LinkEndpoint,
    pub link_type: VersionedUrl,
    pub properties: Properties,
}
