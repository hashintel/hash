//! The refusals that stop a replay before it reads anything.

use core::{error::Error, fmt, num::NonZero};
use std::io;

use crate::{
    file::{
        array::OpenArrayError, generation::GenerationId, identity::read::OpenIdentityError,
        repository::FileName, salt::metadata::Placement,
    },
    integrity::Sha256Digest,
    salt::fit::prepare::identity::InvalidIdentityFile,
};

/// The refusals that stop a replay before it reads anything.
#[derive(Debug)]
pub(crate) enum ReplayError {
    /// A generation's coordinates were not placed by the trained projector.
    ///
    /// A landmark-baseline generation publishes coordinates the projector never produced, so a
    /// replay over it would attribute the baseline's behaviour to the projector.
    NotProjectorPlaced {
        /// The generation whose placement disqualifies it.
        generation: GenerationId,
        /// What actually placed the generation's coordinates.
        placement: Placement,
    },
    /// The generations record different embedding contracts.
    ///
    /// Representations produced under different contracts are not one input space, so a
    /// cross-generation distance would compare incommensurable coordinates.
    EmbedderMismatch {
        /// The generation named as earlier.
        earlier: GenerationId,
        /// The generation named as later.
        later: GenerationId,
    },
    /// The generations record different fit configurations.
    ///
    /// A configuration difference, the seed included, enters the gap between the fits and would
    /// be read as arrival behaviour.
    ConfigMismatch {
        /// The generation named as earlier.
        earlier: GenerationId,
        /// The generation named as later.
        later: GenerationId,
    },
    /// A bound artifact's bytes do not hash to the digest its metadata document records.
    ArtifactIntegrity {
        /// The generation whose artifact fails verification.
        generation: GenerationId,
        /// The artifact's role, by its pinned file name.
        role: FileName,
        /// The digest the metadata document records.
        expected: Sha256Digest,
        /// What the file's bytes actually hash to.
        observed: Sha256Digest,
    },
    /// A bound artifact failed to read during integrity verification.
    ReadArtifact {
        /// The generation whose artifact failed to read.
        generation: GenerationId,
        /// The artifact's role, by its pinned file name.
        role: FileName,
        /// The read failure.
        source: io::Error,
    },
    /// A generation records no temporal axes, so no transaction-time order can hold.
    UnrecordedTemporalAxes {
        /// The generation without recorded axes.
        generation: GenerationId,
    },
    /// The named earlier generation does not strictly precede the later in transaction time.
    OrderViolation {
        /// The generation named as earlier.
        earlier: GenerationId,
        /// The generation named as later.
        later: GenerationId,
    },
    /// A generation's identity artifact failed to open.
    OpenIdentities {
        /// The generation whose artifact failed.
        generation: GenerationId,
        /// The open failure.
        source: OpenIdentityError,
    },
    /// A generation's identity artifact does not hold the node-identity layout.
    InvalidIdentities {
        /// The generation whose artifact failed.
        generation: GenerationId,
        /// The layout failure.
        source: InvalidIdentityFile,
    },
    /// A generation's representation matrix failed to open.
    OpenRepresentations {
        /// The generation whose artifact failed.
        generation: GenerationId,
        /// The open failure.
        source: OpenArrayError,
    },
    /// A generation's representation matrix does not read as projector-width rows.
    InvalidRepresentations {
        /// The generation whose artifact failed.
        generation: GenerationId,
    },
    /// A generation's row-position column failed to open.
    OpenPositions {
        /// The generation whose artifact failed.
        generation: GenerationId,
        /// The open failure.
        source: OpenArrayError,
    },
    /// A generation's row-position column does not read as one base position per node row.
    InvalidPositions {
        /// The generation whose artifact failed.
        generation: GenerationId,
    },
    /// A generation's wire-coordinate column failed to open.
    OpenWireCoordinates {
        /// The generation whose artifact failed.
        generation: GenerationId,
        /// The open failure.
        source: OpenArrayError,
    },
    /// A generation's wire-coordinate column does not read as one point per base position.
    InvalidWireCoordinates {
        /// The generation whose artifact failed.
        generation: GenerationId,
    },
    /// The later generation's edge-endpoint column failed to open.
    OpenEndpoints {
        /// The generation whose artifact failed.
        generation: GenerationId,
        /// The open failure.
        source: OpenArrayError,
    },
    /// The later generation's edge-endpoint column does not read as endpoint pairs.
    InvalidEndpoints {
        /// The generation whose artifact failed.
        generation: GenerationId,
    },
    /// A generation's columns do not describe one corpus.
    Rows {
        /// The generation whose columns disagree.
        generation: GenerationId,
        /// The identity column's row count.
        identities: usize,
        /// The representation matrix's row count.
        representations: usize,
        /// The per-row wire coordinate count.
        wire: usize,
    },
    /// The requested design names no neighbourhood size.
    NoNeighbourhoods,
    /// The requested comparison universe exceeds the rank kernels' index domain.
    UniverseBeyondRankDomain {
        /// The requested comparison sample.
        comparisons: usize,
    },
    /// The later generation contains no arrival.
    ///
    /// A pair without arrivals cannot exercise the deployed path. The refusal keeps a vacuous run
    /// from reading as a perfect one.
    EmptyArrivals,
    /// The stable population cannot host the disjoint comparison and control samples.
    InsufficientStableRows {
        /// The stable population's size.
        stable: usize,
        /// The requested comparison sample.
        comparisons: usize,
        /// The requested control sample.
        controls: usize,
    },
    /// The stable representation classes cannot host the disjoint comparison and control samples.
    InsufficientStableClasses {
        /// The stable population's byte-exact representation-class count.
        classes: usize,
        /// The requested comparison sample.
        comparisons: usize,
        /// The requested control sample.
        controls: usize,
    },
    /// A comparison universe cannot support a requested neighbourhood size.
    ///
    /// The rank kernels demand `k ≤ universe / 2`. The named universe is the sampled comparison
    /// universe or the deduplicated diagnostic universe within it, whichever failed.
    NeighbourhoodDesign {
        /// The unsupportable neighbourhood size.
        neighbourhood: NonZero<usize>,
        /// The universe that cannot support it.
        universe: usize,
    },
    /// A design's observation load exceeds the rank kernels' integer carriers.
    ///
    /// The worst-case rank penalties over this many observations would overflow the metric
    /// aggregate's accumulation or readback arithmetic, so construction refuses the design
    /// before anything accumulates.
    AggregateCapacityExceeded {
        /// The comparison universe whose worst-case penalties overflow.
        universe: usize,
        /// The neighbourhood size read at.
        neighbourhood: NonZero<usize>,
        /// The observations entering one aggregate.
        observations: usize,
    },
}

