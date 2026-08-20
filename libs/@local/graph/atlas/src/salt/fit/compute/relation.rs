//! The relation stages: the incident-edge adjacency and the relation indexes.

use super::{
    Context, Staged,
    error::ComputeError,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::ArrayFile,
        repository::{Artifact as _, Binding},
        salt::artifact,
    },
    identity::{EdgeRowId, NodeRowId},
    salt::{
        adjacency::Adjacency,
        fit::prepare::instance::{InstanceRecord, InstanceSpool},
        relation::{BuildMeasurements, Policies, RelationIndexes, RelationPolicy},
    },
};

/// Derives the incident-edge adjacency from the staged endpoint column and stages it.
///
/// Returns the owned adjacency beside its typed binding, so the level-of-detail stage reads
/// degrees from the value this call built rather than from the staged bytes.
///
/// # Errors
///
/// Returns [`ComputeError::OpenEndpoints`] when the staged endpoint column does not map, and an
/// error when the staged adjacency does not write.
#[tracing::instrument(name = "adjacency", skip_all)]
pub(super) fn adjacency(
    context: &Context,
    rows: usize,
) -> Result<Staged<Adjacency, artifact::Adjacency, ()>, ComputeError> {
    let endpoints = ArrayFile::open(context.staging.path_of(&artifact::EdgeEndpoints::NAME))
        .map_err(ComputeError::OpenEndpoints)?;
    let pairs = endpoints
        .u64_le_pairs()
        .expect("the endpoint column was sealed as little-endian u64 pairs");
    // A row id is its little-endian encoding: the transmute relabels equal layouts, element by
    // element.
    let endpoints: &[[NodeRowId; 2]] = zerocopy::transmute_ref!(pairs);

    let adjacency = Adjacency::build(rows, endpoints);
    let binding = context.staging.stage(artifact::Adjacency, &adjacency)?;
    tracing::info!("staged the incident-edge adjacency");

    Ok(Staged {
        value: adjacency,
        binding,
        evidence: (),
    })
}

/// Assembles the spooled relation instances against the resolved policy table.
///
/// Builds the corpus-domain relation indexes, stages their published artifacts, and keeps their
/// measurements, so the edge-scale corpus pair is spent inside this stage. It then rebuilds the
/// pair over the distinct row domain for the placement stage: endpoints quotient-mapped,
/// duplicate readings collapsed, degrees and protection evidence re-derived by the same build
/// over the collapsed set. The trainer's indexes return owned.
///
/// `rows` is the node-row domain the protection matrix spans. The spool holds one reading
/// per `(edge, relation)` pair. The policy table covers exactly the relation universe those
/// readings carry, so every instance resolves.
///
/// # Errors
///
/// Returns [`ComputeError::Relation`] when the table is not strictly ascending by relation row or
/// when either index build rejects the instances, and an I/O error when the instance spool does
/// not map or a staged artifact does not write.
#[tracing::instrument(name = "relations", skip_all)]
pub(super) fn indexes(
    context: &Context,
    rows: usize,
    quotient: &Quotient<'_, PROJECTOR_DIMENSIONS>,
    policies: &[RelationPolicy],
    spool: &InstanceSpool,
    multi_typed: &[u64],
) -> Result<(RelationArtifacts, RelationIndexes<DistinctRowId, EdgeRowId>), ComputeError> {
    let policies = Policies::new(policies)?;

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

    let mut corpus =
        RelationIndexes::build(rows, policies, &mut instances, context.config.attraction)?;

    let mut collapsed = quotient.collapse_instances(&instances);
    drop(instances);
    let trainer = RelationIndexes::build(
        quotient.distinct_len(),
        policies,
        &mut collapsed,
        context.config.attraction,
    )?;
    drop(collapsed);

    // The histogram and the clamp count are drain facts the build
    // cannot see; they join the build measurements here on their way
    // to the manifest.
    corpus.measurements.multi_typed_edges = multi_typed.to_vec();

    let attraction = context.staging.stage_with(artifact::Attraction, |writer| {
        corpus.attraction.write_into(rows as u64, writer)
    })?;
    let protection = context
        .staging
        .stage(artifact::Protection, &corpus.protection)?;

    tracing::info!(
        retained = corpus.measurements.retained_edges,
        pruned = corpus.measurements.pruned_edges,
        self_references = corpus.measurements.self_references,
        "staged the attraction and protection indexes"
    );
    tracing::info!(
        retained = trainer.measurements.retained_edges,
        collapsed_self_references = trainer.measurements.self_references,
        "built the distinct-domain trainer indexes"
    );

    Ok((
        RelationArtifacts {
            attraction,
            protection,
            measurements: corpus.measurements,
        },
        trainer,
    ))
}

/// The relation stage's published artifacts: the staged corpus bindings and their measurements.
///
/// The corpus-domain indexes are spent once staged. The manifest keeps their measurements, and
/// the placement's paired-movement readout replays from the staged bytes on purpose.
pub(super) struct RelationArtifacts {
    /// The staged attraction index's typed binding.
    pub attraction: Binding<artifact::Attraction>,
    /// The staged protection index's typed binding.
    pub protection: Binding<artifact::Protection>,
    /// The corpus build's account of dropped instances and pruned force mass.
    pub measurements: BuildMeasurements,
}
