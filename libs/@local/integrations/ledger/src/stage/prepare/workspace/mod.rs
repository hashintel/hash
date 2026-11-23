// From `engine/src/workspace/mod.rs:1-36`
mod connection;
mod error;
mod files;
mod interrupt;
mod metrics;
mod reply;
mod rows;
mod select;

use alloc::{collections::BTreeMap, sync::Arc};
use core::{error::Error, num::NonZeroUsize};
use std::path::PathBuf;

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{
    CheckpointName, EntityPipeline, LinkPipeline, PrimaryKey, Variables,
};
use tokio::sync::mpsc;

pub use self::{
    error::{
        CloseError, DataErrorType, DiskUsageError, OpenError, QueryErrorType, Setting,
        SnapshotError, StatementError,
    },
    rows::Rows,
};
use crate::{
    ByteSize, CaptureError, PreparationError, PreparedLink, PreparedPipeline, SourceCapture,
    TableAssertions,
    pipeline::{LinkRequest, PipelineRequest, StagingRequest},
    workspace::{
        connection::Connection,
        interrupt::{Interrupt, Pending, RequestId},
        reply::Reply,
    },
};

// From `engine/src/workspace/connection/mod.rs:1-32`
mod capture;
mod pipeline;
mod staging;

use alloc::sync::Arc;
use core::{error::Error, panic::AssertUnwindSafe};
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io, panic,
    path::{Component, Path, PathBuf},
    time::Instant,
};

use duckdb::{Config, Statement, params_from_iter, types::Value};
use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::Variables;
use tokio::sync::mpsc;

use self::capture::{CaptureSchema, SchemaTable};
use crate::{
    ByteSize, WorkspaceConfig,
    sql::Identifier,
    workspace::{
        CloseError, Command, DiskUsageError, OpenError, Rows, Setting, SnapshotError,
        StatementError,
        files::WorkspaceFiles,
        interrupt::{Interrupt, InterruptGuard, RequestId},
        metrics::{Metrics, Operation, Outcome},
        reply::Reply,
        select::Select,
    },
};

// From `engine/src/byte_size.rs`
/// An amount of memory or disk space, in bytes.
///
/// It displays as `<n> bytes`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, derive_more::Display)]
#[display("{_0} bytes")]
pub struct ByteSize(u64);

impl ByteSize {
    #[must_use]
    pub const fn from_bytes(bytes: u64) -> Self {
        Self(bytes)
    }

    /// Returns the size in the form DuckDB reads for a size setting.
    pub(crate) fn setting(self) -> Box<str> {
        format!("{} bytes", self.0).into_boxed_str()
    }
}

// From `engine/src/workspace/mod.rs:38-76`
/// Settings for a [`Workspace`].
#[derive(Debug)]
pub struct WorkspaceConfig {
    /// The number of requests that can wait while another runs. Defaults to 64.
    /// Callers wait for queue space when it is full.
    pub queue_capacity: NonZeroUsize,
    /// The values of the `$NAME` parameters that queries read.
    pub variables: Variables,
    /// The most memory DuckDB uses. A query that needs more spills to the temporary directory,
    /// or fails if it cannot.
    pub memory_limit: Option<ByteSize>,
    /// The most disk space DuckDB uses for the data it spills to its temporary directory.
    pub temp_directory_limit: Option<ByteSize>,
    /// The disk space the workspace files can use before a request fails. The workspace files
    /// are the database file, its log and DuckDB's temporary directory.
    ///
    /// The workspace checks the limit when it opens and after each [`query`](Workspace::query)
    /// and [`create_table`](Workspace::create_table), so a single request can write past it.
    /// When the files are over the limit, it checkpoints the database, which writes the log into
    /// the database file, and measures them again. A table created by a request that takes the
    /// files over the limit stays in the database.
    pub disk_limit: Option<ByteSize>,
    /// The number of threads DuckDB runs a query on.
    pub threads: Option<NonZeroUsize>,
}

impl Default for WorkspaceConfig {
    fn default() -> Self {
        Self {
            queue_capacity: NonZeroUsize::new(64)
                .expect("the default queue capacity should be nonzero"),
            variables: Variables::default(),
            memory_limit: None,
            temp_directory_limit: None,
            disk_limit: None,
            threads: None,
        }
    }
}

