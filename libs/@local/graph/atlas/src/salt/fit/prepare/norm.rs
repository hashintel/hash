//! Statistical spot check of the representation contract.
//!
//! Every row of the persisted representation matrix promises the source contract: finite components
//! and a unit L2 norm, normalized where the data lives. [`spot_check`] verifies the promise by
//! acceptance sampling instead of recomputing it: checking [`acceptance_sample_size`] uniformly
//! sampled rows and finding all of them valid certifies, with the configured confidence, that fewer
//! than the configured defect rate of all rows violate the contract. One defective sampled row
//! refutes the contract, and the evidence lists every defective sampled row with its diagnosis.
//!
//! The check reads the rows a mapped `f32[N, 512]` artifact yields, so it faults only the sampled
//! pages; sampled rows are visited in ascending order, keeping a cold mapping's faults forward. The
//! sample is small and each row is one kernel pass, so the check runs serially.

use core::{error::Error, fmt};

use hashql_core::id::Id as _;
use rand::Rng;

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    identity::NodeRowId,
    math::AlignedVecN,
    random::{acceptance_sample_size, sample_indices_vec},
};

// The tolerance separates float noise from real defects by orders of
// magnitude on both sides: narrowing an f64-normalized 512-component
// row to f32 perturbs the squared norm by under 1e-6, while the
// nearest real failure mode - a prefix that skipped renormalization -
// keeps only the prefix's share of the parent vector's unit energy
// (1/6 for energy spread evenly over 3072 components), thousands of
// tolerances from one. The sampling budget matches the crate's other
// acceptance checks: 688 rows certify a 1% defect rate at 99.9%
// confidence when all pass.
const DEFAULT_TOLERANCE: f64 = 1e-4;
const DEFAULT_DEFECT_RATE: f64 = 0.01;
const DEFAULT_CONFIDENCE: f64 = 0.999;

/// Pinned tolerance and sampling settings for one norm spot check.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpotCheckOptions {
    /// Admitted deviation of a row's squared norm from one, two-sided. Defaults to 1e-4.
    pub tolerance: f64 = DEFAULT_TOLERANCE,
    /// Defect rate the sample size certifies, strictly inside `(0, 1)`.
    ///
    /// See [`acceptance_sample_size`]. Smaller rates grow the sample. Defaults to 0.01.
    pub defect_rate: f64 = DEFAULT_DEFECT_RATE,
    /// Confidence of the certification, strictly inside `(0, 1)`; see [`acceptance_sample_size`].
    ///
    /// Higher confidence grows the sample. Defaults to 0.999.
    pub confidence: f64 = DEFAULT_CONFIDENCE,
}

const impl Default for SpotCheckOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// One sampled row's violation of the representation contract.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum RepresentationDefect {
    /// The row carries a non-finite component.
    NonFinite { row: NodeRowId, component: usize },
    /// The row's squared norm lies outside the unit tolerance.
    Norm { row: NodeRowId, squared_norm: f32 },
}

impl fmt::Display for RepresentationDefect {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NonFinite { row, component } => write!(
                fmt,
                "row {} carries a non-finite component {component}",
                row.as_u64(),
            ),
            Self::Norm { row, squared_norm } => write!(
                fmt,
                "row {} has squared norm {squared_norm}, outside the unit tolerance",
                row.as_u64(),
            ),
        }
    }
}

/// Acceptance-sampling evidence for one matrix and contract.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct NormSpotCheck {
    /// Rows in the checked matrix.
    pub rows: usize,
    /// Distinct rows verified.
    pub sampled_rows: usize,
    /// The squared-norm tolerance the rows were judged against.
    pub tolerance: f64,
    /// The defect rate a pass certifies.
    pub defect_rate: f64,
    /// The confidence of the certification.
    pub confidence: f64,
    /// Every defective sampled row, ascending by row.
    pub defects: Vec<RepresentationDefect>,
}

impl NormSpotCheck {
    /// Returns whether every sampled row honoured the contract.
    ///
    /// A passing check certifies, with the recorded confidence, that fewer than the recorded defect
    /// rate of all rows are defective.
    #[inline]
    #[must_use]
    pub(crate) const fn passes(&self) -> bool {
        self.defects.is_empty()
    }
}

/// The spot check could not run.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum SpotCheckError {
    /// The matrix holds no rows to certify.
    Empty,
    /// A sampling budget lies outside the open unit interval.
    SampleBudget { defect_rate: f64, confidence: f64 },
}

impl fmt::Display for SpotCheckError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Empty => fmt.write_str("an empty matrix holds no contract to certify"),
            Self::SampleBudget {
                defect_rate,
                confidence,
            } => write!(
                fmt,
                "a defect rate of {defect_rate} at confidence {confidence} does not size a \
                 sample; both must lie strictly inside (0, 1)",
            ),
        }
    }
}

impl Error for SpotCheckError {}

/// Verifies the representation contract on a uniform sample of rows.
///
/// `embeddings` holds the persisted representations in row order; a mapped `f32[N, 512]` artifact
/// yields the slice directly. A corpus smaller than the sample size is checked exhaustively, making
/// the certification exact.
///
/// # Errors
///
/// Returns an error when the matrix is empty or the sampling budget lies outside the open unit
/// interval.
pub(crate) fn spot_check(
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    options: SpotCheckOptions,
    rng: impl Rng,
) -> Result<NormSpotCheck, SpotCheckError> {
    let rows = embeddings.len();
    if rows == 0 {
        return Err(SpotCheckError::Empty);
    }
    let sampled_rows = acceptance_sample_size(options.defect_rate, options.confidence)
        .ok_or(SpotCheckError::SampleBudget {
            defect_rate: options.defect_rate,
            confidence: options.confidence,
        })?
        .min(rows);

    let mut sample = sample_indices_vec(rng, rows, sampled_rows).into_vec();
    sample.sort_unstable();

    let mut defects = Vec::new();
    for row in sample {
        let id = NodeRowId::from_usize(row);
        let components = embeddings[row].as_array();

        // A non-finite component is one defect; its norm adds nothing.
        if let Some(component) = components.iter().position(|value| !value.is_finite()) {
            defects.push(RepresentationDefect::NonFinite { row: id, component });
            continue;
        }

        let squared_norm = embeddings[row].norm_squared();
        if (f64::from(squared_norm) - 1.0).abs() > options.tolerance {
            defects.push(RepresentationDefect::Norm {
                row: id,
                squared_norm,
            });
        }
    }

    Ok(NormSpotCheck {
        rows,
        sampled_rows,
        tolerance: options.tolerance,
        defect_rate: options.defect_rate,
        confidence: options.confidence,
        defects,
    })
}