/// The kebab-case name of a placement, as the metadata document serializes it.
const fn placement_name(placement: Placement) -> &'static str {
    match placement {
        Placement::LandmarkBaseline => "landmark-baseline",
        Placement::Projector => "projector",
    }
}

impl ReplayError {
    /// The description of a contract, integrity, or ordering refusal.
    ///
    /// Returns [`None`] for the other families.
    fn contract_description(&self, fmt: &mut fmt::Formatter<'_>) -> Option<fmt::Result> {
        match self {
            Self::NotProjectorPlaced {
                generation,
                placement,
            } => Some(write!(
                fmt,
                "generation {generation} publishes {} coordinates, not projector placements",
                placement_name(*placement),
            )),
            Self::EmbedderMismatch { earlier, later } => Some(write!(
                fmt,
                "generations {earlier} and {later} record different embedding contracts",
            )),
            Self::ConfigMismatch { earlier, later } => Some(write!(
                fmt,
                "generations {earlier} and {later} record different fit configurations",
            )),
            Self::ArtifactIntegrity {
                generation,
                role,
                expected,
                observed,
            } => Some(write!(
                fmt,
                "the {role} artifact of generation {generation} hashes to {observed}, not the \
                 recorded {expected}",
            )),
            Self::ReadArtifact {
                generation, role, ..
            } => Some(write!(
                fmt,
                "the {role} artifact of generation {generation} failed to read during integrity \
                 verification",
            )),
            Self::UnrecordedTemporalAxes { generation } => Some(write!(
                fmt,
                "generation {generation} records no temporal axes"
            )),
            Self::OrderViolation { earlier, later } => Some(write!(
                fmt,
                "generation {earlier} does not precede generation {later} in transaction time",
            )),
            Self::OpenIdentities { .. }
            | Self::InvalidIdentities { .. }
            | Self::OpenRepresentations { .. }
            | Self::InvalidRepresentations { .. }
            | Self::OpenPositions { .. }
            | Self::InvalidPositions { .. }
            | Self::OpenWireCoordinates { .. }
            | Self::InvalidWireCoordinates { .. }
            | Self::OpenEndpoints { .. }
            | Self::InvalidEndpoints { .. }
            | Self::Rows { .. }
            | Self::NoNeighbourhoods
            | Self::UniverseBeyondRankDomain { .. }
            | Self::EmptyArrivals
            | Self::InsufficientStableRows { .. }
            | Self::InsufficientStableClasses { .. }
            | Self::NeighbourhoodDesign { .. }
            | Self::AggregateCapacityExceeded { .. } => None,
        }
    }

