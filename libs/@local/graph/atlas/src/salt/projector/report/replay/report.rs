//! The replay's serialized evidence record.

use core::num::NonZero;

use type_system::knowledge::entity::EntityId;

use super::population::Novelty;
use crate::{
    dataset::TemporalAxes,
    file::generation::GenerationId,
    math::{DFinite, UnitFraction},
    salt::quality::metric::NeighbourhoodAggregate,
};

/// One sampled query's projection outcome, as the report records it.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PlacementOutcome {
    /// The published projector placed the arrival onto the wire.
    Placed,
    /// The projection fell outside the fitted world frame.
    OutOfFrame,
    /// The projection produced a non-finite coordinate.
    NonFinite,
}

/// One ordering pair's rank readings.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ReadingRow {
    /// Mean fraction of shared neighbourhoods, in `[0, 1]`.
    pub recall: UnitFraction,
    /// Trustworthiness, in `[0, 1]`.
    pub trustworthiness: UnitFraction,
    /// Continuity, in `[0, 1]`.
    pub continuity: UnitFraction,
    /// Fraction of false neighbours past the horizon, in `[0, 1]`.
    pub intrusion_rate: UnitFraction,
    /// Fraction of banished neighbours past the horizon, in `[0, 1]`.
    pub extrusion_rate: UnitFraction,
}

impl ReadingRow {
    /// Reads one aggregate's readings.
    pub(super) fn read(aggregate: &NeighbourhoodAggregate) -> Self {
        Self {
            recall: aggregate.recall(),
            trustworthiness: aggregate.trustworthiness(),
            continuity: aggregate.continuity(),
            intrusion_rate: aggregate.intrusion_rate(),
            extrusion_rate: aggregate.extrusion_rate(),
        }
    }

    /// The per-metric differences of this reading over `refit`, the deployed reading as minuend.
    pub(super) const fn minus(&self, refit: &Self) -> DifferenceRow {
        DifferenceRow {
            recall: self.recall - refit.recall,
            trustworthiness: self.trustworthiness - refit.trustworthiness,
            continuity: self.continuity - refit.continuity,
            intrusion_rate: self.intrusion_rate - refit.intrusion_rate,
            extrusion_rate: self.extrusion_rate - refit.extrusion_rate,
        }
    }
}

/// One population aggregate's readings with the query count they aggregate over.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct AggregateRow {
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Mean fraction of shared neighbourhoods, in `[0, 1]`.
    pub recall: UnitFraction,
    /// Trustworthiness, in `[0, 1]`.
    pub trustworthiness: UnitFraction,
    /// Continuity, in `[0, 1]`.
    pub continuity: UnitFraction,
    /// Fraction of false neighbours past the horizon, in `[0, 1]`.
    pub intrusion_rate: UnitFraction,
    /// Fraction of banished neighbours past the horizon, in `[0, 1]`.
    pub extrusion_rate: UnitFraction,
}

impl AggregateRow {
    /// Reads one population aggregate, or [`None`] when no query contributed.
    ///
    /// An empty rank aggregate reads each metric's own optimum, which a report must not publish
    /// as evidence. Absence records the unmeasured ground.
    pub(super) fn read(aggregate: &NeighbourhoodAggregate) -> Option<Self> {
        if aggregate.queries() == 0 {
            return None;
        }

        Some(Self {
            queries: aggregate.queries(),
            recall: aggregate.recall(),
            trustworthiness: aggregate.trustworthiness(),
            continuity: aggregate.continuity(),
            intrusion_rate: aggregate.intrusion_rate(),
            extrusion_rate: aggregate.extrusion_rate(),
        })
    }
}

/// One query's deployed-minus-refit reading differences.
///
/// Positive recall, trustworthiness, or continuity says the deployed placement read better than
/// the refit counterfactual. Positive intrusion or extrusion says it read worse.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct DifferenceRow {
    /// Deployed recall minus refit recall.
    pub recall: DFinite,
    /// Deployed trustworthiness minus refit trustworthiness.
    pub trustworthiness: DFinite,
    /// Deployed continuity minus refit continuity.
    pub continuity: DFinite,
    /// Deployed intrusion rate minus refit intrusion rate.
    pub intrusion_rate: DFinite,
    /// Deployed extrusion rate minus refit extrusion rate.
    pub extrusion_rate: DFinite,
}

/// One query's readings at one neighbourhood size.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct QueryReadings {
    /// The neighbourhood size the readings are at.
    pub neighbourhood: NonZero<usize>,
    /// The refit counterfactual's reading, present for every sampled query.
    pub refit: ReadingRow,
    /// The deployed placement's reading, present exactly for placed queries.
    pub deployed: Option<ReadingRow>,
    /// Deployed minus refit, present exactly for placed queries.
    pub difference: Option<DifferenceRow>,
}