// From `engine/src/workspace/mod.rs:120-144`
/// A DuckDB database file in which an integration's queries run.
///
/// A dedicated thread owns the database's only connection and runs queries in the order they
/// are sent. A query is a single `SELECT` statement, and the only table functions it can call are
/// `range`, `generate_series` and `unnest`. Queries read [`WorkspaceConfig::variables`] as
/// `$NAME` parameters, and cannot open files, load extensions or change settings.
/// [`WorkspaceConfig::queue_capacity`] bounds the queue; callers wait for space when it is full.
///
/// Only one workspace at a time can open a database. It holds a lock on `<database>.lock` until
/// the database is closed.
///
/// Dropping the future of a request cancels it: the thread skips the request if it has not
/// started, and interrupts it otherwise. A caller can limit how long a request runs with
/// `tokio::time::timeout`.
///
/// Dropping the workspace returns at once. The futures of its requests are dropped before it, so
/// the thread skips or interrupts them, closes the database and releases the lock. The thread
/// logs a failed checkpoint. [`close`](Self::close) waits for the requests already sent to run,
/// and returns a failed checkpoint as an error. The thread runs on the Tokio blocking pool, so
/// the runtime waits for it when it shuts down.
#[derive(Debug)]
pub struct Workspace {
    commands: mpsc::Sender<(RequestId, Command)>,
    interrupt: Arc<Interrupt>,
}

// From `engine/src/workspace/connection/mod.rs:40-54`
/// The database's only connection, owned by the workspace thread.
///
/// Fields are dropped in declaration order, so `interrupt` stops interrupts before `duckdb` closes
/// the database, and `lock` is released after it.
pub(super) struct Connection {
    interrupt: InterruptGuard,
    duckdb: duckdb::Connection,
    files: WorkspaceFiles,
    disk_limit: Option<ByteSize>,
    variables: Variables,
    metrics: Metrics,
    capture_schema: CaptureSchema,
    /// An exclusive lock on the workspace's lock file, held until the database is closed.
    lock: File,
}

impl Connection {
    // From `engine/src/workspace/mod.rs:201-221`
    /// Opens the database at `path` with `config`, creating it if it does not exist.
    ///
    /// # Errors
    ///
    /// - [`Lock`] if `<database>.lock` cannot be created or locked
    /// - [`Locked`] if another workspace has the database open
    /// - [`Configure`] if DuckDB refuses a setting
    /// - [`Open`] if DuckDB cannot open the database
    /// - [`DiskLimit`] if the workspace files are over [`WorkspaceConfig::disk_limit`]
    /// - [`DiskUsage`] if the workspace files cannot be checked against the disk limit
    /// - [`Spawn`] if no Tokio runtime is running
    /// - [`Stopped`] if the workspace thread stopped before it opened the database
    ///
    /// [`Lock`]: OpenError::Lock
    /// [`Locked`]: OpenError::Locked
    /// [`Configure`]: OpenError::Configure
    /// [`Open`]: OpenError::Open
    /// [`DiskLimit`]: OpenError::DiskLimit
    /// [`DiskUsage`]: OpenError::DiskUsage
    /// [`Spawn`]: OpenError::Spawn
    /// [`Stopped`]: OpenError::Stopped
    // From `engine/src/workspace/connection/mod.rs:146-220`
    /// Opens the database at `path` with the limits in `config` and its settings locked.
    fn open(
        path: PathBuf,
        config: WorkspaceConfig,
        metrics: Metrics,
    ) -> Result<Self, Report<OpenError>> {
        let files = WorkspaceFiles::new(path);
        let lock = Self::lock(&files)?;

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
        let duckdb = duckdb::Connection::open_with_flags(files.database(), duckdb_config)
            .change_context_lazy(|| OpenError::Open {
                path: files.database().to_owned(),
            })?;

        let capture_schema = CaptureSchema::default();
        duckdb
            .register_table_function_with_extra_info::<SchemaTable, _>(
                "_capture_schema",
                &capture_schema,
            )
            .change_context_lazy(|| OpenError::Open {
                path: files.database().to_owned(),
            })?;
        let opened = Self {
            interrupt: InterruptGuard::new(Arc::new(Interrupt::new(duckdb.interrupt_handle()))),
            duckdb,
            files,
            disk_limit: config.disk_limit,
            variables: config.variables,
            metrics,
            capture_schema,
            lock,
        };
        match opened.disk_usage().change_context(OpenError::DiskUsage)? {
            Some(DiskUsage { used, limit }) if used > limit => {
                Err(Report::new(OpenError::DiskLimit { used, limit }))
            }
            Some(_) | None => Ok(opened),
        }
    }

