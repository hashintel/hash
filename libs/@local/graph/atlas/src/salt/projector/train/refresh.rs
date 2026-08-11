//! The refresh tick.
//!
//! Whole-corpus forwards, per-rung local scales, two-extreme hard-negative mining, and displacement
//! telemetry.
//!
//! Local scales, mined negatives, and the displacement field are all defined over current
//! coordinates, and current coordinates under a conditioned model are one frame per lens rung. A
//! tick forwards the corpus at the rungs it needs - both lens extremes always, every rung when
//! relation training consumes scale tables - and derives everything from those shared frames: one
//! scale table per rung, hard negatives mined at both extremes and pooled by maximum weight, and
//! the per-node displacement between the extremes.
//!
//! Ticks run at a configured cadence rather than per step. The artifacts a tick produces stay stale
//! between ticks, and that staleness is what keeps their cost off the step path.

use core::{error::Error, fmt, num::NonZero, ops::Range};

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    RUNGS,
    batch::{NodeColumns, SupportAnchor},
    metrics::{DegreeDeciles, DisplacementSummary, TypeParticipants},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{NonFinitePoint, NonNegative, Vec2},
    progress::Progress,
    salt::{
        knn::table::KnnView,
        projector::{
            miner::{HardNegativeMiner, MinedFrame, SpatialField, SpatialFieldError},
            model::{Projector, ProjectorInput},
            scale::LocalScales,
        },
    },
};

/// A refresh tick failed.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum RefreshError<N> {
    /// A corpus forward produced a non-finite coordinate: training diverged at this row and rung.
    Diverged { row: N, eta: NonNegative },
    /// A local scale came out non-finite at this row and rung.
    NonFiniteScale { row: N, eta: NonNegative },
}

impl<N> RefreshError<N> {
    /// Maps the row the error names into another row domain.
    pub(crate) fn map_rows<M>(self, row: impl FnOnce(N) -> M) -> RefreshError<M> {
        match self {
            Self::Diverged { row: diverged, eta } => RefreshError::Diverged {
                row: row(diverged),
                eta,
            },
            Self::NonFiniteScale { row: diverged, eta } => RefreshError::NonFiniteScale {
                row: row(diverged),
                eta,
            },
        }
    }
}

impl<N> fmt::Display for RefreshError<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Diverged { row, eta } => write!(
                fmt,
                "training diverged: row {row} projected to a non-finite coordinate at rung {eta}",
            ),
            Self::NonFiniteScale { row, eta } => write!(
                fmt,
                "training diverged: row {row} measured a non-finite local scale at rung {eta}",
            ),
        }
    }
}

impl<N> Error for RefreshError<N> where N: fmt::Debug + fmt::Display {}

/// One refresh tick's artifacts.
#[derive(Debug)]
pub(crate) struct RefreshOutcome<N> {
    /// The low rung's forwarded frame.
    ///
    /// The tick's own artifacts consume it in place; it rides out for the boundary-drift
    /// instrument, which re-measures the reviewed mass fraction over the same rung the radius
    /// froze on.
    pub frame: IdVec<N, Vec2>,
    /// Hard negatives mined at both lens extremes, pooled by maximum weight.
    pub mined: MinedFrame<N>,
    /// One local-scale table per rung, in [`RUNGS`] order.
    ///
    /// Present exactly when the tick ran with scales.
    pub scales: Option<[LocalScales<N>; RUNGS.len()]>,
    /// The displacement field between the lens extremes.
    pub displacement: DisplacementSummary,
}

/// The corpus rows a run reports into [`Progress::projector_snapshot`].
///
/// An observer's appetite ([`Progress::projector_sample_size`]) buys a fixed set of rows, chosen
/// before the loop and reported at every tick, so a watcher sees the same points moving rather than
/// a fresh cloud each time. Landmark rows come first, because they are the skeleton the placement
/// hangs on and a renderer draws them apart. They take at most half the budget, so a landmark-rich
/// corpus still shows its interior. The rest is an even stride over the corpus rows no landmark
/// holds, so the two shares partition the sample by role: every reported point past the landmark
/// prefix is an ordinary row.
///
/// The choice is deterministic by construction and consumes no randomness: an observer cannot move
/// the run's draws, so a run publishes the same placement whether or not anything watches.
#[derive(Debug, Default)]
pub(super) struct SnapshotSample<N> {
    /// The sampled rows, with the landmark share first and the strided share after it.
    rows: Vec<N>,
    /// How many leading entries of `rows` are landmark rows.
    landmarks: usize,
}

