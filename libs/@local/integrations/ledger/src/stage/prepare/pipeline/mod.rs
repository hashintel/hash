//! The SQL steps of a definition: its entity pipelines and link pipelines, run in the workspace.

#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{
    Accessor, Action, CheckpointName, EntityPipeline, EntitySink, LinkInput, LinkPipeline,
    Properties, StepId, StepKind,
};
use uuid::Uuid;

use super::workspace::{Identifier, Workspace};

/// Reports why executing a pipeline failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum PreparationError {
    #[display("the pipeline statement failed")]
    Statement,
    #[display("table has no column `{column}`")]
    MissingColumn { column: Box<str> },
    #[display("table `{table}` must retain non-null VARCHAR `_op` and `_key` and BIGINT `_seq`")]
    Metadata { table: Box<str> },
    #[display("checkpoint `{checkpoint}` has not been materialized")]
    MissingCheckpoint { checkpoint: CheckpointName },
    #[display("pipeline step `{step}` failed")]
    Step { step: StepId },
    #[display("a link pipeline with multiple inputs needs an SQL step")]
    LinkInputs,
}

/// The table and property mapping to be consumed by an entity sink.
#[derive(Debug)]
pub(crate) struct PreparedSink {
    /// A table containing staging metadata.
    pub table: Box<str>,
    pub sink: EntitySink,
}

/// The tables produced by a pipeline, with sinks in execution order.
#[derive(Debug)]
pub(crate) struct PreparedPipeline {
    pub table: Box<str>,
    pub checkpoints: BTreeMap<CheckpointName, Box<str>>,
    pub sinks: Vec<PreparedSink>,
}

/// A link pipeline's output table and the mapping to be consumed by its sink.
#[derive(Debug)]
pub(crate) struct PreparedLink {
    pub table: Box<str>,
    pub pipeline: LinkPipeline,
}

struct Execution<'workspace> {
    workspace: &'workspace Workspace,
    inputs: Vec<(String, Box<str>)>,
    output: PreparedPipeline,
}

