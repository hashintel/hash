//! The relation stage: adjacency, instance assembly, and the relation
//! indexes.

use std::io::{BufWriter, Write as _};

use super::{
    super::{
        error::StageError,
        prepare::instance::{InstanceRecord, InstanceSpool},
        role::{Role, write_staged},
    },
    Context,
};
use crate::{
    file::{array::ArrayFile, policy::read::PolicyFile, repository::RepositoryFile},
    salt::{
        adjacency::Adjacency,
        policy::artifact::MappedPolicyTable,
        relation::{Policies, RelationIndexes, RelationInstance},
    },
};

/// The staged relation artifacts of one fit.
///
/// The built indexes ride along beside their staged files: the
/// projector stage consumes them in their owned form, so handing them
/// on saves a decode round-trip through the artifacts just written.
/// They are edge-scale - bounded by the retained instance count, not
/// the corpus - and drop at the placement stage's exit.
pub(super) struct RelationArtifacts {
    pub attraction: RepositoryFile,
    pub protection: RepositoryFile,
    pub indexes: RelationIndexes,
}

impl Context<'_> {
    /// Derives the incident-edge adjacency from the staged endpoint
    /// column and stages it.
    pub(super) fn stage_adjacency(&self, rows: usize) -> Result<RepositoryFile, StageError> {
        let _span = tracing::info_span!("adjacency").entered();

        let endpoints = ArrayFile::open(self.staging.path_of(&Role::EdgeEndpoints.file_name()))
            .map_err(StageError::MapEndpoints)?;
        let pairs = endpoints
            .u64_pairs()
            .expect("the endpoint column was sealed as u64 pairs");

        let adjacency = Adjacency::build(rows, pairs);
        let mut writer = BufWriter::new(self.staging.create(&Role::Adjacency.file_name())?);
        let digest = adjacency
            .write_into(&mut writer)
            .map_err(StageError::WriteAdjacency)?;
        writer.flush()?;
        Ok(Role::Adjacency.file(digest))
    }

    /// Assembles the spooled relation instances against the staged
    /// policy table, builds both relation indexes, and stages them.
    ///
    /// `rows` is the node-row domain the protection matrix spans. The
    /// spool holds one reading per `(edge, relation)` pair; the policy
    /// table covers exactly the relation universe those readings carry,
    /// so every instance resolves.
    pub(super) fn stage_relations(
        &self,
        rows: usize,
        spool: &InstanceSpool,
    ) -> Result<RelationArtifacts, StageError> {
        let _span = tracing::info_span!("relations").entered();

        let table = MappedPolicyTable::new(PolicyFile::open(
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

        let indexes =
            RelationIndexes::build(rows, policies, &mut instances, self.config.attraction)?;
        drop(instances);

        let attraction = write_staged(self.staging, Role::Attraction, |writer| {
            indexes.attraction.write_into(rows as u64, writer)
        })?;
        let protection = {
            let mut writer = BufWriter::new(self.staging.create(&Role::Protection.file_name())?);
            let digest = indexes.protection.write_into(&mut writer)?;
            writer.flush()?;
            Role::Protection.file(digest)
        };

        Ok(RelationArtifacts {
            attraction,
            protection,
            indexes,
        })
    }
}
