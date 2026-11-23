//! DuckDB for one run: the database in which Prepare runs a definition's SQL on the captured rows.

mod error;
mod load;
mod rows;
mod select;
mod sql;
#[cfg(test)]
mod tests;

use core::num::NonZeroUsize;
use std::path::Path;

use duckdb::{Config, Statement, params_from_iter, types::Value};
use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::Variables;

pub(crate) use self::{
    error::{OpenError, Setting, StatementError},
    rows::Rows,
    sql::Identifier,
};
use self::{
    load::{CaptureSchema, SchemaTable},
    select::Select,
};

/// An amount of memory or disk space, in bytes.
///
/// It displays as `<n> bytes`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, derive_more::Display)]
#[display("{_0} bytes")]
pub(crate) struct ByteSize(u64);

impl ByteSize {
    #[must_use]
    pub(crate) const fn from_bytes(bytes: u64) -> Self {
        Self(bytes)
    }

    /// Returns the size in the form DuckDB reads for a size setting.
    pub(crate) fn setting(self) -> Box<str> {
        format!("{} bytes", self.0).into_boxed_str()
    }
}

/// Settings for a [`Workspace`].
#[derive(Debug, Default)]
pub(crate) struct WorkspaceConfig {
    /// The values of the `$NAME` parameters that queries read.
    pub variables: Variables,
    /// The most memory DuckDB uses. A query that needs more spills to the temporary directory,
    /// or fails if it cannot.
    pub memory_limit: Option<ByteSize>,
    /// The most disk space DuckDB uses for the data it spills to its temporary directory.
    pub temp_directory_limit: Option<ByteSize>,
    /// The number of threads DuckDB runs a query on.
    pub threads: Option<NonZeroUsize>,
}

/// A DuckDB database file in which a run's queries run.
///
/// A query is a single `SELECT` statement, and the only table functions it can call are
/// `range`, `generate_series` and `unnest`. Queries read [`WorkspaceConfig::variables`] as
/// `$NAME` parameters, and cannot open files, load extensions or change settings.
///
/// Every function blocks while DuckDB runs. Dropping the workspace closes the database.
pub(crate) struct Workspace {
    duckdb: duckdb::Connection,
    variables: Variables,
    capture_schema: CaptureSchema,
}

impl Workspace {
    /// Opens the database at `path` with the limits in `config` and its settings locked,
    /// creating it if it does not exist.
    ///
    /// # Errors
    ///
    /// - [`Configure`] if DuckDB refuses a setting
    /// - [`Open`] if DuckDB cannot open the database
    ///
    /// [`Configure`]: OpenError::Configure
    /// [`Open`]: OpenError::Open
    pub(crate) fn open(path: &Path, config: WorkspaceConfig) -> Result<Self, Report<OpenError>> {
        let limits = [
            (
                Setting::MemoryLimit,
                config.memory_limit.map(ByteSize::setting),
            ),
            (
                Setting::MaxTempDirectorySize,
                config.temp_directory_limit.map(ByteSize::setting),
            ),
            (
                Setting::Threads,
                config
                    .threads
                    .map(|threads| threads.to_string().into_boxed_str()),
            ),
        ];
        let settings = [
            (Setting::AllowCommunityExtensions, Some("false".into())),
            (Setting::AutoinstallKnownExtensions, Some("false".into())),
            (Setting::AutoloadKnownExtensions, Some("false".into())),
            (Setting::EnableExternalAccess, Some("false".into())),
        ]
        .into_iter()
        .chain(limits)
        .chain([(Setting::LockConfiguration, Some("true".into()))]);

        let mut duckdb_config = Config::default();
        for (setting, value) in settings {
            let Some(value) = value else {
                continue;
            };
            duckdb_config = duckdb_config
                .with(setting.to_string(), &value)
                .change_context_lazy(|| OpenError::Configure { setting, value })?;
        }
        let duckdb =
            duckdb::Connection::open_with_flags(path, duckdb_config).change_context_lazy(|| {
                OpenError::Open {
                    path: path.to_owned(),
                }
            })?;

        let capture_schema = CaptureSchema::default();
        duckdb
            .register_table_function_with_extra_info::<SchemaTable, _>(
                "_capture_schema",
                &capture_schema,
            )
            .change_context_lazy(|| OpenError::Open {
                path: path.to_owned(),
            })?;
        Ok(Self {
            duckdb,
            variables: config.variables,
            capture_schema,
        })
    }

