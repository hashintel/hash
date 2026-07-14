use core::{error::Error, fmt};

/// An invalid weighted similarity-alignment input.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum AlignmentError {
    LengthMismatch {
        source: usize,
        target: usize,
        weights: usize,
    },
    Empty,
    NonFiniteCoordinate {
        row: usize,
        axis: usize,
        source: f64,
        target: f64,
    },
    InvalidWeight {
        row: usize,
        weight: f64,
    },
    ZeroTotalWeight,
    DegenerateSource,
    DegenerateOrientation,
    NonFiniteTransform,
}

impl fmt::Display for AlignmentError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::LengthMismatch {
                source,
                target,
                weights,
            } => write!(
                formatter,
                "alignment inputs have {source} source rows, {target} target rows, and {weights} \
                 weights"
            ),
            Self::Empty => formatter.write_str("alignment requires at least one anchor"),
            Self::NonFiniteCoordinate {
                row,
                axis,
                source,
                target,
            } => write!(
                formatter,
                "alignment coordinate at row {row}, axis {axis} is non-finite: source={source}, \
                 target={target}"
            ),
            Self::InvalidWeight { row, weight } => {
                write!(
                    formatter,
                    "alignment weight at row {row} must be finite and non-negative, got {weight}"
                )
            }
            Self::ZeroTotalWeight => {
                formatter.write_str("alignment requires at least one positive anchor weight")
            }
            Self::DegenerateSource => {
                formatter.write_str("alignment source anchors have no weighted spatial variance")
            }
            Self::DegenerateOrientation => formatter
                .write_str("alignment anchors do not determine a positive-scale proper rotation"),
            Self::NonFiniteTransform => {
                formatter.write_str("alignment produced a non-finite similarity transform")
            }
        }
    }
}

impl Error for AlignmentError {}
