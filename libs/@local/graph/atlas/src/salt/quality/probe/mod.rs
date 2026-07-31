//! Probe orchestration: sampled anchor neighbourhoods in three spaces.
//!
//! [`probe`] samples anchor rows and reads how faithfully each anchor's neighbourhood survives in
//! the 2D map, judged against the 512-component representation and the full canonical space. Two
//! passes feed one kernel set:
//!
//! - The corpus pass ranks every non-anchor row against each anchor in the map and the
//!   representation. Ranks are counted, not sorted, so the map-versus-representation readings are
//!   exact at corpus scale while per-anchor memory stays bounded by the largest neighbourhood.
//! - The sampled pass ranks a shared comparison universe - a bounded uniform sample whose canonical
//!   embeddings arrive through the dataset's probe-scoped stream - in all three spaces, and reads
//!   every space pair over that one universe. Canonical readings are never corpus-exact, because
//!   the full canonical corpus stays at the source; the readings the map is judged against - the
//!   representation baseline - are measured under the identical design, so the comparison is like
//!   for like.
//!
//! A sampled reading's neighbourhood is coarser than a corpus reading's at equal `k`: the `k`
//! nearest of a uniform sample of `m` rows sit at the corpus-scale depth of roughly `k · rows / m`
//! neighbours. The two passes therefore answer different questions - fine placement against the
//! representation, coarse placement against the canonical space - and [`ProbeReadings`] keeps them
//! apart.
//!
//! Every ranking resolves distance ties by ascending row, so equal inputs produce equal readings.
//! Readings are kept per anchor ([`ReadingGrid`]), so overall and per-subgroup roll-ups merge cells
//! instead of re-ranking. Anchors rank independently and in parallel; the corpus pass performs
//! `anchors · rows` representation-kernel evaluations and dominates the probe's runtime.
#![expect(
    clippy::cast_possible_truncation,
    reason = "the corpus row domain is checked against the crate's u32 row encoding at entry"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use core::{mem, num::NonZero, pin::pin};

use futures::{Stream, TryStreamExt as _};
use hashql_core::id::{Id, IdSlice, bit_vec::DenseBitSet};
use rand::Rng;
use rayon::iter::ParallelIterator as _;

pub(crate) use self::{
    error::{DeliveryError, ProbeError},
    options::ProbeOptions,
    readings::{
        AnchorOrdinal, ClumpReadings, ProbeReadings, RadiusPair, ReadingGrid, Rung, SpacePair,
        SpacePairArray,
    },
};
use self::{
    options::validate_design,
    pass::{CorpusPass, SampledPass},
};
use super::{
    clump::{ClumpAggregate, Clumps},
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, Dataset, PROJECTOR_DIMENSIONS},
    identity::NodeRowId,
    math::{AlignedVecN, BoxedVecN, Vec2},
    random::{sample_indices_vec, uniform_below},
};

mod error;
mod options;
mod pass;
mod readings;

/// One generation's row-aligned probe inputs.
///
/// The three slices describe the same rows in the same order; mapped `f32[N, 512]` and `f32[N, 2]`
/// artifacts yield the representation and coordinate slices directly. A clump grouping over the
/// same rows rides along through [`with_clumps`](Self::with_clumps) when the probe reads
/// clump-granularity recall.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProbeCorpus<'corpus, N> {
    node_ids: &'corpus IdSlice<NodeRowId, N>,
    representations: &'corpus IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    coordinates: &'corpus IdSlice<NodeRowId, Vec2>,
    clumps: Option<&'corpus Clumps<NodeRowId>>,
}

impl<'corpus, N> ProbeCorpus<'corpus, N> {
    /// Binds one generation's row-aligned inputs.
    ///
    /// # Panics
    ///
    /// Panics when the slices disagree about the row count; all three describe one generation, so a
    /// mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(
        node_ids: &'corpus IdSlice<NodeRowId, N>,
        representations: &'corpus IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        coordinates: &'corpus IdSlice<NodeRowId, Vec2>,
    ) -> Self {
        assert_eq!(
            node_ids.len(),
            representations.len(),
            "the node ids and the representation matrix should cover the same rows",
        );
        assert_eq!(
            node_ids.len(),
            coordinates.len(),
            "the node ids and the coordinate frame should cover the same rows",
        );

        Self {
            node_ids,
            representations,
            coordinates,
            clumps: None,
        }
    }

    /// Attaches a clump grouping, enabling the collapsed corpus reading.
    ///
    /// # Panics
    ///
    /// Panics when the grouping labels a different row count; both describe one generation, so a
    /// mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn with_clumps(mut self, clumps: &'corpus Clumps<NodeRowId>) -> Self {
        assert_eq!(
            clumps.rows(),
            self.node_ids.len(),
            "the clump grouping and the node ids should cover the same rows",
        );

        self.clumps = Some(clumps);
        self
    }

    /// Returns the corpus row count.
    const fn rows(&self) -> usize {
        self.node_ids.len()
    }
}

