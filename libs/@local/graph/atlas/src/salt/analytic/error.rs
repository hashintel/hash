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
    GridTooLarge {
        size: usize,
        maximum: usize,
    },
    Allocation {
        buffer: &'static str,
        elements: usize,
    },
    InvalidBandwidth {
        value: f64,
    },
    InvalidFraction {
        field: &'static str,
        value: f64,
    },
    InvalidRegionLimit {
        value: usize,
    },
    RegionLabelPoint {
        point: usize,
        count: usize,
    },
    InvalidLabelImportance {
        point: usize,
        value: f64,
    },
    EmptyRegionLabel {
        point: usize,
    },
    NonFiniteCoordinate {
        point: usize,
        axis: usize,
        value: f64,
    },
    NonFiniteExtent {
        axis: usize,
        minimum: f64,
        maximum: f64,
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
            Self::GridTooLarge { size, maximum } => write!(
                formatter,
                "analytic grid size {size} exceeds the supported maximum {maximum}"
            ),
            Self::Allocation { buffer, elements } => write!(
                formatter,
                "unable to allocate {elements} elements for analytic buffer {buffer}"
            ),
            Self::InvalidBandwidth { value } => write!(
                formatter,
                "analytic Gaussian bandwidth must be finite and positive, got {value}"
            ),
            Self::InvalidFraction { field, value } => write!(
                formatter,
                "analytic {field} must be finite and within (0, 1], got {value}"
            ),
            Self::InvalidRegionLimit { value } => write!(
                formatter,
                "analytic maximum region count must be positive and fit u32, got {value}"
            ),
            Self::RegionLabelPoint { point, count } => write!(
                formatter,
                "analytic region-label point {point} is outside the {count}-point region map"
            ),
            Self::InvalidLabelImportance { point, value } => write!(
                formatter,
                "analytic region-label importance for point {point} must be finite and \
                 non-negative, got {value}"
            ),
            Self::EmptyRegionLabel { point } => {
                write!(
                    formatter,
                    "analytic region-label point {point} has an empty label"
                )
            }
            Self::NonFiniteCoordinate { point, axis, value } => write!(
                formatter,
                "analytic point {point}, axis {axis} is non-finite: {value}"
            ),
            Self::NonFiniteExtent {
                axis,
                minimum,
                maximum,
            } => write!(
                formatter,
                "analytic coordinate extent on axis {axis} is non-finite: minimum={minimum}, \
                 maximum={maximum}"
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