    /// The description of an artifact open or layout refusal.
    ///
    /// Returns [`None`] for the other families.
    fn artifact_description(&self, fmt: &mut fmt::Formatter<'_>) -> Option<fmt::Result> {
        match self {
            Self::OpenIdentities { generation, .. } => Some(write!(
                fmt,
                "the node identities of generation {generation} failed to open",
            )),
            Self::InvalidIdentities { generation, .. } => Some(write!(
                fmt,
                "the node identities of generation {generation} do not hold the identity layout",
            )),
            Self::OpenRepresentations { generation, .. } => Some(write!(
                fmt,
                "the representation matrix of generation {generation} failed to open",
            )),
            Self::InvalidRepresentations { generation } => Some(write!(
                fmt,
                "the representation matrix of generation {generation} does not read as \
                 projector-width rows",
            )),
            Self::OpenPositions { generation, .. } => Some(write!(
                fmt,
                "the row-position column of generation {generation} failed to open",
            )),
            Self::InvalidPositions { generation } => Some(write!(
                fmt,
                "the row-position column of generation {generation} does not read as one base \
                 position per node row",
            )),
            Self::OpenWireCoordinates { generation, .. } => Some(write!(
                fmt,
                "the wire coordinates of generation {generation} failed to open",
            )),
            Self::InvalidWireCoordinates { generation } => Some(write!(
                fmt,
                "the wire coordinates of generation {generation} do not read as one point per \
                 base position",
            )),
            Self::OpenEndpoints { generation, .. } => Some(write!(
                fmt,
                "the edge endpoints of generation {generation} failed to open",
            )),
            Self::InvalidEndpoints { generation } => Some(write!(
                fmt,
                "the edge endpoints of generation {generation} do not read as endpoint pairs",
            )),
            Self::NotProjectorPlaced { .. }
            | Self::EmbedderMismatch { .. }
            | Self::ConfigMismatch { .. }
            | Self::ArtifactIntegrity { .. }
            | Self::ReadArtifact { .. }
            | Self::UnrecordedTemporalAxes { .. }
            | Self::OrderViolation { .. }
            | Self::Rows { .. }
            | Self::NoNeighbourhoods
            | Self::UniverseBeyondRankDomain { .. }
            | Self::EmptyArrivals
            | Self::InsufficientStableRows { .. }
            | Self::InsufficientStableClasses { .. }
            | Self::NeighbourhoodDesign { .. }
            | Self::AggregateCapacityExceeded { .. } => None,
        }
    }

