//! Capture staging, dependency-ordered transformations, and typed row identities.
mod ids;
mod pipelines;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;

use error_stack::Report;
use hash_integrations_definition::{Definition, SourceName};

use super::PreparedRows;
use crate::{
    Code, RunContext, RunInput, StageError, TableAssertions, Workspace,
    run::{error, table::load_table},
    sql::{Identifier, literal},
    stage::capture::CaptureOutput,
};

/// Prepares each target from durable captures without reading mutable integration state.
#[tracing::instrument(level = "debug", skip_all)]
pub(crate) async fn prepare_rows(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    definition: Option<&Definition>,
    capture: &CaptureOutput,
) -> Result<PreparedRows, Report<StageError>> {
    let mut targets = Vec::new();
    let mut missing = Vec::new();
    if let Some(definition) = definition {
        let staged = stage_sources(context, workspace, definition, capture).await?;
        for target in pipelines::prepare(workspace, definition, &staged).await? {
            let (rows, issue) = ids::assign(context, workspace, input, target).await?;
            targets.push(rows);
            missing.extend(issue);
        }
    }
    let mut issues = "SELECT CAST(NULL AS VARCHAR) AS kind, CAST(NULL AS VARCHAR) AS target, \
                      CAST(NULL AS VARCHAR) AS entity_id, CAST(NULL AS VARCHAR) AS key, CAST(NULL \
                      AS VARCHAR) AS issue, CAST(NULL AS VARCHAR) AS property, CAST(NULL AS \
                      VARCHAR) AS reason WHERE false"
        .to_owned();
    for select in missing {
        issues.push_str(" UNION ALL ");
        issues.push_str(&select);
    }
    workspace
        .create_table("_issues".into(), issues.into_boxed_str())
        .await
        .map_err(error::statement)?;
    Ok(PreparedRows {
        targets,
        issues: "_issues".into(),
    })
}

async fn stage_sources(
    context: &RunContext,
    workspace: &Workspace,
    definition: &Definition,
    capture: &CaptureOutput,
) -> Result<BTreeMap<SourceName, Box<str>>, Report<StageError>> {
    let mut staged = BTreeMap::new();
    for (name, source) in definition.sources() {
        let Some(primary_key) = source.primary_key() else {
            continue;
        };
        let captured = capture
            .sources
            .get(name)
            .ok_or_else(|| Code::CaptureMissing.report())?;
        let raw = format!("_capture/{name}");
        let table = format!("_source/{name}");
        load_table(
            context,
            workspace,
            &captured.file,
            raw.clone().into_boxed_str(),
        )
        .await?;
        workspace
            .stage_table(
                table.clone().into_boxed_str(),
                format!("SELECT * FROM {}", Identifier::new(&raw)).into_boxed_str(),
                primary_key.clone(),
                TableAssertions::default(),
            )
            .await
            .map_err(error::preparation)?;
        staged.insert(name.clone(), table.into_boxed_str());
    }
    Ok(staged)
}

pub(super) async fn table_columns(
    workspace: &Workspace,
    table: &str,
) -> Result<Vec<Box<str>>, Report<StageError>> {
    let rows = workspace
        .query(
            format!(
                "SELECT column_name FROM information_schema.columns WHERE table_name = {} ORDER \
                 BY ordinal_position",
                literal(table)
            )
            .into_boxed_str(),
        )
        .await
        .map_err(error::statement)?;
    rows.iter()
        .map(|row| match row {
            [duckdb::types::Value::Text(name)] => Ok(name.clone().into_boxed_str()),
            _ => Err(Code::QueryInvalid.report()),
        })
        .collect()
}
