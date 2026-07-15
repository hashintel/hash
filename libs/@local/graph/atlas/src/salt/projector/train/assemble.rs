use core::{error::Error, fmt};

use burn::tensor::{Int, Tensor, TensorData, backend::AutodiffBackend};

use super::{
    CoordinateSupport, ProjectorTrainingBatch, ProjectorTrainingError, RelationEdges, SampledEdge,
    WeightedEdges,
};
use crate::salt::{
    graph::ProjectorEmbeddings,
    identity::GenerationRowId,
    projector::{
        EntityRole, LocalScales, ProjectorInferenceError, ProjectorInput, ProjectorTypeContext,
    },
    relation::AttractionEdge,
    representation::PROJECTOR_DIMENSIONS,
};

/// One host-side anchor or landmark target.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CoordinateSupportRow {
    pub row: GenerationRowId,
    pub target: [f64; 2],
    pub radius: f64,
    pub weight: f64,
}

/// Stateless row-level dropout for pooled type context.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TypeContextDropout {
    pub probability: f64,
    pub seed: u64,
    pub step: u64,
}

/// Borrowed host evidence used by every matched condition batch.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProjectorBatchSource<'source> {
    pub representations: ProjectorEmbeddings<'source>,
    pub roles: &'source [EntityRole],
    pub type_context: Option<ProjectorTypeContext<'source>>,
    pub type_context_dropout: Option<TypeContextDropout>,
    pub semantic_positive: &'source [SampledEdge],
    pub ordinary_negative: &'source [SampledEdge],
    pub hard_negative: &'source [SampledEdge],
    pub relation: &'source [AttractionEdge],
    pub local_scales: &'source LocalScales,
    pub anchors: &'source [CoordinateSupportRow],
    pub landmarks: &'source [CoordinateSupportRow],
}

/// Invalid host evidence during tensor-batch assembly.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProjectorBatchError {
    Empty,
    RoleCount { rows: usize, roles: usize },
    LocalScaleCount { rows: usize, scales: usize },
    InvalidTypeContextDropout { value: f64 },
    UnexpectedTypeContextDropout,
    UnknownRow { row: u32, rows: usize },
    InvalidScalar { field: &'static str, value: f64 },
    NegativeScalar { field: &'static str, value: f64 },
    Inference(ProjectorInferenceError),
    Training(ProjectorTrainingError),
}

impl fmt::Display for ProjectorBatchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("projector tensor batch cannot be empty"),
            Self::RoleCount { rows, roles } => {
                write!(
                    formatter,
                    "projector has {rows} rows but {roles} role values"
                )
            }
            Self::LocalScaleCount { rows, scales } => {
                write!(
                    formatter,
                    "projector has {rows} rows but {scales} local scales"
                )
            }
            Self::InvalidTypeContextDropout { value } => write!(
                formatter,
                "type-context dropout probability must be finite and within [0, 1), got {value}"
            ),
            Self::UnexpectedTypeContextDropout => {
                formatter.write_str("type-context dropout requires type-context values")
            }
            Self::UnknownRow { row, rows } => {
                write!(
                    formatter,
                    "projector batch row {row} is outside {rows} corpus rows"
                )
            }
            Self::InvalidScalar { field, value } => {
                write!(
                    formatter,
                    "projector batch field {field} is not zero or a finite normal f32: {value}"
                )
            }
            Self::NegativeScalar { field, value } => {
                write!(
                    formatter,
                    "projector batch field {field} must be non-negative: {value}"
                )
            }
            Self::Inference(error) => error.fmt(formatter),
            Self::Training(error) => error.fmt(formatter),
        }
    }
}

impl Error for ProjectorBatchError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Inference(error) => Some(error),
            Self::Training(error) => Some(error),
            Self::Empty
            | Self::RoleCount { .. }
            | Self::LocalScaleCount { .. }
            | Self::InvalidTypeContextDropout { .. }
            | Self::UnexpectedTypeContextDropout
            | Self::UnknownRow { .. }
            | Self::InvalidScalar { .. }
            | Self::NegativeScalar { .. } => None,
        }
    }
}

impl From<ProjectorTrainingError> for ProjectorBatchError {
    #[inline]
    fn from(error: ProjectorTrainingError) -> Self {
        Self::Training(error)
    }
}

/// Device-resident evidence shared by matched global conditions.
pub(crate) struct PreparedProjectorBatch<B: AutodiffBackend> {
    rows: Box<[GenerationRowId]>,
    representation: Tensor<B, 2>,
    type_context: Option<Tensor<B, 2>>,
    roles: Tensor<B, 2, Int>,
    semantic_positive: Option<WeightedEdges<B>>,
    ordinary_negative: Option<WeightedEdges<B>>,
    hard_negative: Option<WeightedEdges<B>>,
    relation: Option<RelationEdges<B>>,
    anchors: Option<CoordinateSupport<B>>,
    landmarks: Option<CoordinateSupport<B>>,
}

