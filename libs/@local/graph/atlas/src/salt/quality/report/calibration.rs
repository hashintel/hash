//! The clump-threshold calibration over a published k-NN table.
//!
//! ε is a calibrated configuration value, so its default must carry measured corpus structure
//! rather than a guess: the calibration opens a published table and reads the grouping's shape -
//! clump count, multi-row group count, covered rows - at every candidate threshold. A candidate is
//! judged by how closely it reproduces the audited corpus shape and by whether the flagged
//! subgroups it is expected to resolve actually restore.
//!
//! The calibration observes a published artifact and never participates in a fit: it reads the
//! stored table, so a reading describes the grouping a run at that threshold would have built.

use core::{
    error::Error,
    fmt::{self, Display},
};
use std::path::Path;

use crate::{
    file::sprs::read::{OpenSprsError, SprsFile},
    salt::{
        knn::artifact::{InvalidKnnFile, KnnArchive},
        quality::clump::{Clumps, DEFAULT_EPSILON},
    },
};

/// The candidate thresholds swept by default: one below the calibrated plateau, both of its edges,
/// the deployed value, and the percolation boundary above it, so a bare invocation re-derives the
/// evidence [`DEFAULT_EPSILON`] was pinned on.
pub(crate) const DEFAULT_EPSILONS: &[f32] = &[0.0005, 0.0012, DEFAULT_EPSILON, 0.0028, 0.0045];

/// The grouping's shape at one candidate threshold.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Reading {
    /// The distance threshold the grouping was built at.
    pub epsilon: f32,
    /// The clump count, singletons included.
    pub clumps: usize,
    /// Clumps holding at least two rows.
    pub groups: usize,
    /// Rows inside multi-row clumps.
    pub grouped_rows: usize,
}

impl Reading {
    /// The share of the corpus that sits inside a multi-row clump.
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

    /// The mean size of a multi-row clump.
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

/// A calibration input's refusal: the path does not hold a readable k-NN table.
///
/// Splices into the chain transparently: the display text and the sources are the wrapped
/// crate-internal fault's, unchanged.
#[derive(Debug)]
pub(crate) struct CalibrationError(CalibrationFault);

/// The two ways the table fails to open.
#[derive(Debug)]
enum CalibrationFault {
    /// The sparse file could not be opened.
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

/// Reads the grouping shape of the k-NN table at `path` for every candidate threshold.
///
/// # Errors
///
/// Returns a [`CalibrationError`] when the file cannot be opened or does not hold a valid k-NN
/// table.
pub(crate) fn calibrate(
    path: impl AsRef<Path>,
    epsilons: &[f32],
) -> Result<Calibration, CalibrationError> {
    let table = KnnArchive::new(
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
