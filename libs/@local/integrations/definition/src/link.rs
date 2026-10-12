use alloc::{
    collections::{BTreeMap, btree_map},
    vec::Vec,
};

use type_system::ontology::VersionedUrl;

use crate::{
    name::{CheckpointName, ColumnName, InputAlias, LinkId, StepId},
    source::SqlQuery,
    step::Properties,
};

/// Reports that a link pipeline reads no checkpoints.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("link reads no checkpoints")]
pub struct EmptyLinkInputs;

/// One or more checkpoints that the first step of a link pipeline reads under their aliases.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkInputs(BTreeMap<InputAlias, CheckpointName>);

impl TryFrom<BTreeMap<InputAlias, CheckpointName>> for LinkInputs {
    type Error = EmptyLinkInputs;

    fn try_from(inputs: BTreeMap<InputAlias, CheckpointName>) -> Result<Self, Self::Error> {
        if inputs.is_empty() {
            return Err(EmptyLinkInputs);
        }
        Ok(Self(inputs))
    }
}

impl LinkInputs {
    /// Returns each alias with the checkpoint it names.
    pub fn iter(&self) -> btree_map::Iter<'_, InputAlias, CheckpointName> {
        self.0.iter()
    }
}

impl<'inputs> IntoIterator for &'inputs LinkInputs {
    type IntoIter = btree_map::Iter<'inputs, InputAlias, CheckpointName>;
    type Item = (&'inputs InputAlias, &'inputs CheckpointName);

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// The table a link pipeline starts from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkInput {
    /// The rows of one checkpoint, which the first step reads as `input`.
    Checkpoint(CheckpointName),
    /// Checkpoints that the first step reads under their aliases. With more than one, a step
    /// must combine them into one table.
    Inputs(LinkInputs),
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

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeMap;

    use super::{EmptyLinkInputs, LinkInputs};

    #[test]
    fn link_inputs_empty() {
        assert_eq!(
            LinkInputs::try_from(BTreeMap::new()),
            Err(EmptyLinkInputs),
            "a link without input checkpoints should be rejected"
        );
    }
}
