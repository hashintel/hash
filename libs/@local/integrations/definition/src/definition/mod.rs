mod check;
mod order;
#[cfg(test)]
mod tests;

use alloc::{collections::BTreeMap, vec, vec::Vec};

use error_stack::Report;

use self::check::Check;
use crate::{
    issue::DefinitionIssue,
    link::LinkPipeline,
    name::{ConnectorId, SourceName, UnitMapName},
    pipeline::EntityPipeline,
    source::Source,
    unit_map::UnitMap,
};

/// The parts of a [`Definition`], before they are checked against each other.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefinitionParts {
    pub connector: ConnectorId,
    pub sources: BTreeMap<SourceName, Source>,
    pub unit_maps: BTreeMap<UnitMapName, UnitMap>,
    /// Entity pipelines in declaration order.
    pub entity_pipelines: Vec<EntityPipeline>,
    pub link_pipelines: Vec<LinkPipeline>,
}

/// An integration definition whose parts refer to each other consistently.
///
/// Every name a part refers to is declared, IDs and checkpoints are unique, and entity pipelines
/// can be ordered by their dependencies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Definition {
    connector: ConnectorId,
    sources: BTreeMap<SourceName, Source>,
    unit_maps: BTreeMap<UnitMapName, UnitMap>,
    entity_pipelines: Vec<EntityPipeline>,
    link_pipelines: Vec<LinkPipeline>,
}

impl Definition {
    /// Checks `parts` against each other and orders the entity pipelines to run.
    ///
    /// # Errors
    ///
    /// Returns every [`DefinitionIssue`] found, each with the path of the part it concerns.
    pub fn new(parts: DefinitionParts) -> Result<Self, Report<[DefinitionIssue]>> {
        let order = Check::run(&parts)?;

        let DefinitionParts {
            connector,
            sources,
            unit_maps,
            entity_pipelines,
            link_pipelines,
        } = parts;

        let mut ranks = vec![0; entity_pipelines.len()];
        for (rank, index) in order.into_iter().enumerate() {
            if let Some(pipeline_rank) = ranks.get_mut(index) {
                *pipeline_rank = rank;
            }
        }
        let mut ranked: Vec<_> = ranks.into_iter().zip(entity_pipelines).collect();
        ranked.sort_by_key(|&(rank, _)| rank);
        let entity_pipelines = ranked.into_iter().map(|(_, pipeline)| pipeline).collect();

        Ok(Self {
            connector,
            sources,
            unit_maps,
            entity_pipelines,
            link_pipelines,
        })
    }

    #[must_use]
    pub const fn connector(&self) -> &ConnectorId {
        &self.connector
    }

    #[must_use]
    pub const fn sources(&self) -> &BTreeMap<SourceName, Source> {
        &self.sources
    }

    #[must_use]
    pub const fn unit_maps(&self) -> &BTreeMap<UnitMapName, UnitMap> {
        &self.unit_maps
    }

    /// Returns the entity pipelines in the order they run: each after its dependencies, and
    /// otherwise in declaration order.
    #[must_use]
    pub fn entity_pipelines(&self) -> &[EntityPipeline] {
        &self.entity_pipelines
    }

    #[must_use]
    pub fn link_pipelines(&self) -> &[LinkPipeline] {
        &self.link_pipelines
    }
}
