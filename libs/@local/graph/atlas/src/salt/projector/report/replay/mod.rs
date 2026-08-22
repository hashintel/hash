//! Replays past arrivals to measure how the deployed publish path serves rows the fit never saw.
//!
//! Every fitted row's quality reading is an in-sample reading, because the fit trains on every
//! byte-distinct representation and the quality probe samples the generation it evaluates. The
//! consumer, though, receives arrivals: rows a later store snapshot holds that the fitted
//! generation never saw, projected online through the fitted generation's own publish path. This
//! report replays that deployment retrospectively over two published generations. The arrivals of
//! the later generation `G1` project through `G0`'s certified publish path, and each projected
//! neighbourhood is read against the representation-space truth, beside the counterfactual
//! reading the arrival's own `G1` fit produced and beside fitted controls that share every
//! normalizer.
//!
//! # Populations and estimands
//!
//! The report joins node rows by entity identity and partitions them before sampling: arrivals
//! (present in `G1`, absent from `G0`), stable comparison rows (present in both with byte-equal
//! projector representations), and revised fitted rows (present in both with differing bytes).
//! Revised rows are counted and excluded, because serving never projects revised bytes. A
//! post-fit edition keeps its fitted coordinate until a refit, so an arrival label on such a row
//! would read the wrong mechanism. Arrivals split further by whether their representation bytes
//! already occur anywhere in `G0` - only a novel representation tests generalization beyond an
//! input the model has already seen. An empty arrival population is a refusal, never a perfect
//! result.
//!
//! An entity estimand and a class estimand ride every reading. The entity estimand samples rows, so
//! a duplicated representation weighs by its multiplicity: the consumer-facing view, where a
//! heavily duplicated entity really does dominate what serving shows. The class estimand forms
//! byte-exact representation classes over the full eligible populations first and samples
//! classes with equal weight, each read at its deterministic representative (the class's lowest
//! later row), so multiplicity buys a class neither inclusion odds nor query weight. A
//! deduplication diagnostic beside them restricts the entity draw's own universe to one member
//! per class, isolating how much duplication inside that draw moved the entity readings.
//!
//! # Orderings and readings
//!
//! A fixed sample of stable rows supplies one comparison universe per estimand for every query
//! and every map. Per sampled query, the reference ordering ranks that universe by
//! representation distance (the k-NN table's own cosine metric), the deployed ordering by wire
//! distance from the query projected through `G0` against the universe's `G0` wire coordinates,
//! and the refit ordering by wire distance from the query's fitted `G1` coordinate against the
//! universe's `G1` wire coordinates. Wire coordinates cover the complete publish transform,
//! which the canonical row-order coordinates the quality runner reads do not. Every ordering
//! breaks distance ties by ascending universe position, one total order across all spaces.
//! Readings are the quality suite's own rank kernels ([`NeighbourhoodAggregate`]) at each
//! requested neighbourhood size. Fitted controls - stable rows disjoint from their estimand's
//! universe - read under `G0`'s own wire frame and share the query readings' normalizer.
//!
//! # The boundary
//!
//! [`ArrivalReplay::new`] refuses before it reads: the pair must carry projector placements
//! under one embedding contract and one fit configuration, and every bound artifact must hash
//! to what its metadata document records. The axes, populations, and requested sizes must be
//! able to carry the experiment. Everything below the artifact extraction - every data refusal,
//! the partition, the class formation, the sampling, the incident scan - runs identically on
//! extracted and on fabricated columns. [`ArrivalReplay::report`] then drives one
//! [`PublishPath`](path::PublishPath),
//! the trait standing where `G0`'s reopened publish path stands in production. The production
//! adapter binds the real path and its construction-time certificate.
//!
//! [`NeighbourhoodAggregate`]: crate::salt::quality::metric::NeighbourhoodAggregate

use hashql_core::id::{IdSlice, IdVec};
use type_system::knowledge::entity::EntityId;

