//! The relation stage: adjacency, instance assembly, and the relation indexes.

use super::{
    super::{
        error::StageError,
        prepare::instance::{InstanceRecord, InstanceSpool},
        role::{Role, stage, write_staged},
    },
    Context,
    quotient::{self, DistinctRowId, RowQuotient},
};
use crate::{
    file::{array::ArrayFile, policy::read::PolicyFile, repository::RepositoryFile},
    identity::{EdgeRowId, NodeRowId},
    salt::{
        adjacency::Adjacency,
        policy::artifact::PolicyTableArchive,
        relation::{Policies, RelationIndexes},
    },
};

/// The staged relation artifacts of one fit.
///
/// Both index files beside the owned indexes, in both row domains.
pub(super) struct RelationArtifacts {
    pub attraction: RepositoryFile,
    pub protection: RepositoryFile,
    // Owned rather than mapped back: edge-scale, bounded by the
    // retained instance count. The corpus row-domain truth the staged
    // files persist; the manifest's relation measurements read here.
    pub indexes: RelationIndexes<NodeRowId, EdgeRowId>,
    // The placement stage's distinct-domain twin: endpoints mapped
    // onto the representation quotient, duplicate readings collapsed
    // to one assertion each. Never staged.
    pub trainer: RelationIndexes<DistinctRowId, EdgeRowId>,
}

impl Context<'_> {
    /// Derives the incident-edge adjacency from the staged endpoint column and stages it.
    pub(super) fn stage_adjacency(&self, rows: usize) -> Result<RepositoryFile, StageError> {
        let _span = tracing::info_span!("adjacency").entered();

        let endpoints = ArrayFile::open(self.staging.path_of(&Role::EdgeEndpoints.file_name()))
            .map_err(StageError::MapEndpoints)?;
        let pairs = endpoints
            .u64_le_pairs()
            .expect("the endpoint column was sealed as little-endian u64 pairs");
        // A row id is its little-endian encoding: the transmute
        // relabels equal layouts, element by element.
        let pairs: &[[NodeRowId; 2]] = zerocopy::transmute_ref!(pairs);

        let adjacency = Adjacency::build(rows, pairs);
        let file = stage(self.staging, Role::Adjacency, &adjacency)?;
        tracing::info!("staged the incident-edge adjacency");
        Ok(file)
    }

    /// Assembles the spooled relation instances against the staged policy table.
    ///
    /// Builds both relation indexes and stages them, then rebuilds the pair over the distinct row
    /// domain for the placement stage: endpoints quotient-mapped, duplicate readings collapsed,
    /// degrees and protection evidence re-derived by the same build over the collapsed set.
    ///
    /// `rows` is the node-row domain the protection matrix spans. The spool holds one reading per
    /// `(edge, relation)` pair; the policy table covers exactly the relation universe those
    /// readings carry, so every instance resolves.
    pub(super) fn stage_relations(
        &self,
        rows: usize,
        quotient: &RowQuotient,
        spool: &InstanceSpool,
        multi_typed: &[u64],
        clamped_confidences: u64,
    ) -> Result<RelationArtifacts, StageError> {
        let _span = tracing::info_span!("relations").entered();

        let table = PolicyTableArchive::new(PolicyFile::open(
            self.staging.path_of(&Role::Policy.file_name()),
        )?)?;
        let policies =
            Policies::new(table.policies()).expect("the mapped table certified order and domains");

        let mapped = spool.map()?;
        // The spool maps read-only encoded records and the index build sorts its instance slice
        // in place, so the readings decode into owned storage once; the mapping unmaps before
        // the sorts run.
        let mut instances: Vec<_> = mapped
            .records()
            .iter()
            .map(InstanceRecord::instance)
            .collect();
        drop(mapped);

        let mut indexes =
            RelationIndexes::build(rows, policies, &mut instances, self.config.attraction)?;

        let mut collapsed = quotient::collapse_instances(&instances, quotient);
        drop(instances);
        let trainer = RelationIndexes::build(
            quotient.distinct_len(),
            policies,
            &mut collapsed,
            self.config.attraction,
        )?;
        drop(collapsed);

        // The histogram and the clamp count are drain facts the build
        // cannot see; they join the build measurements here on their way
        // to the manifest.
        indexes.measurements.multi_typed_edges = multi_typed.to_vec();
        indexes.measurements.clamped_confidences = clamped_confidences;

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
        tracing::info!(
            retained = trainer.measurements.retained_edges,
            collapsed_self_references = trainer.measurements.self_references,
            "built the distinct-domain trainer indexes"
        );

        Ok(RelationArtifacts {
            attraction,
            protection,
            indexes,
            trainer,
        })
    }
}
