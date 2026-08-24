//! The relation stages, building the incident-edge adjacency and the relation indexes.

use core::{error::Error, fmt};
use std::io;

use super::{
    Context, Staged,
    quotient::{DistinctRowId, Quotient},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::{ArrayFile, OpenArrayError},
        repository::{Artifact as _, Binding},
        salt::artifact,
        sprs::write::WriteSprsError,
    },
    identity::{EdgeRowId, NodeRowId},
    salt::{
        adjacency::Adjacency,
        fit::prepare::instance::{InstanceRecord, InstanceSpool},
        policy::CertifiedPolicies,
        relation::{BuildMeasurements, Policies, RelationIndexError, RelationIndexes},
    },
};

/// The adjacency stage failed and staged nothing.
///
/// One variant per way the stage refuses, so an adjacency failure attributes to this stage by
/// construction.
#[derive(Debug)]
pub(crate) enum AdjacencyError {
    /// The staged endpoint column failed to map in.
    OpenEndpoints(OpenArrayError),
    /// The derived adjacency failed to stage.
    Write(WriteSprsError),
}

impl From<WriteSprsError> for AdjacencyError {
    fn from(error: WriteSprsError) -> Self {
        Self::Write(error)
    }
}

impl fmt::Display for AdjacencyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OpenEndpoints(error) => {
                write!(fmt, "the staged endpoint column failed to map in: {error}")
            }
            Self::Write(error) => write!(fmt, "the derived adjacency failed to stage: {error}"),
        }
    }
}

impl Error for AdjacencyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::OpenEndpoints(error) => Some(error),
            Self::Write(error) => Some(error),
        }
    }
}

/// The relation stage failed and staged no index.
///
/// One variant per way the stage refuses, so a relation failure attributes to this stage by
/// construction.
#[derive(Debug)]
pub(crate) enum RelationError {
    /// An index build rejected its instances.
    Build(RelationIndexError),
    /// The protection index failed to stage.
    Write(WriteSprsError),
    /// The instance spool failed to map, or the attraction index failed to stage.
    Io(io::Error),
}

impl From<RelationIndexError> for RelationError {
    fn from(error: RelationIndexError) -> Self {
        Self::Build(error)
    }
}

impl From<WriteSprsError> for RelationError {
    fn from(error: WriteSprsError) -> Self {
        Self::Write(error)
    }
}

impl From<io::Error> for RelationError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl fmt::Display for RelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Build(error) => write!(fmt, "the relation index build failed: {error}"),
            Self::Write(error) => write!(fmt, "the protection index failed to stage: {error}"),
            Self::Io(error) => write!(
                fmt,
                "the instance spool failed to map or the attraction index failed to stage: {error}"
            ),
        }
    }
}

impl Error for RelationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Build(error) => Some(error),
            Self::Write(error) => Some(error),
            Self::Io(error) => Some(error),
        }
    }
}

/// The adjacency stage, bound to the staged endpoint column it derives from.
pub(super) struct AdjacencyDerivation<'fit> {
    /// The stage's staging, scratch, configuration, and device.
    context: &'fit Context,
    /// The node-row domain the adjacency spans.
    rows: usize,
}

impl<'fit> AdjacencyDerivation<'fit> {
    /// Binds the stage to the generation whose endpoint column it derives from.
    pub(super) const fn new(context: &'fit Context, rows: usize) -> Self {
        Self { context, rows }
    }

    /// Derives the incident-edge adjacency from the staged endpoint column and stages it.
    ///
    /// Returns the owned adjacency beside its typed binding, so the level-of-detail stage reads
    /// degrees from the value this call built rather than from the staged bytes.
    ///
    /// # Errors
    ///
    /// Returns [`AdjacencyError::OpenEndpoints`] when the staged endpoint column does not map,
    /// and [`AdjacencyError::Write`] when the staged adjacency does not write.
    #[tracing::instrument(name = "adjacency-derivation", skip_all)]
    pub(super) fn run(self) -> Result<Staged<Adjacency, artifact::Adjacency, ()>, AdjacencyError> {
        let endpoints =
            ArrayFile::open(self.context.staging.path_of(&artifact::EdgeEndpoints::NAME))
                .map_err(AdjacencyError::OpenEndpoints)?;
        let pairs = endpoints
            .u64_le_pairs()
            .expect("the endpoint column was sealed as little-endian u64 pairs");
        // A row id is its little-endian encoding: the transmute relabels equal layouts, element
        // by element.
        let endpoints: &[[NodeRowId; 2]] = zerocopy::transmute_ref!(pairs);

        let adjacency = Adjacency::build(self.rows, endpoints);
        let binding = self
            .context
            .staging
            .stage(artifact::Adjacency, &adjacency)?;
        tracing::info!("staged the incident-edge adjacency");

        Ok(Staged {
            value: adjacency,
            binding,
            evidence: (),
        })
    }
}