use self::{
    design::{NeighbourhoodDesign, ReplayInputs, ReplaySizes},
    draw::{DedupPosition, DrawSizes, DrawnSamples, UniversePosition},
    error::ReplayError,
    extract::{EndpointArtifact, GenerationArtifacts, GenerationColumns},
    plan::{ClassControlState, ClassQueryState, EstimandData, ProjectionPlan, QueryState},
    population::{
        ArrivalClass, ArrivalClassIndex, IncidentStats, Novelty, Populations, StableClass,
        StableClassIndex,
    },
    preflight::VerifiedPair,
    report::{IncidentEdgeSummary, PopulationCounts, RequestedDesign},
};
use crate::{
    dataset::TemporalAxes,
    file::generation::GenerationId,
    identity::{EdgeRowId, NodeRowId},
};

mod assemble;
pub(crate) mod design;
mod draw;
pub(crate) mod error;
mod extract;
mod metric;
pub(crate) mod path;
mod plan;
pub(crate) mod population;
mod preflight;
pub(crate) mod report;
#[cfg(test)]
mod tests;

/// One value per generation of the replayed pair, named by its temporal side.
///
/// Every earlier/later duo travels through this carrier, so two same-typed values cannot swap
/// silently at a call boundary.
pub(super) struct Pair<T> {
    /// The value on the earlier, deployed side `G0`.
    pub earlier: T,
    /// The value on the later, arrival side `G1`.
    pub later: T,
}

/// The byte-exact representation classes of both populations.
struct ClassLists {
    /// The stable population's classes, ascending by representative row.
    stable: IdVec<StableClassIndex, StableClass>,
    /// The arrival population's classes, ascending by representative row.
    arrival: IdVec<ArrivalClassIndex, ArrivalClass>,
}

impl ClassLists {
    /// Forms both populations' classes over the later generation's representations.
    fn new(populations: &Populations, later: &GenerationColumns<'_>) -> Self {
        Self {
            stable: populations.stable_classes(later.representations()),
            arrival: populations.arrival_classes(later.representations()),
        }
    }
}

/// The shared projection plan with both estimands' sampled states.
struct SampledStates {
    /// The distinct rows both estimands project, each once.
    plan: ProjectionPlan,
    /// Sampled arrivals, ascending by later row.
    queries: Vec<QueryState>,
    /// Sampled arrival classes, ascending by representative row.
    class_queries: Vec<ClassQueryState>,
}

impl SampledStates {
    /// Plans the shared projection and builds both estimands' sampled states.
    fn new(
        later: &GenerationColumns<'_>,
        edges: &IdSlice<EdgeRowId, [NodeRowId; 2]>,
        populations: &Populations,
        classes: &ClassLists,
        samples: &DrawnSamples,
    ) -> Self {
        let plan = ProjectionPlan::new(
            samples
                .query_draw
                .iter()
                .map(|&draw| populations.arrivals[draw].later_row),
            samples
                .class_query_draw
                .iter()
                .map(|&draw| classes.arrival[draw].representative_row),
            later.representations(),
        );
        let incident = IncidentStats::of_rows(
            plan.rows().iter().copied(),
            edges,
            &populations.stable,
            later.ids().len(),
        );

        let queries = QueryState::sampled(
            &samples.query_draw,
            &populations.arrivals,
            later,
            &incident,
            &plan,
        )
        .into_iter()
        .collect();
        let class_queries = ClassQueryState::sampled(
            &samples.class_query_draw,
            &classes.arrival,
            later,
            &incident,
            &plan,
        )
        .into_iter()
        .collect();

        Self {
            plan,
            queries,
            class_queries,
        }
    }
}

