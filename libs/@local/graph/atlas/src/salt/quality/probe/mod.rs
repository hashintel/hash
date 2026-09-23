//! Probe orchestration over sampled anchor neighbourhoods in three spaces.
//!
//! [`probe`] samples anchor rows and reads how well each anchor's neighbourhood survives in the 2D
//! map, judged against the 512-component representation and the full canonical space. Both passes
//! feed one kernel set:
//!
//! - The corpus pass ranks every non-anchor row against each anchor in the map and the
//!   representation. Counting ranks over the full non-anchor universe avoids materializing sorted
//!   orderings. Per-anchor ranking scratch grows with the largest neighbourhood.
//! - The sampled pass ranks a shared comparison universe in all three spaces. It fetches canonical
//!   embeddings only for the sampled rows. The representation baseline and map-versus-canonical
//!   reading share this universe, making their neighbourhood scales directly comparable. With fewer
//!   comparisons than non-anchor rows, these rankings cover a sample of the corpus.
//!
//! At equal k, a smaller uniform comparison sample measures a coarser neighbourhood. Among n
//! non-anchor rows, the expected full-universe rank of the k-th nearest of m sampled rows is:
//!
//! `k · (n + 1)/(m + 1)`, approximately `k · n/m`.
//!
//! [`ProbeReadings`] keeps the corpus and sampled grids separate.
//!
//! Rankings use computed distances, with row order breaking ties. Replaying requires equal corpus
//! and canonical values, options and initial generator state, together with the same numerical
//! environment. The distance kernels round to f32. Representation and canonical kernels accumulate
//! in f64, while squared map distances use f32 arithmetic. Finite coordinates alone still permit
//! overflow in that arithmetic.
//!
//! Anchors rank independently in parallel. Per-anchor cells ([`ReadingGrid`]) support whole-probe
//! and subgroup merges without re-ranking. For a anchors, n non-anchor rows and maximum
//! neighbourhood K, the corpus pass evaluates a · (n + K) representation distances and counts ranks
//! against K thresholds per scanned row. It shares an O(rows) anchor mask and uses O(K) ranking
//! scratch per worker, in addition to output grids.
#![expect(
    clippy::cast_possible_truncation,
    reason = "the corpus row domain is checked against the crate's u32 row encoding at entry"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use alloc::borrow::Cow;
use core::{mem, num::NonZero, pin::pin};

use futures::{Stream, TryStreamExt as _};
use hashql_core::id::{Id, IdSlice, bit_vec::DenseBitSet};
use rand::Rng;
use rayon::iter::IndexedParallelIterator as _;

use self::pass::{CorpusPass, SampledPass};
use super::{
    clump::{ClumpAggregate, Clumps},
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, Dataset, PROJECTOR_DIMENSIONS},
    identity::NodeRowId,
    math::{AlignedVecN, FinitePointField},
    random::{sample_ids, uniform_below},
};

mod error;
mod options;
mod pass;
mod readings;

pub(crate) use self::{
    error::{DeliveryError, ProbeError},
    options::ProbeOptions,
    readings::{
        AnchorOrdinal, ClumpReadings, ProbeReadings, RadiusPair, ReadingGrid, SpacePair,
        SpacePairArray, Step, TypedReadings,
    },
};

/// One generation's row-aligned probe inputs.
///
/// The inputs must describe the same rows in the same order, with unique byte-encoded source ids
/// and finite representations. Construction checks equal lengths. Coordinates have a finite-point
/// type, but squared map distances must also remain finite for finite radius statistics.
/// [`with_clumps`](Self::with_clumps) attaches labels over the same row domain.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProbeCorpus<'corpus, N> {
    node_ids: &'corpus IdSlice<NodeRowId, N>,
    representations: &'corpus IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    coordinates: &'corpus FinitePointField<NodeRowId>,
    clumps: Option<&'corpus Clumps<NodeRowId>>,
}

