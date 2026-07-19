//! Probe orchestration: sampled anchor neighbourhoods in three spaces.
//!
//! [`probe`] samples anchor rows and reads how faithfully each anchor's
//! neighbourhood survives in the 2D map, judged against the
//! 512-component representation and the full canonical space. Two
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
//! A sampled reading's neighbourhood is coarser than a corpus reading's
//! at equal `k`: the `k` nearest of a uniform sample of `m` rows sit at
//! the corpus-scale depth of roughly `k * rows / m` neighbours. The two
//! passes therefore answer different questions - fine placement against
//! the representation, coarse placement against the canonical space -
//! and [`ProbeReadings`] keeps them apart.
//!
//! Every ranking resolves distance ties by ascending row, so equal
//! inputs produce equal readings. Readings are kept per anchor
//! ([`ReadingGrid`]), so overall and per-subgroup roll-ups merge cells
//! instead of re-ranking. Anchors rank independently and in parallel;
//! the corpus pass performs `anchors * rows` representation-kernel
//! evaluations and dominates the probe's runtime.
#![expect(
    clippy::cast_possible_truncation,
    reason = "the corpus row domain is checked against the crate's u32 row encoding at entry"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use alloc::borrow::Cow;
use core::{error::Error, fmt, mem, num::NonZero, pin::pin};

use futures::{Stream, TryStreamExt as _};
use rand::Rng;

use self::pass::{CorpusPass, SampledPass};
pub(crate) use self::readings::{ClumpReadings, ProbeReadings, RadiusPair, ReadingGrid, SpacePair};
use super::{
    clump::{ClumpAggregate, Clumps},
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::{
    bitset::BitSet,
    dataset::{CANONICAL_DIMENSIONS, Dataset, NodeRowId, PROJECTOR_DIMENSIONS},
    math::{AlignedVecN, BoxedVecN, Vec2},
    random::{sample_indices_vec, uniform_below},
};

mod pass;
mod readings;

// The neighbourhood sizes match the ones the specification's measured
// baselines are recorded at, so probe readings compare against the
// recorded evidence without interpolation. The anchor and comparison
// defaults bound the canonical fetch (anchors + comparisons rows of
// 3,072 f32 components, ~53 MB) while keeping subgroup cells at a few
// dozen anchors and the sampled neighbourhoods well inside the
// aggregate's k <= m/2 domain.
const DEFAULT_ANCHORS: NonZero<usize> =
    NonZero::new(256).expect("the default anchor count is nonzero");
const DEFAULT_COMPARISONS: NonZero<usize> =
    NonZero::new(4096).expect("the default comparison count is nonzero");
const DEFAULT_NEIGHBOURHOODS: &[NonZero<usize>] = &[
    NonZero::new(15).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(30).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(50).expect("the default neighbourhood sizes are nonzero"),
];
const DEFAULT_HORIZON_FACTOR: NonZero<usize> =
    NonZero::new(2).expect("the default horizon factor is nonzero");
// 64 shared pairs over 256 anchors read ~16K triplets; the binomial
// standard error at that volume sits near a third of a point of
// agreement, well under the differences worth acting on.
const DEFAULT_TRIPLET_PAIRS: usize = 64;

/// Pinned sampling and neighbourhood settings for one probe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeOptions {
    /// Sampled anchor rows: the queries every reading aggregates over.
    /// Defaults to 256.
    pub anchors: NonZero<usize> = DEFAULT_ANCHORS,
    /// Sampled comparison rows: the shared universe the sampled pass
    /// ranks. More rows sharpen the canonical readings toward finer
    /// neighbourhood scales and grow the canonical fetch linearly.
    /// Defaults to 4096.
    pub comparisons: NonZero<usize> = DEFAULT_COMPARISONS,
    /// Neighbourhood sizes to read at, in reporting order; must be
    /// non-empty. The trend across sizes is itself evidence: recall
    /// rising with `k` is the near-tie reshuffling fingerprint.
    /// Defaults to 15, 30, and 50.
    pub neighbourhoods: Cow<'static, [NonZero<usize>]> = Cow::Borrowed(DEFAULT_NEIGHBOURHOODS),
    /// Horizon multiplier: a false neighbour counts as an intrusion or
    /// extrusion when its opposite-space rank reaches `factor * k`
    /// (clamped to the universe), separating genuinely foreign points
    /// from reshuffling near the neighbourhood boundary. Defaults to 2.
    pub horizon_factor: NonZero<usize> = DEFAULT_HORIZON_FACTOR,
    /// Comparison-point pairs sampled for the triplet readings; every
    /// anchor reads the one shared pair sample, so the estimate's mean
    /// is unbiased while pair-driven variance is shared across
    /// anchors. Zero disables the readings. Defaults to 64.
    pub triplet_pairs: usize = DEFAULT_TRIPLET_PAIRS,
}

