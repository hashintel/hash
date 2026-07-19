//! The refresh tick: whole-corpus forwards, per-rung local scales,
//! two-extreme hard-negative mining, and displacement telemetry.
//!
//! Local scales, mined negatives, and the displacement field are all
//! defined over current coordinates, and current coordinates under a
//! conditioned model are one frame per lens rung. A tick forwards the
//! corpus at the rungs it needs - both lens extremes always, every
//! rung when relation training consumes scale tables - and derives
//! everything from those shared frames: one scale table per rung,
//! hard negatives mined at both extremes and pooled by maximum
//! weight, and the per-node displacement between the extremes.
//!
//! Ticks run at a configured cadence, never per step: the artifacts a
//! tick produces are deliberately stale between ticks, which is what
//! keeps their cost off the step path.

use core::{error::Error, fmt, num::NonZero, ops::Range};

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};

use super::{
    RUNGS,
    batch::NodeColumns,
    metrics::{DegreeDeciles, DisplacementSummary, TypeParticipants},
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::Vec2,
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
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum RefreshError {
    /// A corpus forward produced a non-finite coordinate: training
    /// diverged at this row and rung.
    Diverged { row: NodeRowId, eta: f32 },
    /// A local scale came out non-finite at this row and rung.
    NonFiniteScale { row: NodeRowId, eta: f32 },
    /// The corpus rows exceed the spatial index's `u32` item encoding.
    RowsExceedIndexDomain { rows: usize },
}

impl fmt::Display for RefreshError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Diverged { row, eta } => write!(
                formatter,
                "training diverged: row {} projected to a non-finite coordinate at rung {eta}",
                row.get(),
            ),
            Self::NonFiniteScale { row, eta } => write!(
                formatter,
                "training diverged: row {} measured a non-finite local scale at rung {eta}",
                row.get(),
            ),
            Self::RowsExceedIndexDomain { rows } => write!(
                formatter,
                "{rows} corpus rows exceed the spatial index's u32 item encoding"
            ),
        }
    }
}

impl Error for RefreshError {}

/// One refresh tick's artifacts.
#[derive(Debug)]
pub(crate) struct RefreshOutcome {
    /// Hard negatives mined at both lens extremes, pooled by maximum
    /// weight.
    pub mined: MinedFrame,
    /// One local-scale table per rung, in [`RUNGS`] order; present
    /// exactly when the tick ran with scales.
    pub scales: Option<[LocalScales; RUNGS.len()]>,
    /// The displacement field between the lens extremes.
    pub displacement: DisplacementSummary,
}

/// The tick-invariant refresh state: the corpus inputs, the miner, and
/// the telemetry axes, bound once per training run.
pub(super) struct Refresh<'run> {
    /// The per-row model input columns.
    pub columns: NodeColumns<'run>,
    /// The neighbour table local scales measure over.
    pub knn: KnnView<'run>,
    /// The hard-negative miner.
    pub miner: HardNegativeMiner<'run>,
    /// The per-type telemetry participants.
    pub participants: TypeParticipants,
    /// Rows per corpus-forward slice.
    pub forward_rows: NonZero<usize>,
}

impl Refresh<'_> {
    /// Runs one refresh tick over the current model.
    ///
    /// `with_scales` selects the post-boundary shape: every rung is
    /// forwarded and measured into a scale table. Without it only the
    /// two extremes are forwarded - the opening semantic-only segment
    /// and the vacuous-relation run consume no scale tables, so the
    /// middle rung's forward would be dead weight.
    ///
    /// # Errors
    ///
    /// Returns an error when a forward pass produces a non-finite
    /// coordinate or scale (training diverged), or when the corpus
    /// exceeds the spatial index's row encoding.
    pub(super) fn tick<B: Backend<FloatElem = f32>>(
        &self,
        model: &Projector<B>,
        deciles: &DegreeDeciles,
        with_scales: bool,
        device: &B::Device,
    ) -> Result<RefreshOutcome, RefreshError> {
        let [low_eta, middle_eta, high_eta] = RUNGS;
        let low = forward(model, self.columns, low_eta, self.forward_rows, device)?;
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
            mined,
            scales,
            displacement,
        })
    }
}

/// Projects the whole corpus at one rung, in bounded row slices.
///
/// `forward_rows` bounds each slice's row count, and with it the peak
/// device memory of a corpus forward; the frame it returns is
/// identical to a single whole-corpus pass because the model maps rows
/// independently of each other.
///
/// # Errors
///
/// Returns an error when a projected coordinate is non-finite:
/// training diverged.
pub(super) fn forward<B: Backend<FloatElem = f32>>(
    model: &Projector<B>,
    columns: NodeColumns<'_>,
    eta: f32,
    forward_rows: NonZero<usize>,
    device: &B::Device,
) -> Result<Vec<Vec2>, RefreshError> {
    let rows = columns.representations.len();
    let mut frame = Vec::with_capacity(rows);
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
                    row: row_id(start + offset),
                    eta,
                });
            }
        }
        frame.extend_from_slice(points);
        start = end;
    }
    Ok(frame)
}

/// Measures one rung's local scales over its forwarded frame.
///
/// # Errors
///
/// Returns an error when a scale comes out non-finite: the frame holds
/// pre-divergence coordinates whose distances overflow.
pub(super) fn scales(
    frame: &[Vec2],
    knn: &KnnView<'_>,
    eta: f32,
) -> Result<LocalScales, RefreshError> {
    LocalScales::compute(frame, knn).map_err(|error| RefreshError::NonFiniteScale {
        row: row_id(error.row),
        eta,
    })
}

/// Maps a spatial-index failure onto the tick's error.
fn field_error(error: SpatialFieldError, eta: f32) -> RefreshError {
    match error {
        // Unreachable in practice: `forward` checked every coordinate.
        SpatialFieldError::NonFinite { row } => RefreshError::Diverged {
            row: row_id(row),
            eta,
        },
        SpatialFieldError::RowsExceedIndexDomain { rows } => {
            RefreshError::RowsExceedIndexDomain { rows }
        }
    }
}

/// Materializes one row slice's model input at a rung on `device`.
fn slice_input<B: Backend>(
    columns: NodeColumns<'_>,
    range: Range<usize>,
    eta: f32,
    device: &B::Device,
) -> ProjectorInput<B> {
    let rows = range.len();
    let mut representation = Vec::with_capacity(rows * PROJECTOR_DIMENSIONS);
    let mut roles = Vec::with_capacity(rows);
    for row in range {
        representation.extend_from_slice(columns.representations[row].as_array());
        roles.push(i64::from(columns.roles[row].index()));
    }

    ProjectorInput {
        representation: Tensor::from_data(
            TensorData::new(representation, [rows, PROJECTOR_DIMENSIONS]),
            device,
        ),
        roles: Tensor::<B, 1, Int>::from_data(TensorData::new(roles, [rows]), device),
        condition: Tensor::from_data(TensorData::new(vec![eta; rows], [rows, 1]), device),
    }
}

#[inline]
fn row_id(index: usize) -> NodeRowId {
    NodeRowId::new(u64::try_from(index).expect("row indexes fit the row-id encoding"))
}