/// One sampled arrival's row in the entity estimand.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct QueryRow {
    /// The arrival's entity identity.
    pub entity: EntityId,
    /// Whether the arrival's representation bytes occur in `G0`.
    pub novelty: Novelty,
    /// The projection outcome through the deployed path.
    pub outcome: PlacementOutcome,
    /// Incident edges of the arrival in the later generation.
    pub degree: u64,
    /// Incident edges whose opposite endpoint is a stable row.
    pub stable_incident: u64,
    /// Readings, one per neighbourhood size in reporting order.
    pub readings: Vec<QueryReadings>,
}

/// One sampled arrival class's row in the class estimand.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ClassQueryRow {
    /// The class representative's entity identity.
    pub entity: EntityId,
    /// The class's member count in the full arrival population.
    pub members: usize,
    /// The class's shared novelty.
    pub novelty: Novelty,
    /// The representative's projection outcome through the deployed path.
    pub outcome: PlacementOutcome,
    /// Incident edges of the representative in the later generation.
    pub degree: u64,
    /// Incident edges whose opposite endpoint is a stable row.
    pub stable_incident: u64,
    /// Readings, one per neighbourhood size in reporting order.
    pub readings: Vec<QueryReadings>,
}

/// One fitted control's reading at one neighbourhood size.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ControlReading {
    /// The neighbourhood size the reading is at.
    pub neighbourhood: NonZero<usize>,
    /// The control's reading under `G0`'s own wire frame.
    pub reading: ReadingRow,
}

/// One fitted control's row in the entity estimand's control distribution.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ControlRow {
    /// The control's entity identity.
    pub entity: EntityId,
    /// Readings, one per neighbourhood size in reporting order.
    pub readings: Vec<ControlReading>,
}

/// One fitted control class's row in the class estimand's control distribution.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ClassControlRow {
    /// The class representative's entity identity.
    pub entity: EntityId,
    /// The class's member count in the full stable population.
    pub members: usize,
    /// Readings, one per neighbourhood size in reporting order.
    pub readings: Vec<ControlReading>,
}

/// The mean paired difference over placed queries at one neighbourhood size.
///
/// The mean is over placed queries alone. When out-of-frame or non-finite outcomes correlate
/// with poor neighbourhoods, a placed-only mean reads optimistically. The outcome counts carry
/// the exclusion.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PairedSummary {
    /// Placed queries the mean is over.
    pub queries: usize,
    /// The mean deployed-minus-refit differences.
    pub mean: DifferenceRow,
}

/// One neighbourhood size's population readings for one estimand.
///
/// A reading is absent exactly when no query contributed to it: the deployed rows lose every
/// out-of-frame and non-finite query, and a novelty row loses its whole population when no
/// sampled query carries the novelty. Refit and control rows are always present, because
/// construction refuses empty samples.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct NeighbourhoodBlock {
    /// The neighbourhood size the block reads at.
    pub neighbourhood: NonZero<usize>,
    /// The deployed placements against the representation reference.
    pub deployed: Option<AggregateRow>,
    /// The deployed reading over seen-representation queries alone.
    pub deployed_seen: Option<AggregateRow>,
    /// The deployed reading over novel-representation queries alone.
    pub deployed_novel: Option<AggregateRow>,
    /// The refit counterfactual against the same reference.
    pub refit: Option<AggregateRow>,
    /// The refit reading over seen-representation queries alone.
    pub refit_seen: Option<AggregateRow>,
    /// The refit reading over novel-representation queries alone.
    pub refit_novel: Option<AggregateRow>,
    /// The fitted controls under `G0`'s own wire frame.
    pub controls: Option<AggregateRow>,
    /// The mean paired deployed-minus-refit difference over placed queries.
    pub paired: Option<PairedSummary>,
}

/// One neighbourhood size's diagnostic readings over the entity draw, deduplicated in place.
///
/// The diagnostic restricts the entity estimand's own sampled universe to one member per
/// byte-exact representation class, so it isolates how much duplication inside that very draw
/// moved the entity readings. It estimates no population. The deduplicated universe is smaller
/// than the entity universe, so readings at one `k` sit on a different normalizer than the
/// entity rows beside them. Its membership follows the entity draw.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct DedupBlock {
    /// The neighbourhood size the block reads at.
    pub neighbourhood: NonZero<usize>,
    /// The deployed placements against the deduplicated reference.
    pub deployed: Option<AggregateRow>,
    /// The refit counterfactual against the deduplicated reference.
    pub refit: Option<AggregateRow>,
    /// The fitted controls against the deduplicated reference.
    pub controls: Option<AggregateRow>,
}

/// The design sizes the replay was asked for.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RequestedDesign {
    /// The requested query sample, per estimand.
    pub queries: NonZero<usize>,
    /// The requested comparison universe sample, per estimand.
    pub comparisons: NonZero<usize>,
    /// The requested control sample, per estimand.
    pub controls: NonZero<usize>,
    /// The requested neighbourhood sizes, in reporting order.
    pub neighbourhoods: Vec<NonZero<usize>>,
    /// The requested horizon multiplier.
    pub horizon_factor: NonZero<usize>,
}

