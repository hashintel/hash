use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::PrimaryKey;

use crate::stage::prepare::{
    pipeline::PreparationError,
    workspace::{Identifier, Workspace},
};

/// Copies the captured table `capture` to `table` with the staging columns: `_op` is the row's
/// `_change`, `_key` its primary key as JSON, and `_seq` its position in the captured file.
///
/// # Errors
///
/// - [`MissingColumn`] if `capture` has no column `_change`, or lacks a column of `primary_key`
/// - [`ReservedColumn`] if `capture` has a column `_op`, `_key`, `_seq` or `rowid`
/// - [`InvalidChange`] if a row's `_change` is not `insert`, `update` or `delete`
/// - [`Statement`] if DuckDB cannot read `capture` or write `table`
///
/// [`ReservedColumn`]: PreparationError::ReservedColumn
/// [`MissingColumn`]: PreparationError::MissingColumn
/// [`InvalidChange`]: PreparationError::InvalidChange
/// [`Statement`]: PreparationError::Statement
pub(super) fn stage(
    workspace: &Workspace,
    capture: &str,
    table: &str,
    primary_key: &PrimaryKey,
) -> Result<(), Report<PreparationError>> {
    let source = Identifier::new(capture);
    let schema = workspace
        .describe(&format!("SELECT * FROM {source}"))
        .change_context(PreparationError::Statement)?;
    let has = |column: &str| {
        schema
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case(column))
    };
    if !has("_change") {
        return Err(Report::new(PreparationError::MissingColumn {
            column: "_change".into(),
        }));
    }
    for (column, _) in &schema {
        // `_seq` is read from DuckDB's `rowid`, which a column of that name would hide.
        if ["_op", "_key", "_seq", "rowid"]
            .iter()
            .any(|reserved| column.eq_ignore_ascii_case(reserved))
        {
            return Err(Report::new(PreparationError::ReservedColumn {
                column: column.clone().into_boxed_str(),
            }));
        }
    }
    for column in primary_key.columns() {
        if !has(column.as_ref()) {
            return Err(Report::new(PreparationError::MissingColumn {
                column: column.to_string().into_boxed_str(),
            }));
        }
    }
    let keys = primary_key
        .columns()
        .iter()
        .map(|column| {
            let column = Identifier::new(column.as_ref());
            format!("{column} := {column}")
        })
        .collect::<Vec<_>>()
        .join(", ");
    // Every row is read three times: when the capture file is loaded, when it is copied here, and
    // when the invalid kinds of change are counted. This is fine for small captures, but its
    // performance has to be watched as captures grow. Checking `_change` while copying would save
    // one of the reads.
    workspace
        .create_table(
            table,
            &format!(
                "SELECT source._change::VARCHAR AS _op, to_json(struct_pack({keys}))::VARCHAR AS \
                 _key, source.rowid AS _seq, source.* EXCLUDE (_change) FROM {source} AS source"
            ),
        )
        .change_context(PreparationError::Statement)?;
    let invalid = workspace
        .count(&format!(
            "SELECT count(*) FROM {} WHERE _op IS NULL OR _op NOT IN ('insert', 'update', \
             'delete')",
            Identifier::new(table)
        ))
        .change_context(PreparationError::Statement)?;
    if invalid > 0 {
        return Err(Report::new(PreparationError::InvalidChange));
    }
    Ok(())
}
