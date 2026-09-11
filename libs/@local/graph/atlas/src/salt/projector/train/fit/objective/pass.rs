//! The re-indexing into the pass-local row domain and the surrogate deposit out of it.

use burn::tensor::{Tensor, TensorData, backend::AutodiffBackend};
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{super::super::step::flatten, TargetRowId};
use crate::salt::projector::{
    budget,
    gauge::GaugeOrdinal,
    loss::{GradientField, TargetUnit},
};

/// One step's re-indexed pass domain.
pub(super) struct LocalPass<N> {
    /// The participating corpus rows, ascending and distinct: the local-to-corpus row map.
    pub rows: IdVec<TargetRowId, N>,
    /// The units with local endpoints.
    pub units: Vec<TargetUnit<TargetRowId>>,
    /// Each gauge anchor's local position, in draw order.
    pub anchors: IdVec<GaugeOrdinal, TargetRowId>,
}

impl<N> LocalPass<N>
where
    N: Id,
{
    /// Re-indexes the unit endpoints and the whole gauge into the pass's dense local domain.
    pub(super) fn new(units: &[TargetUnit<N>], gauge: &IdSlice<GaugeOrdinal, N>) -> Self {
        let mut rows: Vec<N> = Vec::with_capacity(units.len() * 2 + gauge.len());
        for unit in units {
            rows.extend([unit.source, unit.target]);
        }

        rows.extend(gauge.iter().copied());
        rows.sort_unstable();
        rows.dedup();

        let local = |row: N| {
            let position = rows
                .binary_search(&row)
                .expect("every re-indexed row was collected above");

            TargetRowId::from_usize(position)
        };

        let units = units
            .iter()
            .map(|unit| TargetUnit {
                source: local(unit.source),
                target: local(unit.target),
                ruler: unit.ruler,
                weight: unit.weight,
                inclusion: unit.inclusion,
            })
            .collect();
        let anchors = gauge.iter().map(|&row| local(row)).collect();

        Self {
            rows: IdVec::from_raw(rows),
            units,
            anchors,
        }
    }
}

/// Deposits one step's hand-gradient field through its forward tensor.
///
/// The gradient tensor matches the forward's padded shape, and the padding rows carry exactly
/// zero force.
pub(super) fn deposit<B: AutodiffBackend<FloatElem = f32>>(
    coordinates: Tensor<B, 2>,
    field: &GradientField<TargetRowId>,
    device: &B::Device,
) -> Tensor<B, 1> {
    let padded = coordinates.dims()[0];
    let mut gradient = flatten(field.as_slice());
    gradient.resize(padded * 2, 0.0);

    budget::surrogate(
        coordinates,
        Tensor::from_data(TensorData::new(gradient, [padded, 2]), device),
    )
}