impl<N> SnapshotSample<N>
where
    N: Id,
{
    /// Chooses at most `budget` rows of a `rows`-row corpus to report.
    ///
    /// A zero budget - the default observer's - selects nothing, and every later report is a no-op.
    /// Selection drops landmark rows outside the corpus rather than trusting them. The trainer's
    /// own admission rejects them, and a sample is not the place to discover it.
    pub(super) fn select(rows: usize, landmarks: &[SupportAnchor<N>], budget: usize) -> Self {
        if budget == 0 || rows == 0 {
            // The zero-budget path allocates nothing and sorts nothing, so every later report is a
            // no-op.
            return Self {
                rows: Vec::new(),
                landmarks: 0,
            };
        }

        let mut anchored: Vec<_> = landmarks
            .iter()
            .map(|anchor| anchor.row)
            .filter(|&row| row.as_usize() < rows)
            .collect();
        anchored.sort_unstable();
        anchored.dedup();

        // The interior keeps at least half the budget wherever it has the rows for it, and whatever
        // the skeleton cannot fill comes back to it - a budget buys as many rows as the
        // corpus has.
        let interior = rows - anchored.len();
        let skeleton_share = (budget - budget.div_ceil(2).min(interior)).min(anchored.len());
        let interior_share = (budget - skeleton_share).min(interior);

        let mut sample: Vec<_> = even_ranks(anchored.len(), skeleton_share)
            .map(|rank| anchored[rank])
            .collect();

        // The corpus is not walked to find its unheld rows: the
        // `rank`-th of them sits `rank` places along plus one for every
        // landmark at or before it, and the ranks arrive in order, so
        // one pass over the sorted landmarks resolves every pick.
        let mut passed = 0;
        sample.extend(even_ranks(interior, interior_share).map(|rank| {
            while passed < anchored.len() && anchored[passed].as_usize() <= rank + passed {
                passed += 1;
            }

            N::from_usize(rank + passed)
        }));

        Self {
            rows: sample,
            landmarks: skeleton_share,
        }
    }

    /// Reports the sampled rows of one frame to the observer.
    pub(super) fn report<P: Progress>(&self, frame: &IdSlice<N, Vec2>, progress: &P) {
        if self.rows.is_empty() {
            return;
        }

        let positions: Vec<Vec2> = self.rows.iter().map(|&row| frame[row]).collect();
        progress.projector_snapshot(&positions, self.landmarks);
    }
}

/// Picks `count` of `len` positions, evenly spread across the sequence.
///
/// The walk is a Bresenham accumulator. Every position adds `count` and every crossing of `len`
/// takes one, so a `count` at or below `len` picks exactly `count` positions at an even spacing.
/// The walk needs no division, which is also why the spacing is exact rather than rounded.
fn even_ranks(len: usize, count: usize) -> impl Iterator<Item = usize> {
    let mut accumulator = 0;
    (0..len).filter(move |_rank| {
        accumulator += count;

        let crossed = accumulator >= len;
        if crossed {
            accumulator -= len;
        }

        crossed
    })
}

/// The tick-invariant refresh state.
///
/// The corpus inputs, the miner, and the telemetry axes, bound once per training run.
pub(super) struct Refresh<'run, N> {
    /// The per-row model input columns.
    pub columns: NodeColumns<'run, N>,
    /// The neighbour table local scales measure over.
    pub knn: KnnView<'run, N>,
    /// The hard-negative miner.
    pub miner: HardNegativeMiner<'run, N>,
    /// The per-type telemetry participants.
    pub participants: TypeParticipants<N>,
    /// Rows per corpus-forward slice.
    pub forward_rows: NonZero<usize>,
}

impl<N> Refresh<'_, N>
where
    N: Id,
{
    /// Runs one refresh tick over the current model.
    ///
    /// `with_scales` selects the post-boundary shape, where the tick forwards every rung and
    /// measures each one into a scale table. Without it the tick forwards only the two extremes.
    /// The opening semantic-only segment and the vacuous-relation run consume no scale tables, so a
    /// middle-rung forward is dead weight.
    ///
    /// The tick is where the whole corpus exists in coordinates, so it reports `sample`'s rows of
    /// the low rung's frame to `progress`. That is the same frame the miner and the displacement
    /// summary read, retained no longer than they retain it.
    ///
    /// # Errors
    ///
    /// Returns an error when a forward pass produces a non-finite coordinate or scale (training
    /// diverged), or when the corpus exceeds the spatial index's row encoding.
    pub(super) fn tick<B: Backend<FloatElem = f32>, P: Progress>(
        &self,
        model: &Projector<B>,
        deciles: &DegreeDeciles<N>,
        with_scales: bool,
        device: &B::Device,
        sample: &SnapshotSample<N>,
        progress: &P,
    ) -> Result<RefreshOutcome<N>, RefreshError<N>> {
        let [low_eta, middle_eta, high_eta] = RUNGS;

        let low = forward(model, self.columns, low_eta, self.forward_rows, device)?;
        sample.report(&low, progress);
        let high = forward(model, self.columns, high_eta, self.forward_rows, device)?;

        let scales = if with_scales {
            let middle = forward(model, self.columns, middle_eta, self.forward_rows, device)?;
            Some([
                scales(&low, &self.knn, low_eta)?,
                scales(&middle, &self.knn, middle_eta)?,
                scales(&high, &self.knn, high_eta)?,
            ])
        } else {
            None
        };

        let mined = {
            let field = SpatialField::new(&low).map_err(|error| field_error(error, low_eta))?;
            let mined_low = self.miner.mine(&field);
            let field = SpatialField::new(&high).map_err(|error| field_error(error, high_eta))?;
            mined_low.pool(&self.miner.mine(&field))
        };

        let displacement = DisplacementSummary::measure(&low, &high, &self.participants, deciles);

        Ok(RefreshOutcome {
            frame: low,
            mined,
            scales,
            displacement,
        })
    }
}