impl<B: AutodiffBackend> PreparedProjectorBatch<B> {
    /// Materializes a cheap tensor clone with one global `FiLM` condition.
    ///
    /// # Errors
    ///
    /// This returns an error when condition is negative, non-finite, or cannot
    /// be represented by the backend's f32 input contract.
    pub(crate) fn at_condition(
        &self,
        condition: f64,
        device: &B::Device,
    ) -> Result<ProjectorTrainingBatch<B>, ProjectorBatchError> {
        if !condition.is_finite() || condition.is_sign_negative() {
            return Err(
                ProjectorTrainingError::InvalidRelationCondition { value: condition }.into(),
            );
        }
        let condition_f32 = narrow("relation-condition", condition)?;
        Ok(ProjectorTrainingBatch {
            input: ProjectorInput {
                representation: self.representation.clone(),
                type_context: self.type_context.clone(),
                roles: self.roles.clone(),
                condition: Tensor::from_data(
                    TensorData::new(vec![condition_f32; self.rows.len()], [self.rows.len(), 1]),
                    device,
                ),
            },
            semantic_positive: self.semantic_positive.clone(),
            ordinary_negative: self.ordinary_negative.clone(),
            hard_negative: self.hard_negative.clone(),
            relation: self.relation.clone(),
            anchors: self.anchors.clone(),
            landmarks: self.landmarks.clone(),
            relation_condition: condition,
        })
    }

    /// Returns the batch-local row ordering.
    #[must_use]
    #[inline]
    pub(crate) fn rows(&self) -> &[GenerationRowId] {
        &self.rows
    }
}

/// Gathers one sampled host batch into reusable device tensors.
///
/// # Errors
///
/// This returns an error for inconsistent corpus metadata, out-of-range rows,
/// invalid scales or weights, or values that cannot be represented as f32.
pub(crate) fn prepare_projector_batch<B: AutodiffBackend>(
    source: ProjectorBatchSource<'_>,
    device: &B::Device,
) -> Result<PreparedProjectorBatch<B>, ProjectorBatchError> {
    let corpus_rows = source.representations.len();
    if source.roles.len() != corpus_rows {
        return Err(ProjectorBatchError::RoleCount {
            rows: corpus_rows,
            roles: source.roles.len(),
        });
    }
    if source.local_scales.as_slice().len() != corpus_rows {
        return Err(ProjectorBatchError::LocalScaleCount {
            rows: corpus_rows,
            scales: source.local_scales.as_slice().len(),
        });
    }
    validate_type_context(source.type_context, corpus_rows)?;
    validate_type_context_dropout(source.type_context, source.type_context_dropout)?;

    let edge_count = source
        .semantic_positive
        .len()
        .saturating_add(source.ordinary_negative.len())
        .saturating_add(source.hard_negative.len())
        .saturating_add(source.relation.len());
    let support_count = source.anchors.len().saturating_add(source.landmarks.len());
    let mut rows = Vec::with_capacity(edge_count.saturating_mul(2).saturating_add(support_count));
    for edge in source
        .semantic_positive
        .iter()
        .chain(source.ordinary_negative)
        .chain(source.hard_negative)
    {
        rows.extend([edge.left, edge.right]);
    }
    for edge in source.relation {
        rows.extend([edge.left, edge.right]);
    }
    for support in source.anchors.iter().chain(source.landmarks) {
        rows.push(support.row);
    }
    if rows.is_empty() {
        return Err(ProjectorBatchError::Empty);
    }
    rows.sort_unstable();
    rows.dedup();
    for row in &rows {
        validate_row(*row, corpus_rows)?;
    }

    let mut representations = Vec::with_capacity(rows.len() * PROJECTOR_DIMENSIONS);
    let mut roles = Vec::with_capacity(rows.len());
    for row in &rows {
        representations.extend_from_slice(source.representations.row(row.as_usize()));
        roles.push(i64::from(source.roles[row.as_usize()].index()));
    }
    let type_context = source.type_context.map(|context| {
        let mut values = Vec::with_capacity(rows.len() * context.dimensions());
        for row in &rows {
            let start = row.as_usize() * context.dimensions();
            let scale = source
                .type_context_dropout
                .map_or(1.0, |dropout| dropout_scale(dropout, *row));
            values.extend(
                context.values()[start..start + context.dimensions()]
                    .iter()
                    .map(|value| value * scale),
            );
        }
        Tensor::from_data(
            TensorData::new(values, [rows.len(), context.dimensions()]),
            device,
        )
    });
    Ok(PreparedProjectorBatch {
        representation: Tensor::from_data(
            TensorData::new(representations, [rows.len(), PROJECTOR_DIMENSIONS]),
            device,
        ),
        type_context,
        roles: Tensor::<B, 2, Int>::from_data(TensorData::new(roles, [rows.len(), 1]), device),
        semantic_positive: weighted_edges(source.semantic_positive, &rows, device)?,
        ordinary_negative: weighted_edges(source.ordinary_negative, &rows, device)?,
        hard_negative: weighted_edges(source.hard_negative, &rows, device)?,
        relation: relation_edges(&source, &rows, device)?,
        anchors: coordinate_support(source.anchors, &rows, device)?,
        landmarks: coordinate_support(source.landmarks, &rows, device)?,
        rows: rows.into_boxed_slice(),
    })
}