    /// Checks that DuckDB reads `sql` as a single `SELECT` statement whose table functions are
    /// allowed.
    fn select<'sql>(&self, sql: &'sql str) -> Result<Select<'sql>, Report<StatementError>> {
        let serialized: String = self
            .duckdb
            .prepare_cached(Select::SERIALIZE)
            .and_then(|mut statement| statement.query_row([sql], |row| row.get(0)))
            .change_context(StatementError::Failed)?;
        Select::check(sql, &serialized)
    }

    /// Returns the value of each parameter of `statement`, in the order of their indices.
    ///
    /// DuckDB numbers each parameter name once, and compares names without regard to ASCII case.
    fn parameter_values(
        &self,
        statement: &Statement<'_>,
    ) -> Result<Vec<&str>, Report<StatementError>> {
        (1..=statement.parameter_count())
            .map(|index| {
                let name = statement
                    .parameter_name(index)
                    .change_context(StatementError::Failed)?;
                self.variables.get(&name).ok_or_else(|| {
                    Report::new(StatementError::UnknownParameter {
                        name: name.into_boxed_str(),
                    })
                })
            })
            .collect()
    }

    /// Runs the query `sql` and returns all of its rows.
    ///
    /// # Errors
    ///
    /// - [`NotSelect`] if DuckDB does not read `sql` as a `SELECT` query
    /// - [`StatementCount`] if `sql` is not exactly one statement
    /// - [`TableFunction`] if the query calls a table function that is not allowed
    /// - [`UnknownParameter`] if the query reads a parameter that [`WorkspaceConfig::variables`]
    ///   does not set
    /// - [`UnsupportedType`] if a column has a type whose values cannot be read
    /// - [`Failed`] if DuckDB cannot run the query, or a value cannot be read
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`UnknownParameter`]: StatementError::UnknownParameter
    /// [`UnsupportedType`]: StatementError::UnsupportedType
    /// [`Failed`]: StatementError::Failed
    #[tracing::instrument(level = "debug", skip_all)]
    pub(crate) fn query(&self, sql: &str) -> Result<Rows, Report<StatementError>> {
        let select = self.select(sql)?;
        let mut statement = self
            .duckdb
            .prepare(select.as_str())
            .change_context(StatementError::Failed)?;
        let values = self.parameter_values(&statement)?;
        let results = statement
            .query(params_from_iter(values))
            .change_context(StatementError::Failed)?;

        if let Some(executed) = results.as_ref() {
            for index in 0..executed.column_count() {
                let data_type = executed.column_type(index);
                if !Rows::readable(&data_type) {
                    let column = executed
                        .column_name(index)
                        .change_context(StatementError::Failed)?;
                    return Err(Report::new(StatementError::UnsupportedType {
                        column: column.as_str().into(),
                        data_type: data_type.to_string().into_boxed_str(),
                    }));
                }
            }
        }

        let rows = results
            .mapped(|row| {
                (0..row.as_ref().column_count())
                    .map(|index| row.get::<_, Value>(index))
                    .collect::<Result<Box<[_]>, _>>()
            })
            .collect::<Result<Vec<_>, _>>()
            .change_context(StatementError::Failed)?;

        let columns = statement
            .column_names()
            .into_iter()
            .map(String::into_boxed_str)
            .collect();
        Ok(Rows::new(columns, rows))
    }

    /// Replaces the table named `table` with the rows of the query `sql`.
    ///
    /// # Errors
    ///
    /// - [`NotSelect`] if DuckDB does not read `sql` as a `SELECT` query
    /// - [`StatementCount`] if `sql` is not exactly one statement
    /// - [`TableFunction`] if the query calls a table function that is not allowed
    /// - [`UnknownParameter`] if the query reads a parameter that [`WorkspaceConfig::variables`]
    ///   does not set
    /// - [`Failed`] if DuckDB cannot run the query
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`UnknownParameter`]: StatementError::UnknownParameter
    /// [`Failed`]: StatementError::Failed
    #[tracing::instrument(level = "debug", skip(self, sql))]
    pub(crate) fn create_table(
        &self,
        table: &str,
        sql: &str,
    ) -> Result<(), Report<StatementError>> {
        let select = self.select(sql)?;
        // `select` is one statement, so the whole text is one statement as well.
        let mut statement = self
            .duckdb
            .prepare(&format!(
                "CREATE OR REPLACE TABLE {} AS {}",
                Identifier::new(table),
                select.as_str()
            ))
            .change_context(StatementError::Failed)?;
        let values = self.parameter_values(&statement)?;
        statement
            .execute(params_from_iter(values))
            .change_context(StatementError::Failed)?;
        Ok(())
    }

    /// Canonicalizes a checked query so it can be embedded without comments or statement
    /// terminators.
    pub(crate) fn pipeline_sql(&self, sql: &str) -> Result<String, Report<StatementError>> {
        self.select(sql)?;
        self.duckdb
            .query_row(
                "SELECT json_deserialize_sql(json_serialize_sql(?::VARCHAR))",
                [sql],
                |row| row.get(0),
            )
            .change_context(StatementError::Failed)
    }

    /// Returns column names and DuckDB types without materializing the query's rows.
    pub(crate) fn describe(
        &self,
        sql: &str,
    ) -> Result<Vec<(String, String)>, Report<StatementError>> {
        let mut statement = self
            .duckdb
            .prepare(&format!("DESCRIBE ({sql})"))
            .change_context(StatementError::Failed)?;
        let values = self.parameter_values(&statement)?;
        statement
            .query_map(params_from_iter(values), |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .and_then(Iterator::collect)
            .change_context(StatementError::Failed)
    }

    /// Reads a count from SQL the crate builds.
    pub(crate) fn count(&self, sql: &str) -> Result<u64, Report<StatementError>> {
        self.duckdb
            .query_row(sql, [], |row| row.get(0))
            .change_context(StatementError::Failed)
    }
}