impl PopulationCounts {
    /// Counts the populations, their class structure, and every drawn sample.
    fn census(
        populations: &Populations,
        classes: &ClassLists,
        samples: &DrawnSamples,
        states: &SampledStates,
        deduplicated_comparisons: usize,
    ) -> Self {
        let seen_queries = |novelty: &Novelty| *novelty == Novelty::Seen;
        let sampled_queries_seen = states
            .queries
            .iter()
            .filter(|query| seen_queries(&query.novelty))
            .count();
        let sampled_class_queries_seen = states
            .class_queries
            .iter()
            .filter(|query| seen_queries(&query.novelty))
            .count();
        let arrival_classes_seen = classes
            .arrival
            .iter()
            .filter(|class| seen_queries(&class.novelty))
            .count();

        Self {
            arrivals_seen: populations.arrivals_seen,
            arrivals_novel: populations.arrivals.len() - populations.arrivals_seen,
            arrival_classes_seen,
            arrival_classes_novel: classes.arrival.len() - arrival_classes_seen,
            stable: populations.stable.len(),
            stable_classes: classes.stable.len(),
            revised: populations.revised,
            sampled_queries_seen,
            sampled_queries_novel: states.queries.len() - sampled_queries_seen,
            sampled_class_queries_seen,
            sampled_class_queries_novel: states.class_queries.len() - sampled_class_queries_seen,
            sampled_comparisons: samples.universe.len(),
            sampled_class_comparisons: samples.class_universe.len(),
            deduplicated_comparisons,
            sampled_controls: samples.control_pairs.len(),
            sampled_class_controls: samples.class_controls.len(),
        }
    }
}

/// One replay, extracted and validated, ready to drive a publish path.
///
/// Construction copies everything the run reads, from sampled embeddings and wire coordinates to
/// populations and designs, so the source generations' mappings are released before the run
/// starts and the run itself touches no artifact.
pub(crate) struct ArrivalReplay {
    /// The pair's identities.
    generation: Pair<GenerationId>,
    /// The pair's recorded snapshot axes.
    axes: Pair<TemporalAxes>,
    seed: u64,
    requested: RequestedDesign,
    populations: PopulationCounts,
    designs: Vec<NeighbourhoodDesign>,
    /// The distinct rows both estimands project, each once.
    plan: ProjectionPlan,
    /// Sampled arrivals, ascending by later row.
    queries: Vec<QueryState>,
    /// The entity estimand's universe and controls, ascending by later row.
    entity: EstimandData,
    /// Universe positions of the deduplication diagnostic's representatives, ascending.
    dedup: IdVec<DedupPosition, UniversePosition>,
    /// The entity controls' identities, in control order.
    control_entities: Vec<EntityId>,
    /// Sampled arrival classes, ascending by representative row.
    class_queries: Vec<ClassQueryState>,
    /// The class estimand's universe and controls, ascending by representative row.
    class: EstimandData,
    /// The class controls' identities and member counts, in control order.
    class_controls: Vec<ClassControlState>,
}

impl ArrivalReplay {
    /// Extracts and validates one replay from two published generations.
    ///
    /// Checks the pair's contracts and every bound artifact's digest first, then opens each
    /// generation's identity, representation, row-position, and wire-coordinate artifacts plus
    /// the later generation's edge endpoints. The joined rows are partitioned and the
    /// byte-exact classes formed over the full populations. Every sample draws under the seed,
    /// and construction copies what the run reads, so the returned value holds no artifact
    /// mapping.
    ///
    /// # Errors
    ///
    /// Returns the [`ReplayError`] naming the first refusal in construction order. Each
    /// variant's own doc states its condition.
    pub(crate) fn new(
        ReplayInputs {
            earlier,
            later,
            seed,
            sizes,
        }: ReplayInputs<'_>,
    ) -> Result<Self, ReplayError> {
        let pair = VerifiedPair::new(Pair { earlier, later })?;

        let artifacts = Pair {
            earlier: GenerationArtifacts::open(pair.earlier())?,
            later: GenerationArtifacts::open(pair.later())?,
        };
        let wire = Pair {
            earlier: artifacts.earlier.wire_of_row(pair.earlier())?,
            later: artifacts.later.wire_of_row(pair.later())?,
        };
        let later_edges = EndpointArtifact::open(pair.later())?;

        let columns = Pair {
            earlier: artifacts.earlier.columns(pair.earlier(), &wire.earlier)?,
            later: artifacts.later.columns(pair.later(), &wire.later)?,
        };

        Self::from_columns(
            &columns,
            later_edges.pairs(pair.later().id())?,
            seed,
            &sizes,
        )
    }

