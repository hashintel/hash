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

use core::{error::Error, fmt, num::NonZero, pin::pin};

use futures::TryStreamExt as _;
use rand::Rng;
use zerocopy::IntoBytes as _;

use self::pass::{corpus_pass, sampled_pass};
use super::metric::NeighbourhoodAggregate;
use crate::{
    bitset::BitSet,
    dataset::{CANONICAL_DIMENSIONS, Dataset, NodeRowId, PROJECTOR_DIMENSIONS},
    math::{AlignedVecN, BoxedVecN, Vec2},
    random::sample_indices_vec,
};

mod pass;

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
const DEFAULT_NEIGHBOURHOODS: [NonZero<usize>; 3] = [
    NonZero::new(15).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(30).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(50).expect("the default neighbourhood sizes are nonzero"),
];
const DEFAULT_HORIZON_FACTOR: NonZero<usize> =
    NonZero::new(2).expect("the default horizon factor is nonzero");

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
    pub neighbourhoods: Vec<NonZero<usize>>,
    /// Horizon multiplier: a false neighbour counts as an intrusion or
    /// extrusion when its opposite-space rank reaches `factor * k`
    /// (clamped to the universe), separating genuinely foreign points
    /// from reshuffling near the neighbourhood boundary. Defaults to 2.
    pub horizon_factor: NonZero<usize> = DEFAULT_HORIZON_FACTOR,
}

impl Default for ProbeOptions {
    fn default() -> Self {
        Self {
            neighbourhoods: DEFAULT_NEIGHBOURHOODS.to_vec(),
            ..
        }
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

/// Per-anchor aggregates for one space pair, anchor-major.
///
/// Every cell reads one anchor at one neighbourhood size; the
/// neighbourhood axis follows the options' reporting order. Roll-ups
/// merge cells, so a consumer groups anchors - overall, by subgroup -
/// without touching orderings again.
#[derive(Debug, Clone)]
pub(crate) struct ReadingGrid {
    cells: Box<[NeighbourhoodAggregate]>,
    neighbourhoods: usize,
}

impl ReadingGrid {
    /// Flattens per-anchor cell rows into a grid.
    fn from_anchor_cells(rows: Vec<Vec<NeighbourhoodAggregate>>, neighbourhoods: usize) -> Self {
        Self {
            cells: rows.into_iter().flatten().collect(),
            neighbourhoods,
        }
    }

    /// Returns the anchor count.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the grid is rectangular by construction, so the division is exact"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn anchors(&self) -> usize {
        self.cells.len() / self.neighbourhoods
    }

    /// Returns the neighbourhood-size count.
    #[inline]
    #[must_use]
    pub(crate) const fn neighbourhoods(&self) -> usize {
        self.neighbourhoods
    }

    /// Borrows one anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// Panics when `anchor` or `neighbourhood` lies outside the grid.
    #[inline]
    #[must_use]
    pub(crate) fn anchor(&self, anchor: usize, neighbourhood: usize) -> &NeighbourhoodAggregate {
        assert!(
            neighbourhood < self.neighbourhoods,
            "the neighbourhood index must lie inside the grid",
        );
        &self.cells[anchor * self.neighbourhoods + neighbourhood]
    }

    /// Merges every anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// Panics when `neighbourhood` lies outside the grid.
    #[must_use]
    pub(crate) fn overall(&self, neighbourhood: usize) -> NeighbourhoodAggregate {
        let mut merged = self.anchor(0, neighbourhood).clone();
        for anchor in 1..self.anchors() {
            merged.merge(self.anchor(anchor, neighbourhood));
        }
        merged
    }
}

/// One probe's readings across the three space pairs.
///
/// The corpus grid ranks every non-anchor row, so its universe is
/// `rows - anchors`; the sampled grids share the comparison rows as
/// their universe. Each grid records its own universe in its
/// aggregates, so a reading is never mistaken for a measurement at
/// another scale.
#[derive(Debug)]
pub(crate) struct ProbeReadings {
    /// Sampled anchor rows, in sampling order: the grids' anchor axis.
    pub anchors: Box<[NodeRowId]>,
    /// Sampled comparison rows, in sampling order: the sampled grids'
    /// shared universe.
    pub comparisons: Box<[NodeRowId]>,
    /// The neighbourhood sizes every grid reads at, in options order:
    /// the grids' neighbourhood axis.
    pub neighbourhoods: Box<[NonZero<usize>]>,
    /// Map versus representation over every non-anchor row: the
    /// corpus-exact placement reading.
    pub map_representation: ReadingGrid,
    /// Map versus representation over the comparison rows, for
    /// like-for-like comparison with the canonical readings.
    pub sampled_map_representation: ReadingGrid,
    /// Map versus canonical space over the comparison rows.
    pub sampled_map_canonical: ReadingGrid,
    /// Representation versus canonical space over the comparison rows:
    /// the representation baseline the map's canonical reading is
    /// judged against.
    pub sampled_representation_canonical: ReadingGrid,
}

/// Reads the map's neighbourhood fidelity over sampled anchors.
///
/// `node_ids`, `representations`, and `coordinates` describe the same
/// generation in row order; mapped `f32[N, 512]` and `f32[N, 2]`
/// artifacts yield the slices directly. Anchor and comparison rows are
/// sampled disjointly without replacement, and the anchors' and
/// comparison rows' canonical embeddings are fetched through the
/// dataset's probe-scoped stream before any ranking begins.
///
/// # Errors
///
/// Returns an error when the corpus cannot host the probe design, a
/// neighbourhood size violates an aggregate domain, the row count
/// exceeds the crate's `u32` row encoding, or the canonical stream
/// fails, misdelivers, or ends short.
///
/// # Panics
///
/// Panics when the input slices disagree about the row count; all
/// three describe one generation, so a mismatch is a wiring defect.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
pub(crate) async fn probe<D: Dataset>(
    dataset: &D,
    node_ids: &[D::NodeId],
    representations: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    coordinates: &[Vec2],
    options: &ProbeOptions,
    rng: impl Rng,
) -> Result<ProbeReadings, ProbeError<D::Error>> {
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

    let rows = node_ids.len();
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

    let sample = sample_indices_vec(rng, rows, anchors + comparisons).into_vec();
    let (anchor_rows, comparison_rows) = sample.split_at(anchors);

    let canonical = fetch_canonical(dataset, node_ids, &sample).await?;
    let (anchor_canonical, comparison_canonical) = canonical.split_at(anchors);

    let mut anchor_mask = BitSet::new(rows);
    for &row in anchor_rows {
        anchor_mask.insert(row);
    }

    let corpus_cells = corpus_pass(
        representations,
        coordinates,
        &anchor_mask,
        anchor_rows,
        search,
        &corpus_template,
        &options.neighbourhoods,
    );
    let sampled_cells = sampled_pass(
        representations,
        coordinates,
        anchor_canonical,
        comparison_canonical,
        anchor_rows,
        comparison_rows,
        &sampled_template,
    );

    let rungs = options.neighbourhoods.len();
    let [map_representation, map_canonical, representation_canonical] =
        transpose_pairs(sampled_cells);

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
        sampled_map_representation: ReadingGrid::from_anchor_cells(map_representation, rungs),
        sampled_map_canonical: ReadingGrid::from_anchor_cells(map_canonical, rungs),
        sampled_representation_canonical: ReadingGrid::from_anchor_cells(
            representation_canonical,
            rungs,
        ),
    })
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

