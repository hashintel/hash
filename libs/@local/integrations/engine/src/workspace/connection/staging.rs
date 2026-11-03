use duckdb::params_from_iter;
use error_stack::{Report, ResultExt as _};

use super::Connection;
use crate::{
    AssertionFailure, PreparationError, TableAssertions, pipeline::StagingRequest, sql::Identifier,
};

impl Connection {
    /// Stops between statements when the active preparation request has been cancelled.
    pub(super) fn check_preparation_cancelled(&self) -> Result<(), Report<PreparationError>> {
        if self.interrupt().is_interrupted() {
            Err(Report::new(PreparationError::Cancelled))
        } else {
            Ok(())
        }
    }

    /// Canonicalizes a checked query so it can be embedded without comments or statement
    /// terminators.
    pub(super) fn pipeline_sql(&self, sql: &str) -> Result<String, Report<PreparationError>> {
        self.check_preparation_cancelled()?;
        self.select(sql)
            .change_context(PreparationError::Statement)?;
        self.duckdb
            .query_row(
                "SELECT json_deserialize_sql(json_serialize_sql(?::VARCHAR))",
                [sql],
                |row| row.get(0),
            )
            .map_err(crate::StatementError::from_duckdb)
            .change_context(PreparationError::Statement)
    }

    /// Returns column names and DuckDB types without materializing the query's rows.
    pub(super) fn describe(
        &self,
        sql: &str,
    ) -> Result<Vec<(String, String)>, Report<PreparationError>> {
        self.check_preparation_cancelled()?;
        let mut statement = self
            .duckdb
            .prepare(&format!("DESCRIBE ({sql})"))
            .map_err(crate::StatementError::from_duckdb)
            .change_context(PreparationError::Statement)?;
        let values = self
            .parameter_values(&statement)
            .change_context(PreparationError::Statement)?;
        statement
            .query_map(params_from_iter(values), |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .and_then(Iterator::collect)
            .map_err(crate::StatementError::from_duckdb)
            .change_context(PreparationError::Statement)
    }

    /// Reads a count from engine-generated SQL.
    pub(super) fn pipeline_count(&self, sql: &str) -> Result<u64, Report<PreparationError>> {
        self.check_preparation_cancelled()?;
        self.duckdb
            .query_row(sql, [], |row| row.get(0))
            .map_err(crate::StatementError::from_duckdb)
            .change_context(PreparationError::Statement)
    }

    /// Adds snapshot metadata to source rows and checks their declared constraints.
    #[tracing::instrument(level = "debug", skip_all)]
    pub(super) fn stage_table(
        &self,
        request: &StagingRequest,
    ) -> Result<u64, Report<PreparationError>> {
        let sql = self.pipeline_sql(&request.sql)?;
        let schema = self.describe(&sql)?;
        for (column, _) in &schema {
            if ["_op", "_key", "_content_hash"]
                .iter()
                .any(|reserved| column.eq_ignore_ascii_case(reserved))
            {
                return Err(Report::new(PreparationError::ReservedColumn {
                    column: column.clone().into_boxed_str(),
                }));
            }
        }
        for column in request.primary_key.columns() {
            if !schema
                .iter()
                .any(|(name, _)| name.eq_ignore_ascii_case(column.as_ref()))
            {
                return Err(Report::new(PreparationError::MissingColumn {
                    column: column.to_string().into_boxed_str(),
                }));
            }
        }
        let keys = request
            .primary_key
            .columns()
            .iter()
            .map(|column| {
                let column = Identifier::new(column.as_ref());
                format!("{column} := {column}")
            })
            .collect::<Vec<_>>()
            .join(", ");
        self.create_table(
            &request.table,
            &format!(
                "SELECT 'snapshot' AS _op, to_json(struct_pack({keys}))::VARCHAR AS _key, \
                 source.* FROM ({sql}) AS source"
            ),
        )
        .change_context(PreparationError::Statement)?;
        self.check_assertions(&request.table, &request.assertions)
    }

    /// Collects row-count, nullability, and uniqueness failures without returning source values.
    fn check_assertions(
        &self,
        table: &str,
        assertions: &TableAssertions,
    ) -> Result<u64, Report<PreparationError>> {
        let table = Identifier::new(table);
        let rows = self.pipeline_count(&format!("SELECT count(*) FROM {table}"))?;
        let mut failures = Vec::new();
        if assertions.min_rows.is_some_and(|min| rows < min)
            || assertions.max_rows.is_some_and(|max| rows > max)
        {
            failures.push(AssertionFailure::RowCount {
                actual: rows,
                min: assertions.min_rows,
                max: assertions.max_rows,
            });
        }
        for column in &assertions.not_null {
            let identifier = Identifier::new(column.as_ref());
            let nulls = self.pipeline_count(&format!(
                "SELECT count(*) FROM {table} WHERE {identifier} IS NULL OR \
                 trim({identifier}::VARCHAR) = ''"
            ))?;
            if nulls > 0 {
                failures.push(AssertionFailure::NotNull {
                    column: column.clone(),
                    rows: nulls,
                });
            }
        }
        for columns in &assertions.unique {
            let identifiers = columns
                .columns()
                .iter()
                .map(|column| Identifier::new(column.as_ref()).to_string())
                .collect::<Vec<_>>()
                .join(", ");
            let groups = self.pipeline_count(&format!(
                "SELECT count(*) FROM (SELECT {identifiers} FROM {table} GROUP BY {identifiers} \
                 HAVING count(*) > 1) AS duplicates"
            ))?;
            if groups > 0 {
                failures.push(AssertionFailure::Unique {
                    columns: columns.clone(),
                    groups,
                });
            }
        }
        if failures.is_empty() {
            Ok(rows)
        } else {
            Err(Report::new(PreparationError::Assertions { failures }))
        }
    }

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
}