    /// The data-level constructor below the artifact extraction.
    ///
    /// Validation, partition, class formation, sampling, and copying all run here, identically
    /// on extracted and on fabricated columns.
    fn from_columns(
        columns: &Pair<GenerationColumns<'_>>,
        edges: &IdSlice<EdgeRowId, [NodeRowId; 2]>,
        seed: u64,
        sizes: &ReplaySizes,
    ) -> Result<Self, ReplayError> {
        let axes = columns.validated_order()?;

        if sizes.neighbourhoods.is_empty() {
            return Err(ReplayError::NoNeighbourhoods);
        }
        if u32::try_from(sizes.comparisons.get()).is_err() {
            return Err(ReplayError::UniverseBeyondRankDomain {
                comparisons: sizes.comparisons.get(),
            });
        }

        let populations = Populations::new(columns);
        if populations.arrivals.is_empty() {
            return Err(ReplayError::EmptyArrivals);
        }

        let classes = ClassLists::new(&populations, &columns.later);

        let samples = DrawnSamples::new(
            seed,
            &populations,
            &classes.stable,
            &classes.arrival,
            &DrawSizes {
                queries: sizes.queries.get(),
                comparisons: sizes.comparisons.get(),
                controls: sizes.controls.get(),
            },
        )?;

        let dedup: IdVec<DedupPosition, UniversePosition> = samples
            .dedup_representatives(columns.later.representations())
            .into_iter()
            .collect();
        let designs = NeighbourhoodDesign::validated(sizes, &samples, dedup.len())
            .into_iter()
            .try_collect()?;
        let states = SampledStates::new(&columns.later, edges, &populations, &classes, &samples);

        let wire = Pair {
            earlier: columns.earlier.wire_of_row(),
            later: columns.later.wire_of_row(),
        };

        Ok(Self {
            generation: Pair {
                earlier: columns.earlier.id(),
                later: columns.later.id(),
            },
            axes,
            seed,
            requested: RequestedDesign {
                queries: sizes.queries,
                comparisons: sizes.comparisons,
                controls: sizes.controls,
                neighbourhoods: sizes.neighbourhoods.to_vec(),
                horizon_factor: sizes.horizon_factor,
            },
            populations: PopulationCounts::census(
                &populations,
                &classes,
                &samples,
                &states,
                dedup.len(),
            ),
            designs,
            plan: states.plan,
            queries: states.queries,
            entity: EstimandData::gathered(
                samples.universe.iter().copied(),
                samples.control_pairs.iter().copied(),
                &wire,
                columns.later.representations(),
            ),
            dedup,
            control_entities: samples
                .control_pairs
                .iter()
                .map(|pair| columns.later.ids()[pair.later_row].into())
                .collect(),
            class_queries: states.class_queries,
            class: EstimandData::gathered(
                samples
                    .class_universe
                    .iter()
                    .map(|class| class.representative),
                samples
                    .class_controls
                    .iter()
                    .map(|class| class.representative),
                &wire,
                columns.later.representations(),
            ),
            class_controls: samples
                .class_controls
                .iter()
                .map(|class| ClassControlState {
                    entity: columns.later.ids()[class.representative.later_row].into(),
                    members: class.members,
                })
                .collect(),
        })
    }

    /// The incident-edge diagnostics, summed over the entity estimand's sampled queries.
    pub(super) fn incident_summary(&self) -> IncidentEdgeSummary {
        IncidentEdgeSummary {
            queries_with_stable_edge: self
                .queries
                .iter()
                .filter(|query| query.incident.stable_incident > 0)
                .count(),
            total_incident: self.queries.iter().map(|query| query.incident.degree).sum(),
            total_into_stable: self
                .queries
                .iter()
                .map(|query| query.incident.stable_incident)
                .sum(),
        }
    }
}

impl core::fmt::Debug for ArrivalReplay {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.debug_struct("ArrivalReplay")
            .field("earlier", &self.generation.earlier)
            .field("later", &self.generation.later)
            .field("seed", &self.seed)
            .field("populations", &self.populations)
            .finish_non_exhaustive()
    }
}
