//! Frame writes and ladder evidence for the staged placement.

use std::{
    fs::File,
    io::{BufWriter, Write as _},
};

use camino::{Utf8Path, Utf8PathBuf};
use hashql_core::id::Id;
use zerocopy::IntoBytes as _;

use super::{super::error::ComputeError, report::RelationLossReadout};
use crate::{
    file::{
        array::{ArrayVariant, ArrayWriter, Dim},
        salt::metadata::{
            ProximalCalibrationEvidence, RefreshFractionEvidence, StabilityCertificateEvidence,
            StepEvidence, TypeRelationLoss,
        },
    },
    math::FinitePointField,
    salt::{
        ladder::StepMeasurement,
        projector::train::{BoundaryEvidence, FrozenRadius, RefreshFraction},
    },
};

/// Returns one step's scratch frame path.
pub(super) fn step_path(ladder: &Utf8Path, index: usize) -> Utf8PathBuf {
    ladder.join(format!("step-{index}.arr"))
}

/// Writes one step's frame as a scratch array file.
pub(super) fn write_frame<N>(
    path: impl AsRef<Utf8Path>,
    frame: &FinitePointField<N>,
) -> Result<(), ComputeError>
where
    N: Id,
{
    let mut writer = BufWriter::new(File::create(path.as_ref().as_std_path())?);
    let mut array = ArrayWriter::new(&mut writer, ArrayVariant::F32, &[Dim::new(2)])?;
    for point in frame.as_slice() {
        array.write_row(point.as_bytes())?;
    }
    array.finish()?;
    writer.flush()?;
    Ok(())
}

/// Joins each step's alignment measurement with its own walk's per-type loss shares.
pub(super) fn step_evidence(
    measurements: &[StepMeasurement],
    readouts: impl IntoIterator<Item = RelationLossReadout>,
) -> Vec<StepEvidence> {
    measurements
        .iter()
        .zip(readouts)
        .map(
            |(
                &StepMeasurement {
                    condition,
                    relation_loss,
                    alignment,
                    baseline_movement,
                    adjacent_movement,
                },
                readout,
            )| StepEvidence {
                relation_losses: readout
                    .per_type
                    .into_iter()
                    .map(|(relation, loss)| TypeRelationLoss { relation, loss })
                    .collect(),
                capped_relation_loss: Some(readout.capped_total),
                condition,
                relation_loss,
                alignment,
                baseline_movement,
                adjacent_movement,
            },
        )
        .collect()
}

/// Assembles the persisted calibration body of a measured boundary.
///
/// A vacuous boundary persists nothing. Its measurement holds no population, so a reader's
/// `None` means nothing was measured rather than a zero-valued body.
pub(super) fn calibration_evidence(
    boundary: &BoundaryEvidence,
    fractions: &[RefreshFraction],
) -> Option<ProximalCalibrationEvidence> {
    let FrozenRadius::Measured { radius } = boundary.radius else {
        return None;
    };

    let stability = boundary
        .calibration
        .stability
        .as_ref()
        .expect("a measured boundary carries its evaluated certificate");

    Some(ProximalCalibrationEvidence {
        radius,
        types: boundary.calibration.types.iter().map(From::from).collect(),
        fractions: fractions
            .iter()
            .map(|reading| RefreshFractionEvidence {
                step: reading.step as u64,
                fraction: reading.fraction,
            })
            .collect(),
        stability: StabilityCertificateEvidence::from(stability),
    })
}