impl Workspace {
    /// Binds input aliases as CTEs, leaving no shared views to clean up.
    fn execute_pipeline_sql(
        &self,
        sql: &str,
        input: Option<&str>,
        inputs: &[(String, Box<str>)],
    ) -> Result<Box<str>, Report<PreparationError>> {
        let sql = self
            .pipeline_sql(sql)
            .change_context(PreparationError::Statement)?;
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

    /// Combines checkpoint inputs and executes a link pipeline's SQL steps.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if a checkpoint, endpoint column, or SQL step is invalid.
    pub(crate) fn prepare_link_pipeline(
        &self,
        pipeline: &LinkPipeline,
        checkpoints: &BTreeMap<CheckpointName, Box<str>>,
    ) -> Result<PreparedLink, Report<PreparationError>> {
        let resolve = |checkpoint: &CheckpointName| {
            checkpoints.get(checkpoint).cloned().ok_or_else(|| {
                Report::new(PreparationError::MissingCheckpoint {
                    checkpoint: checkpoint.clone(),
                })
            })
        };
        let (mut current, inputs) = match &pipeline.input {
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
        for step in &pipeline.steps {
            current = Some(
                self.execute_pipeline_sql(step.query.as_ref(), current.as_deref(), &inputs)
                    .change_context_lazy(|| PreparationError::Step {
                        step: step.id.clone(),
                    })?,
            );
        }
        let table = current.ok_or_else(|| Report::new(PreparationError::LinkInputs))?;
        let schema = self
            .describe(&format!("SELECT * FROM {}", Identifier::new(&table)))
            .change_context(PreparationError::Statement)?;
        for column in [&pipeline.from.column, &pipeline.to.column] {
            check_column(column.as_ref(), &schema)?;
        }
        check_properties(&pipeline.properties, &schema)?;
        Ok(PreparedLink {
            table,
            pipeline: pipeline.clone(),
        })
    }

    /// Executes a pipeline against a staged `input` and the tables of its input `checkpoints`.
    ///
    /// Branches leave the main pipeline's table intact.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if an input is missing, a step fails, or metadata is lost.
    pub(crate) fn prepare_pipeline(
        &self,
        pipeline: &EntityPipeline,
        input: &str,
        checkpoints: &BTreeMap<CheckpointName, Box<str>>,
    ) -> Result<PreparedPipeline, Report<PreparationError>> {
        self.check_metadata(input)?;
        let inputs = pipeline
            .inputs
            .iter()
            .map(|(alias, checkpoint)| {
                checkpoints
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
            workspace: self,
            inputs,
            output: PreparedPipeline {
                table: input.into(),
                checkpoints: BTreeMap::new(),
                sinks: Vec::new(),
            },
        };
        for step in &pipeline.steps {
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

    /// Checks that transformations retain usable staging metadata.
    ///
    /// # Errors
    ///
    /// - [`Metadata`] if `table` lacks VARCHAR `_op` or `_key` or BIGINT `_seq`, or a row holds
    ///   null in one of them
    /// - [`Statement`] if DuckDB cannot read the table
    ///
    /// [`Metadata`]: PreparationError::Metadata
    /// [`Statement`]: PreparationError::Statement
    pub(crate) fn check_metadata(&self, table: &str) -> Result<(), Report<PreparationError>> {
        let identifier = Identifier::new(table);
        let schema = self
            .describe(&format!("SELECT * FROM {identifier}"))
            .change_context(PreparationError::Statement)?;
        for (required, required_kind) in
            [("_op", "VARCHAR"), ("_key", "VARCHAR"), ("_seq", "BIGINT")]
        {
            if !schema.iter().any(|(column, kind)| {
                column.eq_ignore_ascii_case(required) && kind == required_kind
            }) {
                return Err(Report::new(PreparationError::Metadata {
                    table: table.into(),
                }));
            }
        }
        if self
            .count(&format!(
                "SELECT count(*) FROM {identifier} WHERE _op IS NULL OR _key IS NULL OR _seq IS \
                 NULL"
            ))
            .change_context(PreparationError::Statement)?
            > 0
        {
            return Err(Report::new(PreparationError::Metadata {
                table: table.into(),
            }));
        }
        Ok(())
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
        self.execute_action(action, input)
            .change_context_lazy(|| PreparationError::Step { step: step.clone() })
    }

    /// Prepares the output or records a sink or checkpoint for one action.
    ///
    /// A sink records its input table, which no later step replaces, since every step writes a
    /// table of its own.
    fn execute_action(
        &mut self,
        action: &Action,
        input: &str,
    ) -> Result<Box<str>, Report<PreparationError>> {
        match action {
            Action::Sql(sql) => {
                let table =
                    self.workspace
                        .execute_pipeline_sql(sql.as_ref(), Some(input), &self.inputs)?;
                self.workspace.check_metadata(&table)?;
                Ok(table)
            }
            Action::Checkpoint(checkpoint) => {
                let table = table_name();
                self.workspace
                    .create_table(&table, &format!("SELECT * FROM {}", Identifier::new(input)))
                    .change_context(PreparationError::Statement)?;
                self.output.checkpoints.insert(checkpoint.clone(), table);
                Ok(input.into())
            }
            Action::Sink(sink) => {
                let schema = self
                    .workspace
                    .describe(&format!("SELECT * FROM {}", Identifier::new(input)))
                    .change_context(PreparationError::Statement)?;
                check_column(sink.entity_id.as_ref(), &schema)?;
                check_properties(&sink.properties, &schema)?;
                self.output.sinks.push(PreparedSink {
                    table: input.into(),
                    sink: sink.clone(),
                });
                Ok(input.into())
            }
        }
    }
}

/// Generates a distinct table name so branches and repeated executions retain their outputs.
fn table_name() -> Box<str> {
    format!("_step/{}", Uuid::new_v4()).into_boxed_str()
}

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