    // From `engine/src/workspace/connection/mod.rs:227-257`
    /// Checks that DuckDB reads `sql` as a single `SELECT` statement whose table functions are
    /// allowed.
    fn select<'sql>(&self, sql: &'sql str) -> Result<Select<'sql>, Report<StatementError>> {
        let serialized: String = self
            .duckdb
            .prepare_cached(Select::SERIALIZE)
            .and_then(|mut statement| statement.query_row([sql], |row| row.get(0)))
            .map_err(StatementError::from_duckdb)?;
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
                    .map_err(StatementError::from_duckdb)?;
                self.variables.get(&name).ok_or_else(|| {
                    Report::new(StatementError::UnknownParameter {
                        name: name.into_boxed_str(),
                    })
                })
            })
            .collect()
    }

    // From `engine/src/workspace/mod.rs:340-368`
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
    /// - [`InvalidQuery`] if DuckDB cannot run the query as written
    /// - [`InvalidData`] if a value in the rows causes an error
    /// - [`Failed`] if DuckDB fails for another reason or a value cannot be read
    /// - [`DiskLimit`] if the workspace files are over [`WorkspaceConfig::disk_limit`] after the
    ///   query
    /// - [`DiskUsage`] if the workspace files cannot be checked against the disk limit
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`UnknownParameter`]: StatementError::UnknownParameter
    /// [`UnsupportedType`]: StatementError::UnsupportedType
    /// [`InvalidQuery`]: StatementError::InvalidQuery
    /// [`InvalidData`]: StatementError::InvalidData
    /// [`Failed`]: StatementError::Failed
    /// [`DiskLimit`]: StatementError::DiskLimit
    /// [`DiskUsage`]: StatementError::DiskUsage
    /// [`Stopped`]: StatementError::Stopped
    // From `engine/src/workspace/connection/mod.rs:259-306`
    #[tracing::instrument(level = "debug", skip_all)]
    fn query(&self, sql: &str) -> Result<Rows, Report<StatementError>> {
        let select = self.select(sql)?;
        let mut statement = self
            .duckdb
            .prepare(select.as_str())
            .map_err(StatementError::from_duckdb)?;
        let values = self.parameter_values(&statement)?;
        let results = statement
            .query(params_from_iter(values))
            .map_err(StatementError::from_duckdb)?;

        if let Some(executed) = results.as_ref() {
            for index in 0..executed.column_count() {
                let data_type = executed.column_type(index);
                if !Rows::readable(&data_type) {
                    let column = executed
                        .column_name(index)
                        .map_err(StatementError::from_duckdb)?;
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
            .map_err(StatementError::from_duckdb)?;

        let columns = statement
            .column_names()
            .into_iter()
            .map(String::into_boxed_str)
            .collect();
        self.metrics.rows(
            Operation::Query,
            u64::try_from(rows.len()).unwrap_or(u64::MAX),
        );
        self.check_disk_limit()?;
        Ok(Rows::new(columns, rows))
    }

    // From `engine/src/workspace/mod.rs:377-403`
    /// Replaces the table named `table` with the rows of the query `sql`.
    ///
    /// # Errors
    ///
    /// - [`NotSelect`] if DuckDB does not read `sql` as a `SELECT` query
    /// - [`StatementCount`] if `sql` is not exactly one statement
    /// - [`TableFunction`] if the query calls a table function that is not allowed
    /// - [`UnknownParameter`] if the query reads a parameter that [`WorkspaceConfig::variables`]
    ///   does not set
    /// - [`InvalidQuery`] if DuckDB cannot run the query as written
    /// - [`InvalidData`] if a value in the rows causes an error
    /// - [`Failed`] if DuckDB fails for another reason
    /// - [`DiskLimit`] if the workspace files are over [`WorkspaceConfig::disk_limit`] after the
    ///   table is created
    /// - [`DiskUsage`] if the workspace files cannot be checked against the disk limit
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`UnknownParameter`]: StatementError::UnknownParameter
    /// [`InvalidQuery`]: StatementError::InvalidQuery
    /// [`InvalidData`]: StatementError::InvalidData
    /// [`Failed`]: StatementError::Failed
    /// [`DiskLimit`]: StatementError::DiskLimit
    /// [`DiskUsage`]: StatementError::DiskUsage
    /// [`Stopped`]: StatementError::Stopped
    // From `engine/src/workspace/connection/mod.rs:308-326`
    #[tracing::instrument(level = "debug", skip(self, sql))]
    fn create_table(&self, table: &str, sql: &str) -> Result<(), Report<StatementError>> {
        let select = self.select(sql)?;
        // `select` is one statement, so the whole text is one statement as well.
        let mut statement = self
            .duckdb
            .prepare(&format!(
                "CREATE OR REPLACE TABLE {} AS {}",
                Identifier::new(table),
                select.as_str()
            ))
            .map_err(StatementError::from_duckdb)?;
        let values = self.parameter_values(&statement)?;
        let rows = statement
            .query_row(params_from_iter(values), |row| row.get(0))
            .map_err(StatementError::from_duckdb)?;
        self.metrics.rows(Operation::CreateTable, rows);
        self.check_disk_limit()
    }

    // From `engine/src/workspace/connection/staging.rs:19-65`
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
}