/// The partitioned populations, their class structure, and the counts actually sampled.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PopulationCounts {
    /// Arrivals whose representation bytes occur in `G0`.
    pub arrivals_seen: usize,
    /// Arrivals whose representation bytes occur nowhere in `G0`.
    pub arrivals_novel: usize,
    /// Byte-exact representation classes among the seen arrivals.
    pub arrival_classes_seen: usize,
    /// Byte-exact representation classes among the novel arrivals.
    pub arrival_classes_novel: usize,
    /// Identities present in both generations with byte-equal representations.
    pub stable: usize,
    /// Byte-exact representation classes in the full stable population.
    pub stable_classes: usize,
    /// Identities present in both generations with differing representation bytes.
    ///
    /// Counted and excluded: serving keeps their fitted coordinates until a refit.
    pub revised: usize,
    /// Sampled seen-representation queries in the entity estimand.
    pub sampled_queries_seen: usize,
    /// Sampled novel-representation queries in the entity estimand.
    pub sampled_queries_novel: usize,
    /// Sampled seen classes in the class estimand.
    pub sampled_class_queries_seen: usize,
    /// Sampled novel classes in the class estimand.
    pub sampled_class_queries_novel: usize,
    /// Sampled entity comparison universe rows.
    pub sampled_comparisons: usize,
    /// Sampled class comparison universe classes.
    pub sampled_class_comparisons: usize,
    /// Byte-exact representation classes within the sampled entity universe.
    ///
    /// The deduplicated diagnostic's universe size.
    pub deduplicated_comparisons: usize,
    /// Sampled entity controls.
    pub sampled_controls: usize,
    /// Sampled class controls.
    pub sampled_class_controls: usize,
}

/// One estimand's sampled projection outcomes, counted before any conditional metric.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct OutcomeCounts {
    /// Queries the path placed onto the wire.
    pub placed: usize,
    /// Queries projected outside the fitted world frame.
    pub out_of_frame: usize,
    /// Queries whose projection produced a non-finite coordinate.
    pub non_finite: usize,
}

/// The sampled queries' incident-edge diagnostics, summed over the entity estimand.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct IncidentEdgeSummary {
    /// Sampled queries with at least one edge into the stable population.
    pub queries_with_stable_edge: usize,
    /// Incident edges over all sampled queries.
    pub total_incident: u64,
    /// Incident edges whose opposite endpoint is a stable row.
    pub total_into_stable: u64,
}

/// One replay's complete evidence record.
///
/// The report identifies its data and design, from both generations and their temporal axes to
/// the seed and every requested size, so a serialized report re-reads without the configuration
/// that produced it. The entity estimand samples rows, and a duplicated representation weighs
/// by its multiplicity. The class estimand samples byte-exact representation classes with equal
/// weight, read at deterministic representatives. Each estimand answers its own question, and
/// readings at one `k` compare within one estimand before across estimands.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ReplayReport {
    /// The earlier generation `G0`, whose published projector placed the queries.
    pub earlier: GenerationId,
    /// The later generation `G1`, whose arrivals were sampled.
    pub later: GenerationId,
    /// `G0`'s recorded snapshot axes.
    pub earlier_axes: TemporalAxes,
    /// `G1`'s recorded snapshot axes.
    pub later_axes: TemporalAxes,
    /// The sampling seed.
    pub seed: u64,
    /// The requested design sizes.
    pub requested: RequestedDesign,
    /// The partitioned populations, their class structure, and actual sampled counts.
    pub populations: PopulationCounts,
    /// The entity estimand's projection outcomes.
    pub outcomes: OutcomeCounts,
    /// The class estimand's projection outcomes, over the sampled class representatives.
    pub class_outcomes: OutcomeCounts,
    /// Entity-estimand readings, one block per neighbourhood size in reporting order.
    pub neighbourhoods: Vec<NeighbourhoodBlock>,
    /// Class-estimand readings, one block per neighbourhood size in reporting order.
    pub class_neighbourhoods: Vec<NeighbourhoodBlock>,
    /// The deduplication diagnostic over the entity draw, in the same order.
    pub deduplicated: Vec<DedupBlock>,
    /// Per-query rows of the entity estimand, ascending by later-generation row.
    pub queries: Vec<QueryRow>,
    /// Per-class rows of the class estimand, ascending by representative row.
    pub class_queries: Vec<ClassQueryRow>,
    /// Per-control rows of the entity estimand, ascending by later-generation row.
    pub controls: Vec<ControlRow>,
    /// Per-class control rows of the class estimand, ascending by representative row.
    pub class_controls: Vec<ClassControlRow>,
    /// The incident-edge diagnostics, summed over the entity estimand's sampled queries.
    pub incident_edges: IncidentEdgeSummary,
}
