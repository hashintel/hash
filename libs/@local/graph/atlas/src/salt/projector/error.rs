use core::{error::Error, fmt};

/// An invalid projector architecture or forward input.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ProjectorError {
    ZeroWidth,
    ZeroResidualBlocks,
    TooFewRoles {
        count: usize,
    },
    ZeroRoleDimensions,
    DimensionOverflow,
    RepresentationShape {
        rows: usize,
        dimensions: usize,
    },
    RoleShape {
        rows: usize,
        columns: usize,
        expected_rows: usize,
    },
    TypeContextShape {
        rows: usize,
        dimensions: usize,
        expected_rows: usize,
        expected_dimensions: usize,
    },
    MissingTypeContext {
        dimensions: usize,
    },
    UnexpectedTypeContext,
    ConditionShape {
        rows: usize,
        dimensions: usize,
        expected_rows: usize,
    },
}

impl fmt::Display for ProjectorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ZeroWidth => formatter.write_str("projector hidden width must be positive"),
            Self::ZeroResidualBlocks => {
                formatter.write_str("projector requires at least one residual block")
            }
            Self::TooFewRoles { count } => {
                write!(
                    formatter,
                    "projector role vocabulary requires at least three entries, got {count}"
                )
            }
            Self::ZeroRoleDimensions => {
                formatter.write_str("projector role embedding width must be positive")
            }
            Self::DimensionOverflow => {
                formatter.write_str("projector feature dimensions overflow usize")
            }
            Self::RepresentationShape { rows, dimensions } => write!(
                formatter,
                "projector representation has shape [{rows}, {dimensions}], expected 512 \
                 components per row"
            ),
            Self::RoleShape {
                rows,
                columns,
                expected_rows,
            } => write!(
                formatter,
                "projector roles have shape [{rows}, {columns}], expected [{expected_rows}, 1]"
            ),
            Self::TypeContextShape {
                rows,
                dimensions,
                expected_rows,
                expected_dimensions,
            } => write!(
                formatter,
                "projector type context has shape [{rows}, {dimensions}], expected \
                 [{expected_rows}, {expected_dimensions}]"
            ),
            Self::MissingTypeContext { dimensions } => write!(
                formatter,
                "projector requires {dimensions}-component type context"
            ),
            Self::UnexpectedTypeContext => {
                formatter.write_str("projector was configured without type context")
            }
            Self::ConditionShape {
                rows,
                dimensions,
                expected_rows,
            } => write!(
                formatter,
                "projector condition has shape [{rows}, {dimensions}], expected [{expected_rows}, \
                 1]"
            ),
        }
    }
}

impl Error for ProjectorError {}

/// An invalid projector objective value or coefficient.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ObjectiveError {
    InvalidAffinity {
        a: f64,
        b: f64,
        epsilon: f64,
        maximum_positive_weight: f64,
        maximum_negative_weight: f64,
    },
    InvalidRelationEnergy {
        coincident_radius: f64,
        proximal_radius: f64,
        coincident_huber_delta: f64,
        proximal_temperature: f64,
        epsilon: f64,
    },
    InvalidDistance {
        value: f64,
    },
    InvalidWeight {
        value: f64,
    },
    InvalidLocalScale {
        value: f64,
    },
    CoordinateRowCount {
        expected: usize,
        actual: usize,
    },
    NonFiniteCoordinate {
        row: usize,
        axis: usize,
        value: f64,
    },
    InvalidGradientBudget {
        positive: f64,
        total: f64,
        semantic_floor: f64,
        epsilon: f64,
    },
    NonFiniteGradient,
}

impl fmt::Display for ObjectiveError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidAffinity {
                a,
                b,
                epsilon,
                maximum_positive_weight,
                maximum_negative_weight,
            } => write!(
                formatter,
                "semantic affinity requires positive finite a, b, epsilon, and weight caps; got \
                 a={a}, b={b}, epsilon={epsilon}, positive cap={maximum_positive_weight}, \
                 negative cap={maximum_negative_weight}"
            ),
            Self::InvalidRelationEnergy {
                coincident_radius,
                proximal_radius,
                coincident_huber_delta,
                proximal_temperature,
                epsilon,
            } => write!(
                formatter,
                "relation energy requires 0 <= coincident radius < proximal radius and positive \
                 finite delta, temperature, and epsilon; got radii=({coincident_radius}, \
                 {proximal_radius}), delta={coincident_huber_delta}, \
                 temperature={proximal_temperature}, epsilon={epsilon}"
            ),
            Self::InvalidDistance { value } => {
                write!(
                    formatter,
                    "objective distance must be finite and non-negative, got {value}"
                )
            }
            Self::InvalidWeight { value } => {
                write!(
                    formatter,
                    "objective weight must be finite and non-negative, got {value}"
                )
            }
            Self::InvalidLocalScale { value } => write!(
                formatter,
                "relation local scale must be finite and non-negative, got {value}"
            ),
            Self::CoordinateRowCount { expected, actual } => write!(
                formatter,
                "coordinate field has {actual} rows; semantic graph has {expected}"
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "coordinate at row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::InvalidGradientBudget {
                positive,
                total,
                semantic_floor,
                epsilon,
            } => write!(
                formatter,
                "gradient budget requires 0 <= positive <= total and positive finite floor and \
                 epsilon; got positive={positive}, total={total}, floor={semantic_floor}, \
                 epsilon={epsilon}"
            ),
            Self::NonFiniteGradient => {
                formatter.write_str("coordinate-space gradient must be finite")
            }
        }
    }
}

impl Error for ObjectiveError {}
