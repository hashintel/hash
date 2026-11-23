// From `engine/src/workspace/connection/pipeline.rs:1-242`
use alloc::collections::BTreeMap;

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{
    Accessor, Action, CheckpointName, EntitySink, LinkInput, Properties, StepId, StepKind,
};
use uuid::Uuid;

use super::Connection;
use crate::{
    PreparationError, PreparedLink, PreparedPipeline, PreparedSink,
    pipeline::{LinkRequest, PipelineRequest},
    sql::Identifier,
};

struct Execution<'connection> {
    connection: &'connection Connection,
    inputs: Vec<(String, Box<str>)>,
    output: PreparedPipeline,
}

impl Connection {
    /// Binds input aliases as CTEs, leaving no shared views to clean up.
    fn execute_pipeline_sql(
        &self,
        sql: &str,
        input: Option<&str>,
        inputs: &[(String, Box<str>)],
    ) -> Result<Box<str>, Report<PreparationError>> {
        let sql = self.pipeline_sql(sql)?;
        let inputs = input.into_iter().map(|table| ("input", table)).chain(
            inputs
                .iter()
                .map(|(alias, table)| (alias.as_str(), table.as_ref())),
        );
        let ctes = inputs
            .map(|(alias, table)| {
                format!(
                    "{} AS (SELECT * FROM {})",
                    Identifier::new(alias),
                    Identifier::new(table)
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        let table = table_name();
        self.create_table(
            &table,
            &format!("WITH {ctes} SELECT * FROM ({sql}) AS output"),
        )
        .change_context(PreparationError::Statement)?;
        Ok(table)
    }

    /// Resolves a link's checkpoints and runs its SQL without applying entity metadata constraints.
    #[tracing::instrument(level = "debug", skip_all)]
    pub(super) fn prepare_link_pipeline(
        &self,
        request: &LinkRequest,
    ) -> Result<PreparedLink, Report<PreparationError>> {
        let resolve = |checkpoint: &CheckpointName| {
            request.checkpoints.get(checkpoint).cloned().ok_or_else(|| {
                Report::new(PreparationError::MissingCheckpoint {
                    checkpoint: checkpoint.clone(),
                })
            })
        };
        let (mut current, inputs) = match &request.pipeline.input {
            LinkInput::Checkpoint(checkpoint) => (Some(resolve(checkpoint)?), Vec::new()),
            LinkInput::Inputs(inputs) => {
                let inputs: Vec<_> = inputs
                    .iter()
                    .map(|(alias, checkpoint)| Ok((alias.to_string(), resolve(checkpoint)?)))
                    .collect::<Result<_, Report<PreparationError>>>()?;
                let current = if inputs.len() == 1 {
                    inputs.first().map(|(_, table)| table.clone())
                } else {
                    None
                };
                (current, inputs)
            }
        };
        for step in &request.pipeline.steps {
            current = Some(
                self.execute_pipeline_sql(step.query.as_ref(), current.as_deref(), &inputs)
                    .change_context_lazy(|| PreparationError::Step {
                        step: step.id.clone(),
                    })?,
            );
        }
        let table = current.ok_or_else(|| Report::new(PreparationError::LinkInputs))?;
        let schema = self.describe(&format!("SELECT * FROM {}", Identifier::new(&table)))?;
        for column in [&request.pipeline.from.column, &request.pipeline.to.column] {
            check_column(column.as_ref(), &schema)?;
        }
        check_properties(&request.pipeline.properties, &schema)?;
        Ok(PreparedLink {
            table,
            pipeline: request.pipeline.clone(),
        })
    }

    /// Runs SQL, branches, and checkpoints, preparing immutable tables for entity sinks.
    #[tracing::instrument(level = "debug", skip_all)]
    pub(super) fn prepare_pipeline(
        &self,
        request: &PipelineRequest,
    ) -> Result<PreparedPipeline, Report<PreparationError>> {
        self.check_metadata(&request.input)?;
        let inputs = request
            .pipeline
            .inputs
            .iter()
            .map(|(alias, checkpoint)| {
                request
                    .checkpoints
                    .get(checkpoint)
                    .cloned()
                    .map(|table| (alias.to_string(), table))
                    .ok_or_else(|| {
                        Report::new(PreparationError::MissingCheckpoint {
                            checkpoint: checkpoint.clone(),
                        })
                    })
            })
            .collect::<Result<_, _>>()?;
        let mut execution = Execution {
            connection: self,
            inputs,
            output: PreparedPipeline {
                table: request.input.clone(),
                checkpoints: BTreeMap::new(),
                sinks: Vec::new(),
            },
        };
        for step in &request.pipeline.steps {
            let current = execution.output.table.clone();
            match &step.kind {
                StepKind::Action(action) => {
                    execution.output.table = execution.action(&step.id, action, &current)?;
                }
                StepKind::Branch(branches) => {
                    for branch in branches.iter() {
                        let mut table = current.clone();
                        for step in branch {
                            table = execution.action(&step.id, &step.action, &table)?;
                        }
                    }
                }
            }
        }
        Ok(execution.output)
    }
}

impl Execution<'_> {
    /// Executes one action while preserving the table at the caller's input.
    fn action(
        &mut self,
        step: &StepId,
        action: &Action,
        input: &str,
    ) -> Result<Box<str>, Report<PreparationError>> {
        self.execute_action(step, action, input)
            .change_context_lazy(|| PreparationError::Step { step: step.clone() })
    }

    /// Prepares the output or records a sink or checkpoint for one action.
    fn execute_action(
        &mut self,
        step: &StepId,
        action: &Action,
        input: &str,
    ) -> Result<Box<str>, Report<PreparationError>> {
        self.connection.check_preparation_cancelled()?;
        match action {
            Action::Sql(sql) => {
                let table = self.connection.execute_pipeline_sql(
                    sql.as_ref(),
                    Some(input),
                    &self.inputs,
                )?;
                self.connection.check_metadata(&table)?;
                Ok(table)
            }
            Action::Checkpoint(checkpoint) => {
                let table = table_name();
                self.connection
                    .create_table(&table, &format!("SELECT * FROM {}", Identifier::new(input)))
                    .change_context(PreparationError::Statement)?;
                self.output.checkpoints.insert(checkpoint.clone(), table);
                Ok(input.into())
            }
            Action::Sink(sink) => {
                let table = self.sink(input, sink)?;
                self.output.sinks.push(PreparedSink {
                    step: step.clone(),
                    table,
                    sink: sink.clone(),
                });
                Ok(input.into())
            }
        }
    }

    /// Adds the sink's content hash using the columns its property accessors read.
    fn sink(&self, input: &str, sink: &EntitySink) -> Result<Box<str>, Report<PreparationError>> {
        let schema = self
            .connection
            .describe(&format!("SELECT * FROM {}", Identifier::new(input)))?;
        check_column(sink.entity_id.as_ref(), &schema)?;
        check_properties(&sink.properties, &schema)?;
        let columns = sink
            .properties
            .iter()
            .flat_map(|(_, accessor)| match accessor {
                Accessor::Column(column) => [Some((column.as_ref(), true)), None],
                Accessor::Coerce { column, .. } => [Some((column.as_ref(), false)), None],
                Accessor::Measure { amount, unit, .. } => {
                    [Some((amount.as_ref(), false)), Some((unit.as_ref(), false))]
                }
            })
            .flatten();
        let hash = hash_expression(columns, &schema)?;
        let table = table_name();
        self.connection
            .create_table(
                &table,
                &format!(
                    "SELECT source.*, {hash} AS _content_hash FROM {} AS source",
                    Identifier::new(input)
                ),
            )
            .change_context(PreparationError::Statement)?;
        Ok(table)
    }
}

/// Generates a distinct table name so branches and repeated executions retain their outputs.
fn table_name() -> Box<str> {
    format!("_step/{}", Uuid::new_v4()).into_boxed_str()
}

// From `engine/src/workspace/connection/pipeline.rs:275-305`
/// Checks each column a sink accessor reads, including converted and measured values.
fn check_properties(
    properties: &Properties,
    schema: &[(String, String)],
) -> Result<(), Report<PreparationError>> {
    let columns = properties
        .iter()
        .flat_map(|(_, accessor)| match accessor {
            Accessor::Column(column) | Accessor::Coerce { column, .. } => [Some(column), None],
            Accessor::Measure { amount, unit, .. } => [Some(amount), Some(unit)],
        })
        .flatten();
    for column in columns {
        check_column(column.as_ref(), schema)?;
    }
    Ok(())
}

/// Resolves a sink column using DuckDB's case-insensitive identifier comparison.
fn check_column(column: &str, schema: &[(String, String)]) -> Result<(), Report<PreparationError>> {
    if schema
        .iter()
        .any(|(name, _)| name.eq_ignore_ascii_case(column))
    {
        Ok(())
    } else {
        Err(Report::new(PreparationError::MissingColumn {
            column: column.into(),
        }))
    }
}

// From `engine/src/workspace/mod.rs:290-296`
    /// Executes a pipeline against a staged `input` and the tables of its input `checkpoints`.
    ///
    /// Sink tables are prepared for delivery, and branches leave the main pipeline's table intact.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if an input is missing, a step fails, or metadata is lost.

// From `engine/src/workspace/mod.rs:317-321`
    /// Combines checkpoint inputs and executes a link pipeline's SQL steps.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if a checkpoint, endpoint column, or SQL step is invalid.

// From `engine/src/pipeline/mod.rs:1-5`
use alloc::collections::BTreeMap;

use hash_integrations_definition::{
    CheckpointName, ColumnName, EntityPipeline, EntitySink, LinkPipeline, PrimaryKey, StepId,
};

// From `engine/src/pipeline/mod.rs:45-88`
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

// From `engine/src/pipeline/mod.rs:103-108`
/// A link pipeline's output table and the mapping to be consumed by its sink.
#[derive(Debug)]
pub struct PreparedLink {
    pub table: Box<str>,
    pub pipeline: LinkPipeline,
}

// From `engine/src/workspace/connection/staging.rs:172-195`
    /// Checks that transformations retain usable staging metadata.
    pub(super) fn check_metadata(&self, table: &str) -> Result<(), Report<PreparationError>> {
        let identifier = Identifier::new(table);
        let schema = self.describe(&format!("SELECT * FROM {identifier}"))?;
        for required in ["_op", "_key"] {
            if !schema
                .iter()
                .any(|(column, kind)| column.eq_ignore_ascii_case(required) && kind == "VARCHAR")
            {
                return Err(Report::new(PreparationError::Metadata {
                    table: table.into(),
                }));
            }
        }
        if self.pipeline_count(&format!(
            "SELECT count(*) FROM {identifier} WHERE _op IS NULL OR _key IS NULL"
        ))? > 0
        {
            return Err(Report::new(PreparationError::Metadata {
                table: table.into(),
            }));
        }
        Ok(())
    }
