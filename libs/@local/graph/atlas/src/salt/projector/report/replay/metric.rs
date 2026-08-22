//! The rank-metric passes over the sampled universes.

use core::num::NonZero;

use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    Pair,
    design::NeighbourhoodDesign,
    draw::DedupPosition,
    path::ProjectedOutcome,
    population::Novelty,
    report::{
        AggregateRow, ControlReading, DedupBlock, DifferenceRow, NeighbourhoodBlock, PairedSummary,
        QueryReadings, ReadingRow,
    },
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{AlignedVecN, DFinite, DPositive, NonNegative, Vec2},
    salt::quality::metric::{NeighbourhoodAggregate, RankScratch},
};

/// Sorts universe positions nearest-first, distance ties by ascending position.
///
/// The tie order is one total order shared by every space: universe positions ascend with later
/// rows, and deduplicated positions ascend with their representatives.
///
/// The returned row is raw `u32` because it feeds [`RankScratch`] and
/// [`NeighbourhoodAggregate::observe`], whose rank vocabulary is raw, and it never leaves this
/// module. Construction refuses a comparison universe beyond the `u32` rank domain, so the cast
/// is total over admitted universes.
#[expect(
    clippy::cast_possible_truncation,
    reason = "construction refuses a comparison universe beyond the u32 rank domain"
)]
fn order_by(distances: &[NonNegative]) -> Vec<u32> {
    let mut order: Vec<u32> = (0..distances.len() as u32).collect();
    order.sort_unstable_by(|&one, &other| {
        distances[one as usize]
            .cmp(&distances[other as usize])
            .then(one.cmp(&other))
    });
    order
}

/// Observes one query's ordering pair and returns its reading with the observing aggregate.
fn one_query_reading(
    template: &NeighbourhoodAggregate,
    by_reference: &[u32],
    by_map: &[u32],
    scratch: &mut RankScratch,
) -> (ReadingRow, NeighbourhoodAggregate) {
    let mut aggregate = template.clone();
    aggregate.observe(by_reference, by_map, scratch);

    (ReadingRow::read(&aggregate), aggregate)
}

/// The running deployed-minus-refit sums over placed queries.
pub(super) struct PairedAccumulator {
    queries: usize,
    recall: DFinite,
    trustworthiness: DFinite,
    continuity: DFinite,
    intrusion_rate: DFinite,
    extrusion_rate: DFinite,
}

impl PairedAccumulator {
    const fn new() -> Self {
        Self {
            queries: 0,
            recall: DFinite::ZERO,
            trustworthiness: DFinite::ZERO,
            continuity: DFinite::ZERO,
            intrusion_rate: DFinite::ZERO,
            extrusion_rate: DFinite::ZERO,
        }
    }

    const fn accumulate(&mut self, difference: &DifferenceRow) {
        self.queries += 1;
        self.recall += difference.recall;
        self.trustworthiness += difference.trustworthiness;
        self.continuity += difference.continuity;
        self.intrusion_rate += difference.intrusion_rate;
        self.extrusion_rate += difference.extrusion_rate;
    }

    /// The mean paired difference, or [`None`] before any placed query.
    fn summary(&self) -> Option<PairedSummary> {
        let queries = NonZero::new(self.queries)?;
        let count = DPositive::from_usize(queries);

        // The divisor is a query count, so count ≥ 1 never magnifies: every mean stays within
        // its finite numerator's bound.
        let mean = |sum: DFinite| (sum / count).finish_unchecked();

        Some(PairedSummary {
            queries: self.queries,
            mean: DifferenceRow {
                recall: mean(self.recall),
                trustworthiness: mean(self.trustworthiness),
                continuity: mean(self.continuity),
                intrusion_rate: mean(self.intrusion_rate),
                extrusion_rate: mean(self.extrusion_rate),
            },
        })
    }
}

/// One novelty split's population aggregates at one neighbourhood size.
struct NoveltyCells {
    deployed: NeighbourhoodAggregate,
    refit: NeighbourhoodAggregate,
}

/// The deduplication diagnostic's aggregates at one neighbourhood size.
struct DedupCells {
    deployed: NeighbourhoodAggregate,
    refit: NeighbourhoodAggregate,
    controls: NeighbourhoodAggregate,
}

/// One estimand's population aggregates at one neighbourhood size.
pub(super) struct PopulationCells {
    deployed: NeighbourhoodAggregate,
    refit: NeighbourhoodAggregate,
    controls: NeighbourhoodAggregate,
    seen: NoveltyCells,
    novel: NoveltyCells,
    paired: PairedAccumulator,
    dedup: Option<DedupCells>,
}

