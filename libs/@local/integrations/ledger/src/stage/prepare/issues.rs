// From `engine/src/graph/plan/mod.rs:103-124`
/// A row, or part of one, that is not written as planned.
///
/// Each issue names the type of the entity or link the row was planned as, as several sinks and
/// link pipelines can read the same rows.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum PlanIssue {
    /// The row is left out, as it has no value to identify what it describes.
    #[display("row {row} of `{entity_type}` has no `{column}` to identify its record")]
    MissingSourceId {
        entity_type: VersionedUrl,
        row: usize,
        column: ColumnName,
    },
    /// The entity or link is written without one of its properties.
    #[display("`{entity_id}` of `{entity_type}` is written without a property")]
    Property {
        entity_type: VersionedUrl,
        entity_id: EntityId,
        #[error(source)]
        failure: ConversionFailure,
    },
}