/// Projects the whole corpus at one rung, in bounded row slices.
///
/// `forward_rows` bounds each slice's row count, and with it the peak device memory of a corpus
/// forward; the frame it returns is identical to a single whole-corpus pass because the model maps
/// rows independently of each other.
///
/// # Errors
///
/// Returns an error when a projected coordinate is non-finite: training diverged.
pub(crate) fn forward<N, B: Backend<FloatElem = f32>>(
    model: &Projector<B>,
    columns: NodeColumns<'_, N>,
    eta: NonNegative,
    forward_rows: NonZero<usize>,
    device: &B::Device,
) -> Result<IdVec<N, Vec2>, RefreshError<N>>
where
    N: Id,
{
    let rows = columns.representations.len();
    let mut frame = IdVec::with_capacity(rows);
    let mut start = 0;

    while start < rows {
        let end = (start + forward_rows.get()).min(rows);
        let coordinates = model.forward(slice_input(columns, start..end, eta, device));
        let values = coordinates
            .into_data()
            .to_vec::<f32>()
            .expect("the projector's coordinates are an f32 tensor");
        let points =
            Vec2::from_slice(&values).expect("a [rows, 2] tensor reads back an even length");
        for (offset, point) in points.iter().enumerate() {
            if !point.is_finite() {
                return Err(RefreshError::Diverged {
                    row: N::from_usize(start + offset),
                    eta,
                });
            }
        }

        frame.extend_from_slice(IdSlice::from_raw(points));
        start = end;
    }
    Ok(frame)
}

/// Measures one rung's local scales over its forwarded frame.
///
/// # Errors
///
/// Returns an error when a scale comes out non-finite: the frame holds pre-divergence coordinates
/// whose distances overflow.
pub(crate) fn scales<N>(
    frame: &IdSlice<N, Vec2>,
    knn: &KnnView<'_, N>,
    eta: NonNegative,
) -> Result<LocalScales<N>, RefreshError<N>>
where
    N: Id,
{
    LocalScales::compute(frame, knn).map_err(|error| RefreshError::NonFiniteScale {
        row: error.row,
        eta,
    })
}

/// Maps a spatial-index failure onto the tick's error.
fn field_error<N>(error: SpatialFieldError<N>, eta: NonNegative) -> RefreshError<N> {
    match error {
        // Unreachable in practice: `forward` checked every coordinate.
        SpatialFieldError::NonFinite(NonFinitePoint { row }) => RefreshError::Diverged { row, eta },
    }
}

/// Materializes one row slice's model input at a rung on `device`.
fn slice_input<N, B: Backend>(
    columns: NodeColumns<'_, N>,
    range: Range<usize>,
    eta: NonNegative,
    device: &B::Device,
) -> ProjectorInput<B>
where
    N: Id,
{
    let rows = range.len();
    let range = N::from_usize(range.start)..N::from_usize(range.end);
    let mut representation = Vec::with_capacity(rows * PROJECTOR_DIMENSIONS);
    let mut roles = Vec::with_capacity(rows);
    for (vector, role) in columns.representations[range.clone()]
        .iter()
        .zip(&columns.roles[range])
    {
        representation.extend_from_slice(vector.as_array());
        roles.push(i64::from(role.index()));
    }

    ProjectorInput {
        representation: Tensor::from_data(
            TensorData::new(representation, [rows, PROJECTOR_DIMENSIONS]),
            device,
        ),
        roles: Tensor::<B, 1, Int>::from_data(TensorData::new(roles, [rows]), device),
        condition: Tensor::from_data(TensorData::new(vec![eta.get(); rows], [rows, 1]), device),
    }
}
