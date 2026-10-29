use alloc::collections::BTreeMap;

use hash_integrations_definition::{
    CheckpointName, ColumnName, EntityPipeline, EntitySink, LinkPipeline, PrimaryKey, StepId,
};

/// Checks applied to a materialized source table.
#[derive(Debug, Default, Clone)]
pub struct TableAssertions {
    pub min_rows: Option<u64>,
    pub max_rows: Option<u64>,
    /// Columns whose values must be neither null nor blank.
    pub not_null: Vec<ColumnName>,
    /// Column combinations that must identify at most one row.
    pub unique: Vec<PrimaryKey>,
}

/// An assertion that a source table did not satisfy.
#[derive(Debug, derive_more::Display)]
pub enum AssertionFailure {
    #[display("row count is {actual}, expected {}", row_count_bounds(*min, *max))]
    RowCount {
        actual: u64,
        min: Option<u64>,
        max: Option<u64>,
    },
    #[display("column `{column}` has {rows} null or blank rows")]
    NotNull { column: ColumnName, rows: u64 },
    #[display(
        "duplicate value groups for columns {}: {groups}",
        columns.columns().iter().map(|column| format!("`{column}`")).collect::<Vec<_>>().join(", ")
    )]
    Unique { columns: PrimaryKey, groups: u64 },
}

fn row_count_bounds(min: Option<u64>, max: Option<u64>) -> String {
    match (min, max) {
        (Some(min), Some(max)) => format!("between {min} and {max} rows"),
        (Some(min), None) => format!("at least {min} rows"),
        (None, Some(max)) => format!("at most {max} rows"),
        (None, None) => "any number of rows".to_owned(),
    }
}

/// Reports why staging or executing a pipeline failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum PreparationError {
    #[display("the pipeline statement failed")]
    Statement,
    #[display("pipeline preparation was cancelled")]
    Cancelled,
    #[display("source column `{column}` is reserved for staging metadata")]
    ReservedColumn { column: Box<str> },
    #[display("table has no column `{column}`")]
    MissingColumn { column: Box<str> },
    #[display("table `{table}` must retain non-null VARCHAR `_op` and `_key` columns")]
    Metadata { table: Box<str> },
    #[display(
        "source table failed its assertions: {}",
        failures.iter().map(ToString::to_string).collect::<Vec<_>>().join("; ")
    )]
    Assertions { failures: Vec<AssertionFailure> },
    #[display("checkpoint `{checkpoint}` has not been materialized")]
    MissingCheckpoint { checkpoint: CheckpointName },
    #[display("pipeline step `{step}` failed")]
    Step { step: StepId },
    #[display("the workspace thread stopped before pipeline preparation finished")]
    Stopped,
    #[display("a link pipeline with multiple inputs needs an SQL step")]
    LinkInputs,
}

/// The table and property mapping to be consumed by an entity sink.
#[derive(Debug)]
pub struct PreparedSink {
    pub step: StepId,
    /// A table containing staging metadata and `_content_hash`.
    pub table: Box<str>,
    pub sink: EntitySink,
}

/// The tables produced by a pipeline, with sinks in execution order.
#[derive(Debug)]
pub struct PreparedPipeline {
    pub table: Box<str>,
    pub checkpoints: BTreeMap<CheckpointName, Box<str>>,
    pub sinks: Vec<PreparedSink>,
}

pub(crate) struct PipelineRequest {
    pub pipeline: EntityPipeline,
    pub input: Box<str>,
    pub checkpoints: BTreeMap<CheckpointName, Box<str>>,
}

pub(crate) struct StagingRequest {
    pub table: Box<str>,
    pub sql: Box<str>,
    pub primary_key: PrimaryKey,
    pub assertions: TableAssertions,
}

/// A link pipeline's output table and the mapping to be consumed by its sink.
#[derive(Debug)]
pub struct PreparedLink {
    pub table: Box<str>,
    pub pipeline: LinkPipeline,
}

pub(crate) struct LinkRequest {
    pub pipeline: LinkPipeline,
    pub checkpoints: BTreeMap<CheckpointName, Box<str>>,
}