const impl Default for ProbeOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The probe could not run.
#[derive(Debug)]
pub(crate) enum ProbeError<E> {
    /// The corpus cannot host disjoint anchor and comparison samples.
    Design {
        rows: usize,
        anchors: usize,
        comparisons: usize,
    },
    /// The options name no neighbourhood size.
    NoNeighbourhoods,
    /// A neighbourhood size violates the aggregate domain over one of
    /// the probe's universes.
    Neighbourhood { k: usize, universe: usize },
    /// The corpus row count exceeds the crate's `u32` row encoding.
    RowsExceedProbeDomain { rows: usize },
    /// The canonical stream failed.
    Dataset(E),
    /// The canonical stream delivered a node the probe never requested.
    UnrequestedEmbedding,
    /// The canonical stream ended before covering every requested row.
    MissingEmbeddings { requested: usize, delivered: usize },
}

impl<E> fmt::Display for ProbeError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Design {
                rows,
                anchors,
                comparisons,
            } => write!(
                fmt,
                "{rows} corpus rows cannot host {anchors} anchors and {comparisons} disjoint \
                 comparison rows",
            ),
            Self::NoNeighbourhoods => {
                fmt.write_str("the options name no neighbourhood size to read at")
            }
            Self::Neighbourhood { k, universe } => write!(
                fmt,
                "neighbourhood size {k} lies outside the aggregate domain over a universe of \
                 {universe}",
            ),
            Self::RowsExceedProbeDomain { rows } => {
                write!(fmt, "{rows} rows exceed the crate's u32 row encoding")
            }
            Self::Dataset(_) => fmt.write_str("the canonical embedding stream failed"),
            Self::UnrequestedEmbedding => {
                fmt.write_str("the canonical stream delivered a node the probe never requested")
            }
            Self::MissingEmbeddings {
                requested,
                delivered,
            } => write!(
                fmt,
                "the canonical stream covered {delivered} of {requested} requested rows",
            ),
        }
    }
}

impl<E: Error + 'static> Error for ProbeError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::Design { .. }
            | Self::NoNeighbourhoods
            | Self::Neighbourhood { .. }
            | Self::RowsExceedProbeDomain { .. }
            | Self::UnrequestedEmbedding
            | Self::MissingEmbeddings { .. } => None,
        }
    }
}

/// One generation's row-aligned probe inputs.
///
/// The three slices describe the same rows in the same order; mapped
/// `f32[N, 512]` and `f32[N, 2]` artifacts yield the representation
/// and coordinate slices directly. A clump grouping over the same
/// rows rides along through [`with_clumps`](Self::with_clumps) when
/// the probe reads clump-granularity recall.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProbeCorpus<'corpus, N> {
    node_ids: &'corpus [N],
    representations: &'corpus [AlignedVecN<PROJECTOR_DIMENSIONS>],
    coordinates: &'corpus [Vec2],
    clumps: Option<&'corpus Clumps>,
}

impl<'corpus, N> ProbeCorpus<'corpus, N> {
    /// Binds one generation's row-aligned inputs.
    ///
    /// # Panics
    ///
    /// Panics when the slices disagree about the row count; all three
    /// describe one generation, so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(
        node_ids: &'corpus [N],
        representations: &'corpus [AlignedVecN<PROJECTOR_DIMENSIONS>],
        coordinates: &'corpus [Vec2],
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