/// Splits per-anchor space-pair cell triples into per-pair cell rows.
fn transpose_pairs(
    cells: Vec<[Vec<NeighbourhoodAggregate>; 3]>,
) -> [Vec<Vec<NeighbourhoodAggregate>>; 3] {
    let mut pairs = [
        Vec::with_capacity(cells.len()),
        Vec::with_capacity(cells.len()),
        Vec::with_capacity(cells.len()),
    ];
    for [first, second, third] in cells {
        pairs[0].push(first);
        pairs[1].push(second);
        pairs[2].push(third);
    }

    pairs
}

/// Fetches the sampled rows' canonical embeddings, in sample order.
///
/// The stream owes no delivery order and identifies rows only by their
/// source ids, so deliveries are matched by id bytes and checked for
/// completeness: every requested row exactly once, nothing else.
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
    let key_width = size_of::<D::NodeId>();
    let mut keys = Vec::with_capacity(sample.len() * key_width);
    for &row in sample {
        keys.extend_from_slice(node_ids[row].as_bytes());
    }
    let key = |slot: u32| &keys[slot as usize * key_width..(slot as usize + 1) * key_width];

    let mut order: Vec<u32> = (0..sample.len() as u32).collect();
    order.sort_unstable_by(|&one, &other| key(one).cmp(key(other)));

    let requests: Vec<D::NodeId> = sample.iter().map(|&row| node_ids[row]).collect();
    let mut received: Vec<Option<BoxedVecN<CANONICAL_DIMENSIONS>>> =
        sample.iter().map(|_| None).collect();
    let mut delivered = 0_usize;

    let mut stream = pin!(dataset.canonical_node_embeddings(requests.into_iter()));
    while let Some((id, embedding)) = stream.try_next().await.map_err(ProbeError::Dataset)? {
        // The search's `Err` is an insertion point, not a failure to keep.
        let position = order
            .binary_search_by(|&slot| key(slot).cmp(id.as_bytes()))
            .map_err(|_insertion| ProbeError::UnrequestedEmbedding)?;
        let slot = order[position] as usize;
        if received[slot].replace(embedding).is_none() {
            delivered += 1;
        }
    }

    if delivered != sample.len() {
        return Err(ProbeError::MissingEmbeddings {
            requested: sample.len(),
            delivered,
        });
    }

    Ok(received
        .into_iter()
        .map(|slot| slot.expect("every slot was delivered"))
        .collect())
}
