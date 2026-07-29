//! The clump-threshold report: the grouping's shape at each candidate ε over a published table.

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use crate::salt::quality::report::calibration::{
    self, Calibration, CalibrationError, DEFAULT_EPSILONS,
};

/// Table and threshold settings of one clump calibration.
#[derive(Debug, Args)]
pub(crate) struct ClumpArgs {
    /// The published k-NN table the grouping is read from.
    #[arg(long, value_hint = ValueHint::FilePath)]
    table: Utf8PathBuf,

    /// Candidate distance thresholds, in the order they are reported.
    #[arg(long = "epsilon", value_delimiter = ',', default_values_t = DEFAULT_EPSILONS.to_vec())]
    epsilons: Vec<f32>,
}

impl ClumpArgs {
    /// Reads the grouping's shape at every candidate threshold.
    ///
    /// # Errors
    ///
    /// Returns a [`CalibrationError`] when the table cannot be opened or does not hold a k-NN
    /// table.
    pub(super) fn run(self) -> Result<Calibration, CalibrationError> {
        calibration::calibrate(&self.table, &self.epsilons)
    }
}