    /// The description of a corpus or design refusal, or [`None`] for the other families.
    fn design_description(&self, fmt: &mut fmt::Formatter<'_>) -> Option<fmt::Result> {
        match self {
            Self::Rows {
                generation,
                identities,
                representations,
                wire,
            } => Some(write!(
                fmt,
                "the columns of generation {generation} do not describe one corpus: {identities} \
                 identities, {representations} representation rows, {wire} wire coordinates",
            )),
            Self::NoNeighbourhoods => {
                Some(fmt.write_str("the requested design names no neighbourhood size"))
            }
            Self::UniverseBeyondRankDomain { comparisons } => Some(write!(
                fmt,
                "a comparison universe of {comparisons} rows exceeds the rank kernels' index \
                 domain",
            )),
            Self::EmptyArrivals => Some(fmt.write_str(
                "the later generation contains no arrival, so no run can exercise the deployed \
                 path",
            )),
            Self::InsufficientStableRows {
                stable,
                comparisons,
                controls,
            } => Some(write!(
                fmt,
                "the stable population of {stable} rows cannot host {comparisons} comparison and \
                 {controls} control rows disjointly",
            )),
            Self::InsufficientStableClasses {
                classes,
                comparisons,
                controls,
            } => Some(write!(
                fmt,
                "the stable population's {classes} representation classes cannot host \
                 {comparisons} comparison and {controls} control classes disjointly",
            )),
            Self::NeighbourhoodDesign {
                neighbourhood,
                universe,
            } => Some(write!(
                fmt,
                "a universe of {universe} rows cannot support neighbourhood size {neighbourhood}",
            )),
            Self::AggregateCapacityExceeded {
                universe,
                neighbourhood,
                observations,
            } => Some(write!(
                fmt,
                "the worst-case rank penalties of {observations} observations over a universe of \
                 {universe} rows at neighbourhood size {neighbourhood} exceed the aggregate's \
                 integer carriers",
            )),
            Self::NotProjectorPlaced { .. }
            | Self::EmbedderMismatch { .. }
            | Self::ConfigMismatch { .. }
            | Self::ArtifactIntegrity { .. }
            | Self::ReadArtifact { .. }
            | Self::UnrecordedTemporalAxes { .. }
            | Self::OrderViolation { .. }
            | Self::OpenIdentities { .. }
            | Self::InvalidIdentities { .. }
            | Self::OpenRepresentations { .. }
            | Self::InvalidRepresentations { .. }
            | Self::OpenPositions { .. }
            | Self::InvalidPositions { .. }
            | Self::OpenWireCoordinates { .. }
            | Self::InvalidWireCoordinates { .. }
            | Self::OpenEndpoints { .. }
            | Self::InvalidEndpoints { .. } => None,
        }
    }
}

impl fmt::Display for ReplayError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.contract_description(fmt)
            .or_else(|| self.artifact_description(fmt))
            .or_else(|| self.design_description(fmt))
            .expect("every refusal describes itself in exactly one family")
    }
}

impl Error for ReplayError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::ReadArtifact { source, .. } => Some(source),
            Self::OpenIdentities { source, .. } => Some(source),
            Self::InvalidIdentities { source, .. } => Some(source),
            Self::OpenRepresentations { source, .. }
            | Self::OpenPositions { source, .. }
            | Self::OpenWireCoordinates { source, .. }
            | Self::OpenEndpoints { source, .. } => Some(source),
            Self::NotProjectorPlaced { .. }
            | Self::EmbedderMismatch { .. }
            | Self::ConfigMismatch { .. }
            | Self::ArtifactIntegrity { .. }
            | Self::UnrecordedTemporalAxes { .. }
            | Self::OrderViolation { .. }
            | Self::InvalidRepresentations { .. }
            | Self::InvalidPositions { .. }
            | Self::InvalidWireCoordinates { .. }
            | Self::InvalidEndpoints { .. }
            | Self::Rows { .. }
            | Self::NoNeighbourhoods
            | Self::UniverseBeyondRankDomain { .. }
            | Self::EmptyArrivals
            | Self::InsufficientStableRows { .. }
            | Self::InsufficientStableClasses { .. }
            | Self::NeighbourhoodDesign { .. }
            | Self::AggregateCapacityExceeded { .. } => None,
        }
    }
}
