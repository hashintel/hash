//! The clump-threshold calibration over a published k-NN table.
//!
//! [`calibrate`] measures clump count, multi-row group count and covered rows at each candidate ε.
//! Reusing one published table isolates the effect of the threshold on connected-component
//! grouping. Compare these counts and their trends before choosing ε for that generation, then
//! assess subgroup recall to judge its diagnostic effect. This sweep measures grouping shape alone
//! and selects no threshold.

use core::{
    error::Error,
    fmt::{self, Display},
};
use std::path::Path;

use crate::{
    file::sprs::read::{OpenSprsError, SprsFile},
    identity::NodeRowId,
    salt::{
        knn::artifact::{InvalidKnnFile, KnnArchive},
        quality::clump::{Clumps, DEFAULT_EPSILON},
    },
};

/// Default sweep thresholds around [`DEFAULT_EPSILON`].
///
/// The interval 0.0012 to 0.0028 spans the plateau in some recorded development-corpus fits. The
/// outer points 0.0005 and 0.0045 sample below and above it. Another generation may have no plateau
/// over this interval.
pub(crate) const DEFAULT_EPSILONS: &[f32] = &[0.0005, 0.0012, DEFAULT_EPSILON, 0.0028, 0.0045];

/// The grouping's shape at one candidate threshold.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Reading {
    /// The distance threshold that formed the grouping.
    pub epsilon: f32,
    /// The clump count, singletons included.
    pub clumps: usize,
    /// Clumps holding at least two rows.
    pub groups: usize,
    /// Rows inside multi-row clumps.
    pub grouped_rows: usize,
}

impl Reading {
    /// Returns the grouped-row fraction, or zero for an empty corpus.
    #[expect(
        clippy::cast_precision_loss,
        reason = "row counts stay far inside the f64 mantissa"
    )]
    fn coverage(&self, rows: usize) -> f64 {
        if rows == 0 {
            return 0.0;
        }

        self.grouped_rows as f64 / rows as f64
    }

    /// Returns the mean multi-row clump size, or zero when no such clump exists.
    #[expect(
        clippy::cast_precision_loss,
        reason = "row counts stay far inside the f64 mantissa"
    )]
    fn mean_group_size(&self) -> f64 {
        if self.groups == 0 {
            return 0.0;
        }

        self.grouped_rows as f64 / self.groups as f64
    }
}

/// One published table's grouping shape across candidate thresholds.
#[derive(Debug)]
pub(crate) struct Calibration {
    /// The table's node-row count.
    pub rows: usize,
    /// Stored non-self neighbours per row.
    pub neighbours: usize,
    /// One reading per candidate threshold, in argument order.
    pub readings: Vec<Reading>,
}

impl Display for Calibration {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt, "rows {}  neighbours {}", self.rows, self.neighbours)?;
        writeln!(fmt)?;
        writeln!(
            fmt,
            "{:>9} {:>12} {:>12} {:>14} {:>10} {:>10}",
            "epsilon", "clumps", "groups", "grouped_rows", "coverage", "mean_size",
        )?;

        for reading in &self.readings {
            writeln!(
                fmt,
                "{:>9.4} {:>12} {:>12} {:>14} {:>9.1}% {:>10.2}",
                reading.epsilon,
                reading.clumps,
                reading.groups,
                reading.grouped_rows,
                reading.coverage(self.rows) * 100.0,
                reading.mean_group_size(),
            )?;
        }

        Ok(())
    }
}

/// A failure to open a k-NN table for threshold calibration.
///
/// Display text and error sources match the underlying artifact error.
#[derive(Debug)]
pub(crate) struct CalibrationError(CalibrationFault);

/// The artifact failure exposed by a calibration error.
#[derive(Debug)]
enum CalibrationFault {
    /// The sparse file did not open.
    Open(OpenSprsError),
    /// The file does not hold a valid k-NN table.
    Archive(InvalidKnnFile),
}

impl Display for CalibrationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            CalibrationFault::Open(error) => Display::fmt(error, fmt),
            CalibrationFault::Archive(error) => Display::fmt(error, fmt),
        }
    }
}

impl Error for CalibrationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &self.0 {
            CalibrationFault::Open(error) => error.source(),
            CalibrationFault::Archive(error) => error.source(),
        }
    }
}

/// Measures a published table's grouping shape at each candidate threshold.
///
/// Results preserve `epsilons` order. Threshold comparisons follow [`Clumps::from_knn`], including
/// its NaN and infinity behavior. Backing file bytes must remain immutable throughout the mapping's
/// lifetime.
///
/// # Errors
///
/// Returns a [`CalibrationError`] when the file fails to open or does not hold a valid k-NN table.
pub(crate) fn calibrate(
    path: impl AsRef<Path>,
    epsilons: &[f32],
) -> Result<Calibration, CalibrationError> {
    let table: KnnArchive<NodeRowId> = KnnArchive::new(
        SprsFile::open(path).map_err(|error| CalibrationError(CalibrationFault::Open(error)))?,
    )
    .map_err(|error| CalibrationError(CalibrationFault::Archive(error)))?;
    let view = table.view();

    Ok(Calibration {
        rows: view.rows(),
        neighbours: view.neighbours(),
        readings: epsilons
            .iter()
            .map(|&epsilon| {
                let clumps = Clumps::from_knn(&view, epsilon);
                Reading {
                    epsilon,
                    clumps: clumps.clumps(),
                    groups: clumps.groups(),
                    grouped_rows: clumps.grouped_rows(),
                }
            })
            .collect(),
    })
}