/// Matches an unordered delivery stream against the requested rows' ids.
///
/// Probe-scoped dataset streams owe no delivery order and identify their items only by source id,
/// so deliveries are matched by id bytes and checked for completeness - every requested id exactly
/// once, nothing else - and the payloads return in `rows` order. Requests are read straight off
/// the `(node_ids, rows)` pair, so no caller materializes a request list.
///
/// This function enforces exactly-once rather than assuming it, because a violation damages the
/// reading it feeds. An unrequested id refuses, a short stream refuses, and a repeated id refuses
/// before its payload can replace the one already accepted.
pub(super) async fn match_deliveries<I, R, T, E>(
    node_ids: &IdSlice<R, I>,
    rows: &[R],
    deliveries: impl Stream<Item = Result<(I, T), E>>,
) -> Result<Vec<T>, DeliveryError<E>>
where
    // Matching is on byte identity, not semantic order: `IntoBytes` totally
    // orders exactly the encoding the stream echoes back, where an ordering
    // bound on the id type would owe neither totality nor byte fidelity.
    I: zerocopy::IntoBytes + zerocopy::Immutable,
    R: Id,
{
    let key = |slot: u32| node_ids[rows[slot as usize]].as_bytes();

    let mut order: Vec<u32> = (0..rows.len() as u32).collect();
    order.sort_unstable_by(|&one, &other| key(one).cmp(key(other)));

    let mut received: Vec<Option<T>> = rows.iter().map(|_| None).collect();
    let mut delivered = 0_usize;

    let mut deliveries = pin!(deliveries);
    while let Some((id, payload)) = deliveries
        .try_next()
        .await
        .map_err(DeliveryError::Dataset)?
    {
        // The search's `Err` is an insertion point, not a failure to keep.
        let position = order
            .binary_search_by(|&slot| key(slot).cmp(id.as_bytes()))
            .map_err(|_insertion| DeliveryError::Unrequested)?;
        let slot = order[position] as usize;
        if received[slot].replace(payload).is_some() {
            return Err(DeliveryError::Repeated);
        }
        delivered += 1;
    }

    if delivered != rows.len() {
        return Err(DeliveryError::Missing {
            requested: rows.len(),
            delivered,
        });
    }

    Ok(received
        .into_iter()
        .map(|slot| slot.expect("every slot was delivered"))
        .collect())
}

/// Fetches the sampled rows' canonical embeddings, in sample order.
async fn fetch_canonical<D: Dataset>(
    dataset: &D,
    node_ids: &IdSlice<NodeRowId, D::NodeId>,
    sample: &[NodeRowId],
) -> Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, ProbeError<D::Error>> {
    match_deliveries(
        node_ids,
        sample,
        dataset.canonical_node_embeddings(sample.iter().map(|&row| node_ids[row])),
    )
    .await
    .map_err(|error| match error {
        DeliveryError::Dataset(error) => ProbeError::Dataset(error),
        DeliveryError::Unrequested => ProbeError::UnrequestedEmbedding,
        DeliveryError::Repeated => ProbeError::RepeatedEmbedding,
        DeliveryError::Missing {
            requested,
            delivered,
        } => ProbeError::MissingEmbeddings {
            requested,
            delivered,
        },
    })
}

