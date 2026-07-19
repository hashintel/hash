//! Measurement seam for the clump-threshold calibration sweep.
//!
//! The clump epsilon is a calibrated configuration value: its default
//! must carry measured corpus structure, not a guess. [`sweep`] opens
//! a published k-NN table and reads the grouping's shape at each
//! candidate threshold, so the calibration run is one command against
//! a live artifact and the chosen default can cite its own evidence.

use std::path::Path;

use super::clump::Clumps;
use crate::{file::sprs::read::SprsFile, salt::knn::artifact::MappedKnn};

/// One published table's grouping shape across candidate thresholds.
#[derive(Debug)]
pub struct Sweep {
    /// The table's node-row count.
    pub rows: usize,
    /// Stored non-self neighbours per row.
    pub neighbours: usize,
    /// One reading per candidate threshold, in argument order.
    pub readings: Vec<SweepReading>,
}

/// The grouping's shape at one candidate threshold.
#[derive(Debug, Copy, Clone)]
pub struct SweepReading {
    /// The distance threshold the grouping was built at.
    pub epsilon: f32,
    /// The clump count, singletons included.
    pub clumps: usize,
    /// Clumps holding at least two rows.
    pub groups: usize,
    /// Rows inside multi-row clumps.
    pub grouped_rows: usize,
}

/// Reads the grouping shape of the k-NN table at `path` for every
/// candidate threshold.
///
/// # Errors
///
/// Returns an error when the file cannot be opened or does not hold a
/// valid k-NN table.
pub fn sweep(
    path: impl AsRef<Path>,
    epsilons: &[f32],
) -> Result<Sweep, Box<dyn core::error::Error + Send + Sync>> {
    let table = MappedKnn::new(SprsFile::open(path)?)?;
    let view = table.view();

    Ok(Sweep {
        rows: view.rows(),
        neighbours: view.neighbours(),
        readings: epsilons
            .iter()
            .map(|&epsilon| {
                let clumps = Clumps::from_knn(&view, epsilon);
                SweepReading {
                    epsilon,
                    clumps: clumps.clumps(),
                    groups: clumps.groups(),
                    grouped_rows: clumps.grouped_rows(),
                }
            })
            .collect(),
    })
}