impl<'corpus, N> ProbeCorpus<'corpus, N> {
    /// Binds one generation's row-aligned inputs.
    ///
    /// # Panics
    ///
    /// Panics when the inputs disagree about the row count.
    #[must_use]
    pub(crate) fn new(
        node_ids: &'corpus IdSlice<NodeRowId, N>,
        representations: &'corpus IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        coordinates: &'corpus FinitePointField<NodeRowId>,
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

    /// Attaches clump labels for corpus and sampled-baseline recall.
    ///
    /// # Panics
    ///
    /// Panics when the grouping labels a different row count.
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

    /// Checks embedding components when the population cannot support rank measurements.
    ///
    /// # Errors
    ///
    /// Returns [`ProbeError::NonFiniteEmbedding`] for a non-finite component below the rank domain.
    fn validate_small_embeddings<E>(
        &self,
        canonical: &[Cow<'_, AlignedVecN<CANONICAL_DIMENSIONS>>],
    ) -> Result<(), ProbeError<E>> {
        if self.rows() < 3
            && (self
                .representations
                .iter()
                .any(|embedding| !embedding.is_finite())
                || canonical.iter().any(|embedding| !embedding.is_finite()))
        {
            return Err(ProbeError::NonFiniteEmbedding);
        }

        Ok(())
    }

    /// Returns the corpus row count.
    const fn rows(&self) -> usize {
        self.node_ids.len()
    }
}

/// Matches an unordered delivery stream against the requested rows' ids.
///
/// Matches source ids by their byte encoding and returns payloads in `rows` order. The requested
/// rows must identify distinct byte encodings, and the request count must fit u32. Success requires
/// every requested id exactly once, with no additional id.
///
/// # Errors
///
/// Returns [`DeliveryError`] for a failed stream, an unrequested or repeated id, or incomplete
/// delivery. An identical repeated payload still fails. No payload collection is returned on
/// failure.
///
/// # Panics
///
/// Panics when a requested row lies outside `node_ids`.
pub(super) async fn match_deliveries<I, R, T, E>(
    node_ids: &IdSlice<R, I>,
    rows: &[R],
    deliveries: impl Stream<Item = Result<(I, T), E>>,
) -> Result<Vec<T>, DeliveryError<E>>
where
    // matching compares the delivered byte encoding rather than an id type's semantic ordering
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
        // a failed search identifies a delivery outside the requested id set
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

/// Samples disjoint anchor and comparison rows in draw order.
///
/// The result contains `anchors + comparisons` distinct rows, with anchors first. The count sum
/// must fit usize. Sampling is the first generator operation, preserving agreement with offline
/// coverage when population length, counts and initial generator state match. Use
/// [`probe_rng`](crate::salt::runner::probe_rng) for the fit runner's seed derivation.
///
/// # Panics
///
/// Panics when the requested count exceeds the population length, or the count sum overflows with
/// integer overflow checks enabled.
pub(crate) fn probe_sample<T>(
    mut rng: impl Rng,
    population: &IdSlice<NodeRowId, T>,
    anchors: usize,
    comparisons: usize,
) -> Vec<NodeRowId> {
    sample_ids(&mut rng, population, anchors + comparisons).collect()
}

/// Fetches the sampled rows' canonical embeddings, in sample order.
///
/// # Errors
///
/// Returns [`ProbeError`] for a failed canonical stream or a delivery mismatch.
async fn fetch_canonical<'data, D: Dataset>(
    dataset: &'data D,
    node_ids: &IdSlice<NodeRowId, D::NodeId>,
    sample: &[NodeRowId],
) -> Result<Vec<Cow<'data, AlignedVecN<CANONICAL_DIMENSIONS>>>, ProbeError<D::Error>> {
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
/// This samples anchor and comparison rows disjointly without replacement, then fetches both
/// samples' canonical embeddings through the dataset's probe-scoped stream before any ranking
/// begins. The dataset must supply the same canonical values as the corpus represents, with finite
/// components. Sample counts are upper bounds resolved against the corpus. All aggregate totals and
/// normalization products must fit their integer carriers.
///
/// # Errors
///
/// Returns [`ProbeError`] for an invalid probe design, a failed or mismatched canonical delivery,
/// or non-finite embeddings in a population below the rank domain.
///
/// # Panics
///
/// Overflowing aggregate arithmetic can panic with integer overflow checking.
pub(crate) async fn probe<D: Dataset>(
    dataset: &D,
    corpus: ProbeCorpus<'_, D::NodeId>,
    options: &ProbeOptions,
    mut rng: impl Rng,
) -> Result<ProbeReadings<NodeRowId>, ProbeError<D::Error>> {
    let rows = corpus.rows();
    let design = options.resolve(rows)?;

    let anchors = design.anchors;
    let comparisons = design.comparisons;
    let corpus_template = aggregate_template(
        rows - anchors,
        &design.neighbourhoods,
        options.horizon_factor,
    )?;
    let sampled_template =
        aggregate_template(comparisons, &design.neighbourhoods, options.horizon_factor)?;
    let search = design
        .density_neighbourhoods
        .iter()
        .map(|k| k.get())
        .max()
        .unwrap_or(0);

    let sample = probe_sample(&mut rng, corpus.node_ids, anchors, comparisons);
    let (anchor_rows, comparison_rows) = sample.split_at(anchors);
    let pairs = sample_pairs(&mut rng, comparisons, options.triplet_pairs);

    let canonical = fetch_canonical(dataset, corpus.node_ids, &sample).await?;
    corpus.validate_small_embeddings(&canonical)?;
    let (anchor_canonical, comparison_canonical) = canonical.split_at(anchors);

    let mut anchor_mask = DenseBitSet::new_empty(rows);
    for &row in anchor_rows {
        anchor_mask.insert(row);
    }

    let mut sampled_readings = Vec::new();
    CorpusPass {
        representations: corpus.representations,
        coordinates: corpus.coordinates,
        anchor_mask: &anchor_mask,
        search,
        template: &corpus_template,
        neighbourhoods: &design.neighbourhoods,
        density_neighbourhoods: &design.density_neighbourhoods,
        clumps: corpus.clumps,
    }
    .run(anchor_rows)
    .collect_into_vec(&mut sampled_readings);
    let anchor_columns = AnchorColumns::new(sampled_readings.into_iter());

    let mut sampled_readings = Vec::new();
    SampledPass {
        representations: corpus.representations,
        coordinates: corpus.coordinates,
        anchor_canonical,
        comparison_canonical,
        comparison_rows,
        template: &sampled_template,
        neighbourhoods: &design.neighbourhoods,
        pairs: &pairs,
        clumps: corpus.clumps,
    }
    .run(anchor_rows)
    .collect_into_vec(&mut sampled_readings);
    let sampled = SampledColumns::new(sampled_readings.into_iter());

    let steps = design.neighbourhoods.len();
    let mut triplet_columns = transpose_triplets(sampled.triplets);

    // use typed pair indices when assigning the named result fields
    let mut sampled_grids = transpose_pairs(sampled.cells)
        .map(|cells| Some(ReadingGrid::from_anchor_cells(cells, steps)));
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
        corpus_universe: rows - anchors,
        neighbourhoods: IdSlice::from_boxed_slice(design.neighbourhoods.into_boxed_slice()),
        density_neighbourhoods: design.density_neighbourhoods.into_boxed_slice(),
        triplet_pairs_requested: options.triplet_pairs,
        map_representation: ReadingGrid::from_anchor_cells(anchor_columns.cells, steps),
        clumps: corpus.clumps.map(|clumps| ClumpReadings {
            epsilon: clumps.epsilon(),
            count: clumps.clumps(),
            groups: clumps.groups(),
            grouped_rows: clumps.grouped_rows(),
            map_representation: ReadingGrid::from_anchor_cells(anchor_columns.clumps, steps),
            representation_canonical: ReadingGrid::from_anchor_cells(
                sampled.baseline_clumps,
                steps,
            ),
        }),
        sampled_map_representation: sampled_grid(SpacePair::MapRepresentation),
        sampled_map_canonical: sampled_grid(SpacePair::MapCanonical),
        sampled_representation_canonical: sampled_grid(SpacePair::RepresentationCanonical),
        radii: anchor_columns.radii.into_boxed_slice(),
        triplet_pairs: pairs,
        triplet_map_representation: triplet_column(SpacePair::MapRepresentation),
        triplet_map_canonical: triplet_column(SpacePair::MapCanonical),
        triplet_representation_canonical: triplet_column(SpacePair::RepresentationCanonical),
    })
}

