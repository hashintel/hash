//! The relation stage: adjacency, instance assembly, and the relation indexes.

use super::{
    super::{
        error::StageError,
        prepare::instance::{InstanceRecord, InstanceSpool},
        role::{Role, stage, write_staged},
    },
    Context,
};
use crate::{
    file::{array::ArrayFile, policy::read::PolicyFile, repository::RepositoryFile},
    salt::{
        adjacency::Adjacency,
        policy::artifact::PolicyTableArchive,
        relation::{Policies, RelationIndexes, RelationInstance},
    },
};

/// The staged relation artifacts of one fit.
///
/// Both index files beside the owned indexes the placement stage consumes.
pub(super) struct RelationArtifacts {
    pub attraction: RepositoryFile,
    pub protection: RepositoryFile,
    // Owned rather than mapped back: edge-scale, bounded by the
    // retained instance count, and the placement stage wants the
    // decoded form anyway.
    pub indexes: RelationIndexes,
}

impl Context<'_> {
    /// Derives the incident-edge adjacency from the staged endpoint column and stages it.
    pub(super) fn stage_adjacency(&self, rows: usize) -> Result<RepositoryFile, StageError> {
        let _span = tracing::info_span!("adjacency").entered();

        let endpoints = ArrayFile::open(self.staging.path_of(&Role::EdgeEndpoints.file_name()))
            .map_err(StageError::MapEndpoints)?;
        let pairs = endpoints
            .u64_pairs()
            .expect("the endpoint column was sealed as u64 pairs");

        let adjacency = Adjacency::build(rows, pairs);
        let file = stage(self.staging, Role::Adjacency, &adjacency)?;
        tracing::info!("staged the incident-edge adjacency");
        Ok(file)
    }

    /// Assembles the spooled relation instances against the staged policy table.
    ///
    /// Builds both relation indexes, and stages them.
    ///
    /// `rows` is the node-row domain the protection matrix spans. The spool holds one reading per
    /// `(edge, relation)` pair; the policy table covers exactly the relation universe those
    /// readings carry, so every instance resolves.
    pub(super) fn stage_relations(
        &self,
        rows: usize,
        spool: &InstanceSpool,
        multi_typed: &[u64],
    ) -> Result<RelationArtifacts, StageError> {
        let _span = tracing::info_span!("relations").entered();

        let table = PolicyTableArchive::new(PolicyFile::open(
            self.staging.path_of(&Role::Policy.file_name()),
        )?)?;
        let policies =
            Policies::new(table.policies()).expect("the mapped table certified order and domains");

        let mapped = spool.map()?;
        let mut instances: Vec<RelationInstance> = mapped
            .records()
            .iter()
            .map(InstanceRecord::instance)
            .collect();
        drop(mapped);

        let mut indexes =
            RelationIndexes::build(rows, policies, &mut instances, self.config.attraction)?;
        drop(instances);
        // The histogram is a drain fact the build cannot see; it joins
        // the build measurements here on its way to the manifest.
        indexes.measurements.multi_typed_edges = multi_typed.to_vec();

        let attraction = write_staged(self.staging, Role::Attraction, |writer| {
            indexes.attraction.write_into(rows as u64, writer)
        })?;
        let protection = stage(self.staging, Role::Protection, &indexes.protection)?;

        tracing::info!(
            retained = indexes.measurements.retained_edges,
            pruned = indexes.measurements.pruned_edges,
            self_references = indexes.measurements.self_references,
            "staged the attraction and protection indexes"
        );

        Ok(RelationArtifacts {
            attraction,
            protection,
            indexes,
        })
    }
}
