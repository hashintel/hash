use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::PrimaryKey;

use crate::stage::prepare::{
    changes::Change,
    pipeline::PreparationError,
    workspace::{Identifier, Workspace},
};

/// The columns staging adds. `_seq` is read from DuckDB's `rowid`, which a column of that name
/// would hide.
const RESERVED: [&str; 4] = ["_op", "_key", "_seq", "rowid"];

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
/// [`MissingColumn`]: PreparationError::MissingColumn
/// [`ReservedColumn`]: PreparationError::ReservedColumn
/// [`InvalidChange`]: PreparationError::InvalidChange
/// [`Statement`]: PreparationError::Statement
pub(super) fn stage(
    workspace: &Workspace,
    capture: &str,
    table: &str,
    primary_key: &PrimaryKey,
) -> Result<(), Report<PreparationError>> {
    let capture = Identifier::new(capture);
    let columns = workspace
        .describe(&format!("SELECT * FROM {capture}"))
        .change_context(PreparationError::Statement)?
        .into_iter()
        .map(|(column, _)| column)
        .collect::<Vec<_>>();
    check_columns(&columns, primary_key)?;

    let key = primary_key
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
                "SELECT _change::VARCHAR AS _op, to_json(struct_pack({key}))::VARCHAR AS _key, \
                 rowid AS _seq, * EXCLUDE (_change) FROM {capture}"
            ),
        )
        .change_context(PreparationError::Statement)?;

    let changes = Change::ALL
        .map(|change| format!("'{}'", change.as_str()))
        .join(", ");
    let invalid = workspace
        .count(&format!(
            "SELECT count(*) FROM {} WHERE _op IS NULL OR _op NOT IN ({changes})",
            Identifier::new(table)
        ))
        .change_context(PreparationError::Statement)?;
    if invalid > 0 {
        return Err(Report::new(PreparationError::InvalidChange));
    }
    Ok(())
}

/// Checks that `columns` hold `_change` and the columns of `primary_key`, and no staging column.
fn check_columns(
    columns: &[String],
    primary_key: &PrimaryKey,
) -> Result<(), Report<PreparationError>> {
    let has = |name: &str| {
        columns
            .iter()
            .any(|column| column.eq_ignore_ascii_case(name))
    };
    let mut required =
        core::iter::once("_change").chain(primary_key.columns().iter().map(AsRef::as_ref));
    if let Some(missing) = required.find(|column| !has(column)) {
        return Err(Report::new(PreparationError::MissingColumn {
            column: missing.into(),
        }));
    }
    if let Some(reserved) = columns.iter().find(|column| {
        RESERVED
            .iter()
            .any(|name| column.eq_ignore_ascii_case(name))
    }) {
        return Err(Report::new(PreparationError::ReservedColumn {
            column: reserved.as_str().into(),
        }));
    }
    Ok(())
}
