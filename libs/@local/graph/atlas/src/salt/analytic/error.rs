use core::{error::Error, fmt};

/// An invalid analytic raster or merge-tree input.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum AnalyticError {
    GridTooSmall {
        size: usize,
    },
    GridAreaOverflow {
        size: usize,
    },
    InvalidBandwidth {
        value: f64,
    },
    InvalidFraction {
        field: &'static str,
        value: f64,
    },
    NonFiniteCoordinate {
        point: usize,
        axis: usize,
        value: f64,
    },
    InvalidMass {
        point: usize,
        value: f64,
    },
    InvalidDensity {
        pixel: usize,
        value: f64,
    },
    DensityLength {
        expected: usize,
        actual: usize,
    },
}

impl fmt::Display for AnalyticError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::GridTooSmall { size } => {
                write!(
                    formatter,
                    "analytic grid size must be at least two, got {size}"
                )
            }
            Self::GridAreaOverflow { size } => {
                write!(
                    formatter,
                    "analytic grid size {size} overflows its pixel count"
                )
            }
            Self::InvalidBandwidth { value } => write!(
                formatter,
                "analytic Gaussian bandwidth must be finite and positive, got {value}"
            ),
            Self::InvalidFraction { field, value } => write!(
                formatter,
                "analytic {field} must be finite and within (0, 1], got {value}"
            ),
            Self::NonFiniteCoordinate { point, axis, value } => write!(
                formatter,
                "analytic point {point}, axis {axis} is non-finite: {value}"
            ),
            Self::InvalidMass { point, value } => write!(
                formatter,
                "analytic mass for point {point} must be finite and non-negative, got {value}"
            ),
            Self::InvalidDensity { pixel, value } => write!(
                formatter,
                "analytic density at pixel {pixel} must be finite and non-negative, got {value}"
            ),
            Self::DensityLength { expected, actual } => write!(
                formatter,
                "analytic density has {actual} pixels; expected {expected}"
            ),
        }
    }
}

impl Error for AnalyticError {}
