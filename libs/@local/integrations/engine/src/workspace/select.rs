//! The check that SQL is a single `SELECT` statement whose table functions are allowed.
//!
//! DuckDB's `json_serialize_sql` reads the SQL with DuckDB's own parser. It refuses every
//! statement that is not a `SELECT`, and returns the parsed statements otherwise. The check walks
//! them for table functions, because a `SELECT` can call table functions that change settings,
//! checkpoint the database or run further SQL, such as `enable_logging`, `checkpoint` and `query`.

use error_stack::{Report, ResultExt as _};
use serde_json::Value;

use crate::workspace::StatementError;

/// The table functions a query can call.
const TABLE_FUNCTIONS: [&str; 3] = ["generate_series", "range", "unnest"];

/// SQL that DuckDB reads as a single `SELECT` statement whose table functions are allowed.
#[derive(Debug, Clone, Copy)]
pub(super) struct Select<'sql>(&'sql str);

impl<'sql> Select<'sql> {
    /// The query that returns DuckDB's reading of the SQL given as its parameter.
    pub(super) const SERIALIZE: &'static str = "SELECT json_serialize_sql(?::VARCHAR)";

    /// Checks `sql` against `serialized`, the result of [`SERIALIZE`](Self::SERIALIZE) for it.
    ///
    /// # Errors
    ///
    /// - [`NotSelect`] if DuckDB refused the SQL
    /// - [`StatementCount`] if the SQL is not exactly one statement
    /// - [`TableFunction`] if the statement calls a table function that is not allowed
    /// - [`Failed`] if `serialized` is not JSON, or is nested too deeply to read
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`Failed`]: StatementError::Failed
    pub(super) fn check(sql: &'sql str, serialized: &str) -> Result<Self, Report<StatementError>> {
        let serialized: Value =
            serde_json::from_str(serialized).change_context(StatementError::Failed)?;
        if serialized.get("error") != Some(&Value::Bool(false)) {
            return Err(Report::new(StatementError::NotSelect {
                reason: serialized
                    .get("error_message")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
            }));
        }

        let statements = serialized
            .get("statements")
            .and_then(Value::as_array)
            .map_or(&[][..], Vec::as_slice);
        if statements.len() != 1 {
            return Err(Report::new(StatementError::StatementCount {
                count: statements.len(),
            }));
        }
        if let Some(name) = statements.iter().find_map(Self::disallowed_table_function) {
            return Err(Report::new(StatementError::TableFunction { name }));
        }
        Ok(Self(sql))
    }

    /// Returns the name of the first table function under `node` that is not allowed.
    fn disallowed_table_function(node: &Value) -> Option<Box<str>> {
        match node {
            Value::Object(fields) => {
                if fields.get("type").and_then(Value::as_str) == Some("TABLE_FUNCTION") {
                    let name = fields
                        .get("function")
                        .and_then(|function| function.get("function_name"))
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if !TABLE_FUNCTIONS
                        .iter()
                        .any(|allowed| allowed.eq_ignore_ascii_case(name))
                    {
                        return Some(name.into());
                    }
                }
                fields.values().find_map(Self::disallowed_table_function)
            }
            Value::Array(items) => items.iter().find_map(Self::disallowed_table_function),
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => None,
        }
    }

    pub(super) const fn as_str(self) -> &'sql str {
        self.0
    }
}