/// Reads the map's neighbourhood fidelity over sampled anchors.
///
/// Anchor and comparison rows are sampled disjointly without replacement, and the anchors' and
/// comparison rows' canonical embeddings are fetched through the dataset's probe-scoped stream
/// before any ranking begins.
///
/// # Errors
///
/// Returns an error when the corpus cannot host the probe design, a neighbourhood size violates an
/// aggregate domain, the row count exceeds the crate's `u32` row encoding, or the canonical stream
/// fails, misdelivers, or ends short.
pub(crate) async fn probe<D: Dataset>(
    dataset: &D,
    corpus: ProbeCorpus<'_, D::NodeId>,
    options: &ProbeOptions,
    mut rng: impl Rng,
) -> Result<ProbeReadings<NodeRowId>, ProbeError<D::Error>> {
    let rows = corpus.rows();
    validate_design(rows, options)?;

    let anchors = options.anchors.get();
    let comparisons = options.comparisons.get();
    let corpus_template = aggregate_template(rows - anchors, options)?;
    let sampled_template = aggregate_template(comparisons, options)?;
    let search = options
        .neighbourhoods
        .iter()
        .map(|k| k.get())
        .max()
        .expect("the options name at least one neighbourhood size");

    let sample: Vec<_> = sample_indices_vec(&mut rng, rows, anchors + comparisons)
        .into_iter()
        .map(NodeRowId::from_usize)
        .collect();
    let (anchor_rows, comparison_rows) = sample.split_at(anchors);
    let pairs = sample_pairs(&mut rng, comparisons, options.triplet_pairs);

    let canonical = fetch_canonical(dataset, corpus.node_ids, &sample).await?;
    let (anchor_canonical, comparison_canonical) = canonical.split_at(anchors);

    let mut anchor_mask = DenseBitSet::new_empty(rows);
    for &row in anchor_rows {
        anchor_mask.insert(row);
    }

    let anchor_readings = CorpusPass {
        representations: corpus.representations,
        coordinates: corpus.coordinates,
        anchor_mask: &anchor_mask,
        search,
        template: &corpus_template,
        neighbourhoods: &options.neighbourhoods,
        clumps: corpus.clumps,
    }
    .run(anchor_rows)
    .collect();

    let (corpus_cells, radii, clump_cells) = split_anchor_readings(anchor_readings);
    let sampled = split_sampled_readings(
        SampledPass {
            representations: corpus.representations,
            coordinates: corpus.coordinates,
            anchor_canonical,
            comparison_canonical,
            comparison_rows,
            template: &sampled_template,
            neighbourhoods: &options.neighbourhoods,
            pairs: &pairs,
            clumps: corpus.clumps,
        }
        .run(anchor_rows)
        .collect(),
    );

    let rungs = options.neighbourhoods.len();
    let mut triplet_columns = transpose_triplets(sampled.triplets);

    // The pair-indexed arrays move into named fields through the enum,
    // so reordering the pair schema cannot silently swap readings.
    let mut sampled_grids = transpose_pairs(sampled.cells)
        .map(|cells| Some(ReadingGrid::from_anchor_cells(cells, rungs)));
    let mut sampled_grid = |pair: SpacePair| {
        sampled_grids[pair]
            .take()
            .expect("each pair's grid moves out exactly once")
    };
    let mut triplet_column =
        |pair: SpacePair| mem::take(&mut triplet_columns[pair]).into_boxed_slice();

    Ok(ProbeReadings {
        anchors: anchor_rows.iter().copied().collect(),
        comparisons: comparison_rows.iter().copied().collect(),
        neighbourhoods: IdSlice::from_boxed_slice(options.neighbourhoods.iter().copied().collect()),
        map_representation: ReadingGrid::from_anchor_cells(corpus_cells, rungs),
        clumps: corpus.clumps.map(|clumps| ClumpReadings {
            epsilon: clumps.epsilon(),
            count: clumps.clumps(),
            groups: clumps.groups(),
            grouped_rows: clumps.grouped_rows(),
            map_representation: ReadingGrid::from_anchor_cells(clump_cells, rungs),
            representation_canonical: ReadingGrid::from_anchor_cells(
                sampled.baseline_clumps,
                rungs,
            ),
        }),
        sampled_map_representation: sampled_grid(SpacePair::MapRepresentation),
        sampled_map_canonical: sampled_grid(SpacePair::MapCanonical),
        sampled_representation_canonical: sampled_grid(SpacePair::RepresentationCanonical),
        radii: radii.into_boxed_slice(),
        triplet_pairs: pairs,
        triplet_map_representation: triplet_column(SpacePair::MapRepresentation),
        triplet_map_canonical: triplet_column(SpacePair::MapCanonical),
        triplet_representation_canonical: triplet_column(SpacePair::RepresentationCanonical),
    })
}