fn validate_type_context_dropout(
    context: Option<ProjectorTypeContext<'_>>,
    dropout: Option<TypeContextDropout>,
) -> Result<(), ProjectorBatchError> {
    let Some(dropout) = dropout else {
        return Ok(());
    };
    if context.is_none() {
        return Err(ProjectorBatchError::UnexpectedTypeContextDropout);
    }
    if !valid_type_context_dropout_probability(dropout.probability) {
        return Err(ProjectorBatchError::InvalidTypeContextDropout {
            value: dropout.probability,
        });
    }
    let scale = 1.0 / (1.0 - dropout.probability);
    let context = context.expect("type context should be present after validation");
    if let Some(value) = context.values().iter().find_map(|value| {
        let scaled = f64::from(*value) * scale;
        (scaled.abs() > f64::from(f32::MAX)).then_some(scaled)
    }) {
        return Err(ProjectorBatchError::InvalidScalar {
            field: "dropout-scaled-type-context",
            value,
        });
    }
    Ok(())
}

#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "the random sample is exact in f64 and the model consumes an f32 dropout scale"
)]
fn dropout_scale(dropout: TypeContextDropout, row: GenerationRowId) -> f32 {
    let mut value =
        dropout.seed ^ dropout.step.rotate_left(17) ^ u64::from(row.as_u32()).rotate_left(31);
    value = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    value ^= value >> 31;
    let unit = (value >> 11) as f64 / 9_007_199_254_740_992.0;
    if unit < dropout.probability {
        0.0
    } else {
        (1.0 / (1.0 - dropout.probability)) as f32
    }
}

#[inline]
pub(super) fn valid_type_context_dropout_probability(probability: f64) -> bool {
    probability.is_finite() && !probability.is_sign_negative() && probability < 1.0
}

fn weighted_edges<B: AutodiffBackend>(
    edges: &[SampledEdge],
    rows: &[GenerationRowId],
    device: &B::Device,
) -> Result<Option<WeightedEdges<B>>, ProjectorBatchError> {
    if edges.is_empty() {
        return Ok(None);
    }
    let mut left = Vec::with_capacity(edges.len());
    let mut right = Vec::with_capacity(edges.len());
    let mut weight = Vec::with_capacity(edges.len());
    for edge in edges {
        left.push(local_row(rows, edge.left));
        right.push(local_row(rows, edge.right));
        weight.push(narrow_nonnegative("edge-weight", edge.weight)?);
    }
    Ok(Some(WeightedEdges {
        left: int_tensor(left, device),
        right: int_tensor(right, device),
        weight: float_column(weight, device),
    }))
}

fn relation_edges<B: AutodiffBackend>(
    source: &ProjectorBatchSource<'_>,
    rows: &[GenerationRowId],
    device: &B::Device,
) -> Result<Option<RelationEdges<B>>, ProjectorBatchError> {
    if source.relation.is_empty() {
        return Ok(None);
    }
    let mut left = Vec::with_capacity(source.relation.len());
    let mut right = Vec::with_capacity(source.relation.len());
    let mut weight = Vec::with_capacity(source.relation.len());
    let mut coincident = Vec::with_capacity(source.relation.len());
    let mut proximal = Vec::with_capacity(source.relation.len());
    let mut left_scale = Vec::with_capacity(source.relation.len());
    let mut right_scale = Vec::with_capacity(source.relation.len());
    for edge in source.relation {
        left.push(local_row(rows, edge.left));
        right.push(local_row(rows, edge.right));
        weight.push(narrow(
            "relation-weight",
            edge.confidence.value() * edge.degree_normalization * edge.strength.get(),
        )?);
        coincident.push(narrow("coincident-coefficient", edge.coincident)?);
        proximal.push(narrow("proximal-coefficient", edge.proximal)?);
        left_scale.push(narrow_nonnegative(
            "relation-left-local-scale",
            source.local_scales.as_slice()[edge.left.as_usize()],
        )?);
        right_scale.push(narrow_nonnegative(
            "relation-right-local-scale",
            source.local_scales.as_slice()[edge.right.as_usize()],
        )?);
    }
    Ok(Some(RelationEdges {
        left: int_tensor(left, device),
        right: int_tensor(right, device),
        weight: float_column(weight, device),
        coincident: float_column(coincident, device),
        proximal: float_column(proximal, device),
        left_scale: float_column(left_scale, device),
        right_scale: float_column(right_scale, device),
    }))
}

