use core::{error::Error, fmt, num::NonZeroUsize};

use burn::tensor::{Int, Tensor, TensorData, backend::Backend};

use super::{ConditionedProjector, EntityRole, ProjectorError, ProjectorInput};
use crate::salt::{graph::ProjectorEmbeddings, representation::PROJECTOR_DIMENSIONS};

/// Optional dense type context in generation-row order.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProjectorTypeContext<'context> {
    values: &'context [f32],
    rows: usize,
    dimensions: usize,
}

impl<'context> ProjectorTypeContext<'context> {
    /// Validates one row-major type-context matrix.
    ///
    /// # Errors
    ///
    /// This returns an error when the declared shape overflows or disagrees
    /// with the values, or when a component is non-finite.
    pub(crate) fn new(
        values: &'context [f32],
        rows: usize,
        dimensions: usize,
    ) -> Result<Self, ProjectorInferenceError> {
        let expected =
            rows.checked_mul(dimensions)
                .ok_or(ProjectorInferenceError::TypeContextShape {
                    rows,
                    dimensions,
                    values: values.len(),
                })?;
        if dimensions == 0 || values.len() != expected {
            return Err(ProjectorInferenceError::TypeContextShape {
                rows,
                dimensions,
                values: values.len(),
            });
        }
        if let Some(index) = values.iter().position(|value| !value.is_finite()) {
            return Err(ProjectorInferenceError::NonFiniteTypeContext {
                index,
                value: values[index],
            });
        }
        Ok(Self {
            values,
            rows,
            dimensions,
        })
    }

    #[must_use]
    #[inline]
    pub(crate) const fn values(self) -> &'context [f32] {
        self.values
    }

    #[must_use]
    #[inline]
    pub(crate) const fn rows(self) -> usize {
        self.rows
    }

    #[must_use]
    #[inline]
    pub(crate) const fn dimensions(self) -> usize {
        self.dimensions
    }
}

/// Invalid corpus inputs or model output during projector inference.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProjectorInferenceError {
    RoleCount {
        rows: usize,
        roles: usize,
    },
    TypeContextShape {
        rows: usize,
        dimensions: usize,
        values: usize,
    },
    TypeContextDimensions {
        expected: usize,
        actual: usize,
    },
    MissingTypeContext {
        dimensions: usize,
    },
    UnexpectedTypeContext,
    InvalidCondition {
        value: f32,
    },
    NonFiniteTypeContext {
        index: usize,
        value: f32,
    },
    NonFiniteCoordinate {
        row: usize,
        axis: usize,
        value: f32,
    },
    Projector(ProjectorError),
}

impl fmt::Display for ProjectorInferenceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RoleCount { rows, roles } => {
                write!(
                    formatter,
                    "projector has {rows} rows but {roles} role values"
                )
            }
            Self::TypeContextShape {
                rows,
                dimensions,
                values,
            } => write!(
                formatter,
                "projector type context for {rows} rows by {dimensions} dimensions has {values} \
                 values"
            ),
            Self::TypeContextDimensions { expected, actual } => write!(
                formatter,
                "projector expects {expected} type-context dimensions, got {actual}"
            ),
            Self::MissingTypeContext { dimensions } => {
                write!(
                    formatter,
                    "projector requires {dimensions}-component type context"
                )
            }
            Self::UnexpectedTypeContext => {
                formatter.write_str("projector was configured without type context")
            }
            Self::InvalidCondition { value } => {
                write!(
                    formatter,
                    "projector condition must be finite and non-negative, got {value}"
                )
            }
            Self::NonFiniteTypeContext { index, value } => {
                write!(
                    formatter,
                    "projector type-context value {index} is non-finite: {value}"
                )
            }
            Self::NonFiniteCoordinate { row, axis, value } => {
                write!(
                    formatter,
                    "projector coordinate row {row}, axis {axis} is non-finite: {value}"
                )
            }
            Self::Projector(error) => error.fmt(formatter),
        }
    }
}

