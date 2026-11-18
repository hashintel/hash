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

/// Hashes accessor inputs in property order, normalizing plain text column mappings.
fn hash_expression<'column>(
    columns: impl Iterator<Item = (&'column str, bool)>,
    schema: &[(String, String)],
) -> Result<String, Report<PreparationError>> {
    let fields = columns
        .enumerate()
        .map(|(index, (column, normalize))| {
            let (_, kind) = schema
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(column))
                .ok_or_else(|| {
                    Report::new(PreparationError::MissingColumn {
                        column: column.into(),
                    })
                })?;
            let column = Identifier::new(column);
            Ok(if normalize && kind == "VARCHAR" {
                format!("p{index} := nullif(trim({column}), '')")
            } else {
                format!("p{index} := {column}")
            })
        })
        .collect::<Result<Vec<_>, Report<PreparationError>>>()?;
    if fields.is_empty() {
        Ok("md5('')".to_owned())
    } else {
        Ok(format!("md5(struct_pack({})::VARCHAR)", fields.join(", ")))
    }
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