    /// Attaches a clump grouping, enabling the collapsed corpus
    /// reading.
    ///
    /// # Panics
    ///
    /// Panics when the grouping labels a different row count; both
    /// describe one generation, so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn with_clumps(mut self, clumps: &'corpus Clumps) -> Self {
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

/// Reads the map's neighbourhood fidelity over sampled anchors.
///
/// Anchor and comparison rows are sampled disjointly without
/// replacement, and the anchors' and comparison rows' canonical
/// embeddings are fetched through the dataset's probe-scoped stream
/// before any ranking begins.
///
/// # Errors
///
/// Returns an error when the corpus cannot host the probe design, a
/// neighbourhood size violates an aggregate domain, the row count
/// exceeds the crate's `u32` row encoding, or the canonical stream
/// fails, misdelivers, or ends short.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
pub(crate) async fn probe<D: Dataset>(
    dataset: &D,
    corpus: ProbeCorpus<'_, D::NodeId>,
    options: &ProbeOptions,
    mut rng: impl Rng,
) -> Result<ProbeReadings, ProbeError<D::Error>> {
    let rows = corpus.rows();
    if u32::try_from(rows).is_err() {
        return Err(ProbeError::RowsExceedProbeDomain { rows });
    }
    if options.neighbourhoods.is_empty() {
        return Err(ProbeError::NoNeighbourhoods);
    }

    let anchors = options.anchors.get();
    let comparisons = options.comparisons.get();
    if rows < anchors + comparisons {
        return Err(ProbeError::Design {
            rows,
            anchors,
            comparisons,
        });
    }

    let corpus_template = aggregate_template(rows - anchors, options)?;
    let sampled_template = aggregate_template(comparisons, options)?;
    let search = options
        .neighbourhoods
        .iter()
        .map(|k| k.get())
        .max()
        .expect("the options name at least one neighbourhood size");

    let sample = sample_indices_vec(&mut rng, rows, anchors + comparisons).into_vec();
    let (anchor_rows, comparison_rows) = sample.split_at(anchors);
    let pairs = sample_pairs(&mut rng, comparisons, options.triplet_pairs);

    let canonical = fetch_canonical(dataset, corpus.node_ids, &sample).await?;
    let (anchor_canonical, comparison_canonical) = canonical.split_at(anchors);

    let mut anchor_mask = BitSet::new(rows);
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
    .run(anchor_rows);

    let (corpus_cells, radii, clump_cells) = split_anchor_readings(anchor_readings);
    let (sampled_cells, triplets) = SampledPass {
        representations: corpus.representations,
        coordinates: corpus.coordinates,
        anchor_canonical,
        comparison_canonical,
        comparison_rows,
        template: &sampled_template,
        pairs: &pairs,
    }
    .run(anchor_rows);

    let rungs = options.neighbourhoods.len();
    let mut triplet_columns = transpose_triplets(triplets);

    // The pair-indexed arrays move into named fields through the enum,
    // so reordering the pair schema cannot silently swap readings.
    let mut sampled_grids = transpose_pairs(sampled_cells)
        .map(|cells| Some(ReadingGrid::from_anchor_cells(cells, rungs)));
    let mut sampled_grid = |pair: SpacePair| {
        sampled_grids[pair as usize]
            .take()
            .expect("each pair's grid moves out exactly once")
    };
    let mut triplet_column =
        |pair: SpacePair| mem::take(&mut triplet_columns[pair as usize]).into_boxed_slice();

    Ok(ProbeReadings {
        anchors: anchor_rows
            .iter()
            .map(|&row| NodeRowId::new(row as u64))
            .collect(),
        comparisons: comparison_rows
            .iter()
            .map(|&row| NodeRowId::new(row as u64))
            .collect(),
        neighbourhoods: options.neighbourhoods.iter().copied().collect(),
        map_representation: ReadingGrid::from_anchor_cells(corpus_cells, rungs),
        clumps: corpus.clumps.map(|clumps| ClumpReadings {
            epsilon: clumps.epsilon(),
            count: clumps.clumps(),
            groups: clumps.groups(),
            grouped_rows: clumps.grouped_rows(),
            grid: ReadingGrid::from_anchor_cells(clump_cells, rungs),
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

/// Builds one empty aggregate per neighbourhood size over `universe`.
fn aggregate_template<E>(
    universe: usize,
    options: &ProbeOptions,
) -> Result<Vec<NeighbourhoodAggregate>, ProbeError<E>> {
    options
        .neighbourhoods
        .iter()
        .map(|&k| {
            let k = k.get();
            let horizon = k.saturating_mul(options.horizon_factor.get()).min(universe);
            NeighbourhoodAggregate::new(universe, k, horizon)
                .ok_or(ProbeError::Neighbourhood { k, universe })
        })
        .collect()
}

/// Samples distinct comparison-index pairs, uniform over ordered
/// pairs.
///
/// A universe of one comparison point holds no pairs and yields none
/// regardless of the requested count.
fn sample_pairs(mut rng: impl Rng, comparisons: usize, count: usize) -> Box<[[u32; 2]]> {
    let Some(second_choices) = NonZero::new(comparisons as u64 - 1) else {
        return Box::new([]);
    };
    let choices = NonZero::new(comparisons as u64).expect("one more than a nonzero count");

    core::iter::repeat_with(|| {
        let first = uniform_below(&mut rng, choices) as u32;
        let mut second = uniform_below(&mut rng, second_choices) as u32;
        if second >= first {
            second += 1;
        }
        [first, second]
    })
    .take(count)
    .collect()
}

/// Splits per-anchor triplet arrays into per-pair columns, preserving
/// the pair order.
fn transpose_triplets(
    triplets: Vec<[TripletAggregate; SpacePair::COUNT]>,
) -> [Vec<TripletAggregate>; SpacePair::COUNT] {
    let mut columns: [Vec<TripletAggregate>; SpacePair::COUNT] =
        core::array::from_fn(|_| Vec::with_capacity(triplets.len()));
    for anchor_triplets in triplets {
        for (column, aggregate) in columns.iter_mut().zip(anchor_triplets) {
            column.push(aggregate);
        }
    }
    columns
}

/// Splits per-anchor space-pair cell arrays into per-pair cell rows,
/// preserving the pair order.
fn transpose_pairs(
    cells: Vec<[Vec<NeighbourhoodAggregate>; SpacePair::COUNT]>,
) -> [Vec<Vec<NeighbourhoodAggregate>>; SpacePair::COUNT] {
    let mut pairs: [Vec<Vec<NeighbourhoodAggregate>>; SpacePair::COUNT] =
        core::array::from_fn(|_| Vec::with_capacity(cells.len()));
    for anchor_cells in cells {
        for (pair, anchor_cell) in pairs.iter_mut().zip(anchor_cells) {
            pair.push(anchor_cell);
        }
    }
    pairs
}

/// An unordered id-keyed delivery did not match its requests.
#[derive(Debug)]
pub(super) enum DeliveryError<E> {
    /// The stream failed.
    Dataset(E),
    /// The stream delivered an id that was never requested.
    Unrequested,
    /// The stream ended before covering every requested id.
    Missing { requested: usize, delivered: usize },
}

/// Matches an unordered delivery stream against its requests.
///
/// Probe-scoped dataset streams owe no delivery order and identify
/// their items only by source id, so deliveries are matched by id
/// bytes and checked for completeness - every requested id exactly
/// once, nothing else - and the payloads return in request order.
pub(super) async fn match_deliveries<Id, T, E>(
    requests: &[Id],
    deliveries: impl Stream<Item = Result<(Id, T), E>>,
) -> Result<Vec<T>, DeliveryError<E>>
where
    Id: zerocopy::IntoBytes + zerocopy::Immutable,
{
    let key = |slot: u32| requests[slot as usize].as_bytes();

    let mut order: Vec<u32> = (0..requests.len() as u32).collect();
    order.sort_unstable_by(|&one, &other| key(one).cmp(key(other)));

    let mut received: Vec<Option<T>> = requests.iter().map(|_| None).collect();
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
        if received[slot].replace(payload).is_none() {
            delivered += 1;
        }
    }

    if delivered != requests.len() {
        return Err(DeliveryError::Missing {
            requested: requests.len(),
            delivered,
        });
    }

    Ok(received
        .into_iter()
        .map(|slot| slot.expect("every slot was delivered"))
        .collect())
}

/// Fetches the sampled rows' canonical embeddings, in sample order.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
async fn fetch_canonical<D: Dataset>(
    dataset: &D,
    node_ids: &[D::NodeId],
    sample: &[usize],
) -> Result<Vec<BoxedVecN<CANONICAL_DIMENSIONS>>, ProbeError<D::Error>> {
    let requests: Vec<D::NodeId> = sample.iter().map(|&row| node_ids[row]).collect();
    match_deliveries(
        &requests,
        dataset.canonical_node_embeddings(requests.iter().copied()),
    )
    .await
    .map_err(|error| match error {
        DeliveryError::Dataset(error) => ProbeError::Dataset(error),
        DeliveryError::Unrequested => ProbeError::UnrequestedEmbedding,
        DeliveryError::Missing {
            requested,
            delivered,
        } => ProbeError::MissingEmbeddings {
            requested,
            delivered,
        },
    })
}