impl PopulationCells {
    /// Empty aggregates cloned from one validated design's templates.
    ///
    /// The deduplication cells exist exactly when the pass carries the diagnostic lens.
    pub(super) fn new(design: &NeighbourhoodDesign, dedup: bool) -> Self {
        let estimand = || design.estimand().clone();
        let diagnostic = || design.dedup().clone();

        Self {
            deployed: estimand(),
            refit: estimand(),
            controls: estimand(),
            seen: NoveltyCells {
                deployed: estimand(),
                refit: estimand(),
            },
            novel: NoveltyCells {
                deployed: estimand(),
                refit: estimand(),
            },
            paired: PairedAccumulator::new(),
            dedup: dedup.then(|| DedupCells {
                deployed: diagnostic(),
                refit: diagnostic(),
                controls: diagnostic(),
            }),
        }
    }

    /// The novelty-split cells one query's readings merge into.
    const fn by_novelty_mut(&mut self, novelty: Novelty) -> &mut NoveltyCells {
        match novelty {
            Novelty::Seen => &mut self.seen,
            Novelty::Novel => &mut self.novel,
        }
    }

    /// Renders the estimand's block at one neighbourhood size.
    pub(super) fn block(&self, neighbourhood: NonZero<usize>) -> NeighbourhoodBlock {
        NeighbourhoodBlock {
            neighbourhood,
            deployed: AggregateRow::read(&self.deployed),
            deployed_seen: AggregateRow::read(&self.seen.deployed),
            deployed_novel: AggregateRow::read(&self.novel.deployed),
            refit: AggregateRow::read(&self.refit),
            refit_seen: AggregateRow::read(&self.seen.refit),
            refit_novel: AggregateRow::read(&self.novel.refit),
            controls: AggregateRow::read(&self.controls),
            paired: self.paired.summary(),
        }
    }

    /// Renders the deduplication diagnostic's block, where the pass carries the lens.
    pub(super) fn dedup_block(&self, neighbourhood: NonZero<usize>) -> Option<DedupBlock> {
        self.dedup.as_ref().map(|cells| DedupBlock {
            neighbourhood,
            deployed: AggregateRow::read(&cells.deployed),
            refit: AggregateRow::read(&cells.refit),
            controls: AggregateRow::read(&cells.controls),
        })
    }
}

/// The deduplication lens over one universe: representatives and their own scratch.
///
/// The representative list maps each deduplication position to the universe position it
/// restricts to, so the lens can only consume distances keyed by its own universe's domain.
struct DedupLens<'run, I> {
    representatives: &'run IdSlice<DedupPosition, I>,
    scratch: RankScratch,
}

impl<I: Id> DedupLens<'_, I> {
    /// Orders the restricted universe: each representative's distance, nearest-first.
    fn order(&self, distances: &IdSlice<I, NonNegative>) -> Vec<u32> {
        let restricted: IdVec<DedupPosition, NonNegative> = self
            .representatives
            .iter()
            .map(|&position| distances[position])
            .collect();

        order_by(restricted.as_raw())
    }
}

/// The rank-metric pass over one fixed comparison universe.
///
/// Borrows the universe's embeddings, both wire framings, and the validated designs. The pass
/// owns the reusable rank scratch, so it allocates two `u32` rows per universe regardless of
/// query count. `I` is the universe's position domain, so one estimand's pass cannot consume
/// another estimand's positions or representatives.
pub(super) struct MetricPass<'run, I> {
    designs: &'run [NeighbourhoodDesign],
    universe: &'run IdSlice<I, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    wire: &'run Pair<Vec<Vec2>>,
    scratch: RankScratch,
    dedup: Option<DedupLens<'run, I>>,
}

impl<'run, I: Id> MetricPass<'run, I> {
    /// A pass over one universe, with the deduplication lens where one is handed over.
    ///
    /// The embedding rows arrive in universe draw order, which is what binds them to the
    /// position domain here.
    pub(super) fn new(
        designs: &'run [NeighbourhoodDesign],
        universe: &'run [AlignedVecN<PROJECTOR_DIMENSIONS>],
        wire: &'run Pair<Vec<Vec2>>,
        dedup_representatives: Option<&'run IdSlice<DedupPosition, I>>,
    ) -> Self {
        Self {
            designs,
            universe: IdSlice::from_raw(universe),
            wire,
            scratch: RankScratch::new(universe.len()),
            dedup: dedup_representatives.map(|representatives| DedupLens {
                representatives,
                scratch: RankScratch::new(representatives.len()),
            }),
        }
    }