fn coordinate_support<B: AutodiffBackend>(
    support: &[CoordinateSupportRow],
    rows: &[GenerationRowId],
    device: &B::Device,
) -> Result<Option<CoordinateSupport<B>>, ProjectorBatchError> {
    if support.is_empty() {
        return Ok(None);
    }
    let mut local_rows = Vec::with_capacity(support.len());
    let mut target = Vec::with_capacity(support.len() * 2);
    let mut radius = Vec::with_capacity(support.len());
    let mut weight = Vec::with_capacity(support.len());
    for support in support {
        local_rows.push(local_row(rows, support.row));
        target.extend([
            narrow("support-target-x", support.target[0])?,
            narrow("support-target-y", support.target[1])?,
        ]);
        radius.push(narrow_nonnegative("support-radius", support.radius)?);
        weight.push(narrow_nonnegative("support-weight", support.weight)?);
    }
    Ok(Some(CoordinateSupport {
        rows: int_tensor(local_rows, device),
        target: Tensor::from_data(TensorData::new(target, [support.len(), 2]), device),
        radius: float_column(radius, device),
        weight: float_column(weight, device),
    }))
}

fn validate_type_context(
    context: Option<ProjectorTypeContext<'_>>,
    rows: usize,
) -> Result<(), ProjectorBatchError> {
    let Some(context) = context else {
        return Ok(());
    };
    if context.rows() != rows {
        return Err(ProjectorBatchError::Inference(
            ProjectorInferenceError::TypeContextShape {
                rows,
                dimensions: context.dimensions(),
                values: context.values().len(),
            },
        ));
    }
    Ok(())
}

#[inline]
fn validate_row(row: GenerationRowId, rows: usize) -> Result<(), ProjectorBatchError> {
    if row.as_usize() < rows {
        Ok(())
    } else {
        Err(ProjectorBatchError::UnknownRow {
            row: row.as_u32(),
            rows,
        })
    }
}

#[inline]
fn local_row(rows: &[GenerationRowId], row: GenerationRowId) -> i64 {
    i64::try_from(
        rows.binary_search(&row)
            .expect("all batch rows should have been collected"),
    )
    .expect("batch row should fit i64")
}

fn int_tensor<B: AutodiffBackend>(values: Vec<i64>, device: &B::Device) -> Tensor<B, 1, Int> {
    let length = values.len();
    Tensor::from_data(TensorData::new(values, [length]), device)
}

fn float_column<B: AutodiffBackend>(values: Vec<f32>, device: &B::Device) -> Tensor<B, 2> {
    let length = values.len();
    Tensor::from_data(TensorData::new(values, [length, 1]), device)
}

fn narrow(field: &'static str, value: f64) -> Result<f32, ProjectorBatchError> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "representability is checked immediately after conversion"
    )]
    let narrowed = value as f32;
    if value.is_finite() && narrowed.is_finite() && (value == 0.0 || narrowed.is_normal()) {
        Ok(narrowed)
    } else {
        Err(ProjectorBatchError::InvalidScalar { field, value })
    }
}

fn narrow_nonnegative(field: &'static str, value: f64) -> Result<f32, ProjectorBatchError> {
    if value.is_sign_negative() {
        return Err(ProjectorBatchError::NegativeScalar { field, value });
    }
    narrow(field, value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dropout_rejects_a_context_that_can_overflow_when_retained() {
        let values = [f32::MAX];
        let context =
            ProjectorTypeContext::new(&values, 1, 1).expect("finite type context should validate");

        assert!(matches!(
            validate_type_context_dropout(
                Some(context),
                Some(TypeContextDropout {
                    probability: 0.5,
                    seed: 0,
                    step: 0,
                }),
            ),
            Err(ProjectorBatchError::InvalidScalar {
                field: "dropout-scaled-type-context",
                ..
            })
        ));
    }
}
