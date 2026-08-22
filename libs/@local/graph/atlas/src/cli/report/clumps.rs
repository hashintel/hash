//! The clump-threshold report.
//!
//! The report reads the grouping's shape at each candidate ε over a published table.

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use crate::salt::quality::report::calibration::{
    self, Calibration, CalibrationError, DEFAULT_EPSILONS,
};

/// Table and threshold settings of one clump calibration.
#[derive(Debug, Args)]
pub(crate) struct ClumpArgs {
    /// The published k-NN table the report reads the grouping from.
    #[arg(long, value_hint = ValueHint::FilePath)]
    table: Utf8PathBuf,

    /// Candidate distance thresholds, in the order the report lists them.
    #[arg(long = "epsilon", value_delimiter = ',', default_values_t = DEFAULT_EPSILONS.to_vec())]
    epsilons: Vec<f32>,
}

impl ClumpArgs {
    /// Reads the grouping's shape at every candidate threshold.
    ///
    /// # Errors
    ///
    /// Returns a [`CalibrationError`] when the report cannot open the table or the file does not
    /// hold a k-NN table.
    pub(super) fn run(self) -> Result<Calibration, CalibrationError> {
        calibration::calibrate(&self.table, &self.epsilons)
    }
}