    /// One sampled query's readings, merged into the population cells.
    ///
    /// The refit reading exists for every query. The deployed reading and the paired difference
    /// exist exactly when the outcome placed the query.
    pub(super) fn query(
        &mut self,
        embedding: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        refit_wire: Vec2,
        novelty: Novelty,
        outcome: ProjectedOutcome,
        cells: &mut [PopulationCells],
    ) -> Vec<QueryReadings> {
        let reference: IdVec<I, NonNegative> = self
            .universe
            .iter()
            .map(|member| embedding.cosine_distance(member))
            .collect();

        let refit: IdVec<I, NonNegative> = self
            .wire
            .later
            .iter()
            .map(|&point| refit_wire.distance_squared(point))
            .collect();

        let deployed: Option<IdVec<I, NonNegative>> = match outcome {
            ProjectedOutcome::Placed(wire) => Some(
                self.wire
                    .earlier
                    .iter()
                    .map(|&point| wire.distance_squared(point))
                    .collect(),
            ),
            ProjectedOutcome::OutOfFrame | ProjectedOutcome::NonFinite => None,
        };

        let by_reference = order_by(reference.as_raw());
        let by_refit = order_by(refit.as_raw());
        let by_deployed = deployed
            .as_ref()
            .map(|distances| order_by(distances.as_raw()));

        let mut readings = Vec::with_capacity(self.designs.len());
        for (design, cell) in self.designs.iter().zip(cells.iter_mut()) {
            let (refit_reading, refit_aggregate) = one_query_reading(
                design.estimand(),
                &by_reference,
                &by_refit,
                &mut self.scratch,
            );
            cell.refit.merge(&refit_aggregate);
            cell.by_novelty_mut(novelty).refit.merge(&refit_aggregate);

            let deployed_reading = by_deployed.as_ref().map(|by_deployed| {
                let (reading, aggregate) = one_query_reading(
                    design.estimand(),
                    &by_reference,
                    by_deployed,
                    &mut self.scratch,
                );
                cell.deployed.merge(&aggregate);
                cell.by_novelty_mut(novelty).deployed.merge(&aggregate);
                reading
            });

            let difference = deployed_reading
                .as_ref()
                .map(|deployed| deployed.minus(&refit_reading));
            if let Some(difference) = &difference {
                cell.paired.accumulate(difference);
            }

            readings.push(QueryReadings {
                neighbourhood: design.k(),
                refit: refit_reading,
                deployed: deployed_reading,
                difference,
            });
        }

        if let Some(lens) = &mut self.dedup {
            let dedup_reference = lens.order(&reference);
            let dedup_refit = lens.order(&refit);
            let dedup_deployed = deployed.as_ref().map(|distances| lens.order(distances));

            for (design, cell) in self.designs.iter().zip(cells.iter_mut()) {
                let Some(dedup_cells) = &mut cell.dedup else {
                    continue;
                };

                let (_, refit_aggregate) = one_query_reading(
                    design.dedup(),
                    &dedup_reference,
                    &dedup_refit,
                    &mut lens.scratch,
                );
                dedup_cells.refit.merge(&refit_aggregate);

                if let Some(by_deployed) = &dedup_deployed {
                    let (_, aggregate) = one_query_reading(
                        design.dedup(),
                        &dedup_reference,
                        by_deployed,
                        &mut lens.scratch,
                    );
                    dedup_cells.deployed.merge(&aggregate);
                }
            }
        }

        readings
    }

    /// One fitted control's readings, merged into the population cells.
    ///
    /// The control reads under the earlier generation's own wire frame, so its readings share the
    /// deployed readings' normalizer.
    pub(super) fn control(
        &mut self,
        embedding: &AlignedVecN<PROJECTOR_DIMENSIONS>,
        earlier_wire: Vec2,
        cells: &mut [PopulationCells],
    ) -> Vec<ControlReading> {
        let reference: IdVec<I, NonNegative> = self
            .universe
            .iter()
            .map(|member| embedding.cosine_distance(member))
            .collect();
        let map: IdVec<I, NonNegative> = self
            .wire
            .earlier
            .iter()
            .map(|&point| earlier_wire.distance_squared(point))
            .collect();

        let by_reference = order_by(reference.as_raw());
        let by_map = order_by(map.as_raw());

        let mut readings = Vec::with_capacity(self.designs.len());
        for (design, cell) in self.designs.iter().zip(cells.iter_mut()) {
            let (reading, aggregate) =
                one_query_reading(design.estimand(), &by_reference, &by_map, &mut self.scratch);
            cell.controls.merge(&aggregate);

            readings.push(ControlReading {
                neighbourhood: design.k(),
                reading,
            });
        }

        if let Some(lens) = &mut self.dedup {
            let dedup_reference = lens.order(&reference);
            let dedup_map = lens.order(&map);

            for (design, cell) in self.designs.iter().zip(cells.iter_mut()) {
                let Some(dedup_cells) = &mut cell.dedup else {
                    continue;
                };

                let (_, aggregate) = one_query_reading(
                    design.dedup(),
                    &dedup_reference,
                    &dedup_map,
                    &mut lens.scratch,
                );
                dedup_cells.controls.merge(&aggregate);
            }
        }

        readings
    }
}