impl Error for ProjectorInferenceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Projector(error) => Some(error),
            Self::RoleCount { .. }
            | Self::TypeContextShape { .. }
            | Self::TypeContextDimensions { .. }
            | Self::MissingTypeContext { .. }
            | Self::UnexpectedTypeContext
            | Self::InvalidCondition { .. }
            | Self::NonFiniteTypeContext { .. }
            | Self::NonFiniteCoordinate { .. } => None,
        }
    }
}

impl From<ProjectorError> for ProjectorInferenceError {
    #[inline]
    fn from(error: ProjectorError) -> Self {
        Self::Projector(error)
    }
}

/// Projects a complete generation in bounded transfer batches.
///
/// # Errors
///
/// This returns an error when corpus-side feature shapes disagree with the
/// model, any supplied type context is non-finite, the condition is non-finite
/// or negative, model forward fails, or a coordinate is non-finite.
pub(crate) fn project_generation<B: Backend>(
    model: &ConditionedProjector<B>,
    representations: ProjectorEmbeddings<'_>,
    roles: &[EntityRole],
    type_context: Option<ProjectorTypeContext<'_>>,
    condition: f32,
    batch_size: NonZeroUsize,
    device: &B::Device,
) -> Result<Vec<[f64; 2]>, ProjectorInferenceError> {
    let rows = representations.len();
    if roles.len() != rows {
        return Err(ProjectorInferenceError::RoleCount {
            rows,
            roles: roles.len(),
        });
    }
    if !condition.is_finite() || condition.is_sign_negative() {
        return Err(ProjectorInferenceError::InvalidCondition { value: condition });
    }
    let expected_context = model.config().type_context_dimensions;
    match (expected_context, type_context) {
        (0, Some(_)) => return Err(ProjectorInferenceError::UnexpectedTypeContext),
        (dimensions, None) if dimensions != 0 => {
            return Err(ProjectorInferenceError::MissingTypeContext { dimensions });
        }
        (_, None) => {}
        (expected, Some(context)) => {
            if context.dimensions() != expected {
                return Err(ProjectorInferenceError::TypeContextDimensions {
                    expected,
                    actual: context.dimensions(),
                });
            }
            if context.rows() != rows {
                return Err(ProjectorInferenceError::TypeContextShape {
                    rows,
                    dimensions: context.dimensions(),
                    values: context.values().len(),
                });
            }
        }
    }

    let mut coordinates = Vec::with_capacity(rows);
    for start in (0..rows).step_by(batch_size.get()) {
        let end = (start + batch_size.get()).min(rows);
        let batch_rows = end - start;
        let mut representation_values = Vec::with_capacity(batch_rows * PROJECTOR_DIMENSIONS);
        for row in start..end {
            representation_values.extend_from_slice(representations.row(row));
        }
        let role_values = roles[start..end]
            .iter()
            .map(|role| i64::from(role.index()))
            .collect::<Vec<_>>();
        let type_context = type_context.map(|context| {
            let context_start = start * context.dimensions();
            let context_end = end * context.dimensions();
            Tensor::from_data(
                TensorData::new(
                    context.values()[context_start..context_end].to_vec(),
                    [batch_rows, context.dimensions()],
                ),
                device,
            )
        });
        let output = model.forward(ProjectorInput {
            representation: Tensor::from_data(
                TensorData::new(representation_values, [batch_rows, PROJECTOR_DIMENSIONS]),
                device,
            ),
            type_context,
            roles: Tensor::<B, 2, Int>::from_data(
                TensorData::new(role_values, [batch_rows, 1]),
                device,
            ),
            condition: Tensor::from_data(
                TensorData::new(vec![condition; batch_rows], [batch_rows, 1]),
                device,
            ),
        })?;
        let values = output
            .into_data()
            .to_vec::<f32>()
            .expect("backend coordinates should retain f32 storage");
        for (offset, coordinate) in values.chunks_exact(2).enumerate() {
            for axis in 0..2 {
                if !coordinate[axis].is_finite() {
                    return Err(ProjectorInferenceError::NonFiniteCoordinate {
                        row: start + offset,
                        axis,
                        value: coordinate[axis],
                    });
                }
            }
            coordinates.push([f64::from(coordinate[0]), f64::from(coordinate[1])]);
        }
    }
    Ok(coordinates)
}