/// The relation stage, bound to the spooled readings and the resolved policy table.
pub(super) struct RelationAssembly<'fit> {
    /// The stage's staging, scratch, configuration, and device.
    context: &'fit Context,
    /// The node-row domain the protection matrix spans.
    rows: usize,
    /// The corpus-to-distinct row quotient.
    quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
    /// The certified policy table, covering exactly the relation universe the readings carry.
    policies: &'fit CertifiedPolicies,
    /// The spooled `(edge, relation)` readings, one per pair.
    spool: &'fit InstanceSpool,
    /// The edge multiplicity histogram, a drain fact joining the build measurements.
    multi_typed: &'fit [u64],
}

impl<'fit> RelationAssembly<'fit> {
    /// Binds the stage to the values it assembles from.
    pub(super) const fn new(
        context: &'fit Context,
        rows: usize,
        quotient: &'fit Quotient<'fit, PROJECTOR_DIMENSIONS>,
        policies: &'fit CertifiedPolicies,
        spool: &'fit InstanceSpool,
        multi_typed: &'fit [u64],
    ) -> Self {
        Self {
            context,
            rows,
            quotient,
            policies,
            spool,
            multi_typed,
        }
    }

    /// Assembles the spooled relation instances against the resolved policy table.
    ///
    /// Builds the corpus-domain relation indexes and stages their published artifacts, keeping
    /// their measurements, so the edge-scale corpus pair is spent inside this stage. It then
    /// rebuilds the pair over the distinct row domain for the placement stage: endpoints
    /// quotient-mapped, duplicate readings collapsed, degrees and protection evidence re-derived
    /// by the same build over the collapsed set. The trainer's indexes return owned.
    ///
    /// # Errors
    ///
    /// Returns [`RelationError::Build`] when either index build rejects the instances, and an
    /// I/O error when the instance spool does not map or a staged artifact does not write.
    #[tracing::instrument(name = "relation-assembly", skip_all)]
    pub(super) fn run(
        self,
    ) -> Result<(RelationArtifacts, RelationIndexes<DistinctRowId, EdgeRowId>), RelationError> {
        let policies = Policies::from(self.policies);

        let mapped = self.spool.map()?;
        // The spool maps read-only encoded records and the index build sorts its instance slice
        // in place, so the readings decode into owned storage once; the mapping unmaps before
        // the sorts run.
        let mut instances: Vec<_> = mapped
            .records()
            .iter()
            .map(InstanceRecord::instance)
            .collect();
        drop(mapped);

        let mut corpus = RelationIndexes::build(
            self.rows,
            policies,
            &mut instances,
            self.context.config.attraction,
        )?;

        let mut collapsed = self.quotient.collapse_instances(&instances);
        drop(instances);
        let trainer = RelationIndexes::build(
            self.quotient.distinct_len(),
            policies,
            &mut collapsed,
            self.context.config.attraction,
        )?;
        drop(collapsed);

        // The histogram and the clamp count are drain facts the build
        // cannot see; they join the build measurements here on their way
        // to the manifest.
        corpus.measurements.multi_typed_edges = self.multi_typed.to_vec();

        let attraction = self
            .context
            .staging
            .stage_with(artifact::Attraction, |writer| {
                corpus.attraction.write_into(self.rows as u64, writer)
            })?;
        let protection = self
            .context
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
}

/// The relation stage's published artifacts, pairing the staged corpus bindings with their
/// measurements.
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