/// Splits the corpus pass's per-anchor readings into grid inputs.
fn split_anchor_readings(
    readings: Vec<pass::AnchorReading>,
) -> (
    Vec<Vec<NeighbourhoodAggregate>>,
    Vec<RadiusPair>,
    Vec<Vec<ClumpAggregate>>,
) {
    let mut cells = Vec::with_capacity(readings.len());
    let mut radii = Vec::new();
    let mut clumps = Vec::with_capacity(readings.len());

    for reading in readings {
        cells.push(reading.cells);
        radii.extend(reading.radii);
        clumps.push(reading.clumps);
    }

    (cells, radii, clumps)
}

/// The sampled pass's per-anchor readings split into grid inputs.
struct SampledColumns {
    /// Per-anchor cell arrays, one entry per space pair.
    cells: Vec<SpacePairArray<Vec<NeighbourhoodAggregate>>>,
    /// Per-anchor triplet aggregates, one entry per space pair.
    triplets: Vec<SpacePairArray<TripletAggregate>>,
    /// Per-anchor baseline clump cells.
    baseline_clumps: Vec<Vec<ClumpAggregate>>,
}

/// Splits the sampled pass's per-anchor readings into grid inputs.
fn split_sampled_readings(readings: Vec<pass::SampledReading>) -> SampledColumns {
    let mut cells = Vec::with_capacity(readings.len());
    let mut triplets = Vec::with_capacity(readings.len());
    let mut baseline_clumps = Vec::with_capacity(readings.len());

    for reading in readings {
        cells.push(reading.cells);
        triplets.push(reading.triplets);
        baseline_clumps.push(reading.baseline_clumps);
    }

    SampledColumns {
        cells,
        triplets,
        baseline_clumps,
    }
}

/// Builds one empty aggregate per neighbourhood size over `universe`.
fn aggregate_template<E>(
    universe: usize,
    options: &ProbeOptions,
) -> Result<Vec<NeighbourhoodAggregate>, ProbeError<E>> {
    options
        .neighbourhoods
        .iter()
        .map(|&k| {
            let horizon = k
                .get()
                .saturating_mul(options.horizon_factor.get())
                .min(universe);

            NeighbourhoodAggregate::new(universe, k, horizon).ok_or(ProbeError::Neighbourhood {
                k: k.get(),
                universe,
            })
        })
        .collect()
}

/// Samples distinct comparison-index pairs, uniform over ordered pairs.
///
/// A universe of fewer than two comparison points holds no ordered pair and yields none regardless
/// of the requested count.
pub(super) fn sample_pairs(mut rng: impl Rng, comparisons: usize, count: usize) -> Box<[[u32; 2]]> {
    let Some(choices) = NonZero::new(comparisons as u64) else {
        return Box::new([]);
    };
    // The second draw runs over a universe one smaller than the first,
    // which is what leaves a single-point universe with no pair to draw.
    let Some(second_choices) = NonZero::new(choices.get() - 1) else {
        return Box::new([]);
    };

    core::iter::repeat_with(|| {
        let first = uniform_below(&mut rng, choices) as u32;
        let mut second = uniform_below(&mut rng, second_choices) as u32;
        // Skip-over-self, in place of a rejection loop: `second` is drawn
        // from a universe one smaller, and shifting the values at or above
        // `first` up by one maps them onto everything except `first`. The
        // largest shifted value is `comparisons - 1`, so the pair is
        // distinct and in bounds by construction.
        if second >= first {
            second += 1;
        }

        [first, second]
    })
    .take(count)
    .collect()
}

/// Splits per-anchor triplet arrays into per-pair columns, preserving the pair order.
fn transpose_triplets(
    triplets: Vec<SpacePairArray<TripletAggregate>>,
) -> SpacePairArray<Vec<TripletAggregate>> {
    let mut columns = SpacePairArray::from_fn(|_| Vec::with_capacity(triplets.len()));

    for anchor_triplets in triplets {
        for (pair, aggregate) in anchor_triplets.into_iter_enumerated() {
            columns[pair].push(aggregate);
        }
    }

    columns
}

/// Splits per-anchor space-pair cell arrays into per-pair cell rows, preserving the pair order.
fn transpose_pairs(
    cells: Vec<SpacePairArray<Vec<NeighbourhoodAggregate>>>,
) -> SpacePairArray<Vec<Vec<NeighbourhoodAggregate>>> {
    let mut pairs = SpacePairArray::from_fn(|_| Vec::with_capacity(cells.len()));

    for anchor_cells in cells {
        for (pair, anchor_cell) in anchor_cells.into_iter_enumerated() {
            pairs[pair].push(anchor_cell);
        }
    }

    pairs
}