/// The corpus pass's per-anchor readings split into grid inputs.
struct AnchorColumns {
    /// Per-anchor map-representation cells.
    cells: Vec<Vec<NeighbourhoodAggregate>>,
    /// Every anchor's radius pairs, concatenated.
    radii: Vec<RadiusPair>,
    /// Per-anchor clump cells.
    clumps: Vec<Vec<ClumpAggregate>>,
}

impl AnchorColumns {
    /// Splits the corpus pass's per-anchor readings into grid inputs.
    fn new(readings: impl ExactSizeIterator<Item = pass::AnchorReading>) -> Self {
        let mut cells = Vec::with_capacity(readings.len());
        let mut radii = Vec::new();
        let mut clumps = Vec::with_capacity(readings.len());

        for reading in readings {
            cells.push(reading.cells);
            radii.extend(reading.radii);
            clumps.push(reading.clumps);
        }

        Self {
            cells,
            radii,
            clumps,
        }
    }
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

impl SampledColumns {
    /// Splits the sampled pass's per-anchor readings into grid inputs.
    fn new(readings: impl ExactSizeIterator<Item = pass::SampledReading>) -> Self {
        let mut cells = Vec::with_capacity(readings.len());
        let mut triplets = Vec::with_capacity(readings.len());
        let mut baseline_clumps = Vec::with_capacity(readings.len());

        for reading in readings {
            cells.push(reading.cells);
            triplets.push(reading.triplets);
            baseline_clumps.push(reading.baseline_clumps);
        }

        Self {
            cells,
            triplets,
            baseline_clumps,
        }
    }
}

/// Builds one shape-validated empty aggregate per neighbourhood size.
///
/// Arithmetic capacity for the eventual query count remains unchecked.
///
/// # Errors
///
/// Returns [`ProbeError::Neighbourhood`] for the first size outside the aggregate's domain over
/// `universe`.
fn aggregate_template<E>(
    universe: usize,
    neighbourhoods: &[NonZero<usize>],
    horizon_factor: NonZero<usize>,
) -> Result<Vec<NeighbourhoodAggregate>, ProbeError<E>> {
    neighbourhoods
        .iter()
        .map(|&k| {
            NeighbourhoodAggregate::clamped(universe, k, horizon_factor)
                .ok_or(ProbeError::Neighbourhood { k, universe })
        })
        .collect()
}

/// Samples ordered pairs of distinct comparison indices, with replacement.
///
/// The comparison count must fit u32. Each pair is uniform over distinct indices, and pairs may
/// repeat across draws. A universe of fewer than two comparison points yields no pairs regardless
/// of the requested count.
pub(super) fn sample_pairs(mut rng: impl Rng, comparisons: usize, count: usize) -> Box<[[u32; 2]]> {
    let Some(choices) = NonZero::new(comparisons as u64) else {
        return Box::new([]);
    };
    // a single-point universe has no distinct second point
    let Some(second_choices) = NonZero::new(choices.get() - 1) else {
        return Box::new([]);
    };

    core::iter::repeat_with(|| {
        let first = uniform_below(&mut rng, choices) as u32;
        let mut second = uniform_below(&mut rng, second_choices) as u32;
        // A uniform index mapped bijectively onto a finite set remains uniform. The second draw
        // covers 0..comparisons-1, and shifting at first maps that range onto every index except
        // first. The largest result is comparisons-1, within the u32 domain. Therefore this draw is
        // uniform over distinct second indices without rejection.
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
