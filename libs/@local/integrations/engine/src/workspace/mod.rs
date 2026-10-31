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
use std::{path::PathBuf, thread};

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
    ByteSize, PreparationError, PreparedLink, PreparedPipeline, TableAssertions,
    pipeline::{LinkRequest, PipelineRequest, StagingRequest},
    workspace::{
        connection::Connection,
        interrupt::{Interrupt, Pending, RequestId},
        reply::Reply,
    },
};

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

/// A request to the workspace thread, with the channel for its reply.
enum Command {
    Link {
        request: Box<LinkRequest>,
        reply: Reply<PreparedLink, PreparationError>,
    },
    Stage {
        request: Box<StagingRequest>,
        reply: Reply<u64, PreparationError>,
    },
    Pipeline {
        request: Box<PipelineRequest>,
        reply: Reply<PreparedPipeline, PreparationError>,
    },
    Query {
        sql: Box<str>,
        reply: Reply<Rows, StatementError>,
    },
    CreateTable {
        table: Box<str>,
        sql: Box<str>,
        reply: Reply<(), StatementError>,
    },
    Snapshot {
        target: PathBuf,
        reply: Reply<(), SnapshotError>,
    },
    Close {
        reply: Reply<(), CloseError>,
    },
}

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
/// and returns a failed checkpoint as an error.
#[derive(Debug)]
pub struct Workspace {
    commands: mpsc::Sender<(RequestId, Command)>,
    interrupt: Arc<Interrupt>,
}

impl Workspace {
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
    /// - [`Spawn`] if the workspace thread cannot be started
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
    pub async fn open(path: PathBuf, config: WorkspaceConfig) -> Result<Self, Report<OpenError>> {
        let (commands, mut receiver) = mpsc::channel(config.queue_capacity.get());
        let (ready, opened) = Reply::channel();
        let span = tracing::info_span!("workspace", path = %path.display());

        thread::Builder::new()
            .name("integrations-workspace".to_owned())
            .spawn(move || {
                let _entered = span.entered();
                Connection::serve(path, config, ready, &mut receiver);
            })
            .change_context(OpenError::Spawn)?;

        let interrupt = opened.await.change_context(OpenError::Stopped)??;
        Ok(Self {
            commands,
            interrupt,
        })
    }

    /// Sends the command that `command` builds around its reply channel, and waits for the reply.
    ///
    /// The request is cancelled if the returned future is dropped before the reply arrives.
    async fn request<T, C>(
        &self,
        command: impl FnOnce(Reply<T, C>) -> Command,
        stopped: C,
    ) -> Result<T, Report<C>>
    where
        C: Error + Send + Sync + 'static,
    {
        let request = self.interrupt.next_request();
        let (reply, result) = Reply::channel();
        if self.commands.send((request, command(reply))).await.is_err() {
            return Err(Report::new(stopped));
        }
        Pending::new(&self.interrupt, request, result)
            .reply()
            .await
            .change_context(stopped)?
    }

    /// Materializes `sql` with staging metadata and checks its primary-key columns and assertions.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if the query, schema, assertions, or workspace limits fail.
    pub async fn stage_table(
        &self,
        table: Box<str>,
        sql: Box<str>,
        primary_key: PrimaryKey,
        assertions: TableAssertions,
    ) -> Result<u64, Report<PreparationError>> {
        self.request(
            |reply| Command::Stage {
                request: Box::new(StagingRequest {
                    table,
                    sql,
                    primary_key,
                    assertions,
                }),
                reply,
            },
            PreparationError::Stopped,
        )
        .await
    }

    /// Executes a pipeline against a staged `input` and the tables of its input `checkpoints`.
    ///
    /// Sink tables are prepared for delivery, and branches leave the main pipeline's table intact.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if an input is missing, a step fails, or metadata is lost.
    pub async fn prepare_pipeline(
        &self,
        pipeline: EntityPipeline,
        input: Box<str>,
        checkpoints: BTreeMap<CheckpointName, Box<str>>,
    ) -> Result<PreparedPipeline, Report<PreparationError>> {
        self.request(
            |reply| Command::Pipeline {
                request: Box::new(PipelineRequest {
                    pipeline,
                    input,
                    checkpoints,
                }),
                reply,
            },
            PreparationError::Stopped,
        )
        .await
    }

    /// Combines checkpoint inputs and executes a link pipeline's SQL steps.
    ///
    /// # Errors
    ///
    /// Returns [`PreparationError`] if a checkpoint, endpoint column, or SQL step is invalid.
    pub async fn prepare_link_pipeline(
        &self,
        pipeline: LinkPipeline,
        checkpoints: BTreeMap<CheckpointName, Box<str>>,
    ) -> Result<PreparedLink, Report<PreparationError>> {
        self.request(
            |reply| Command::Link {
                request: Box::new(LinkRequest {
                    pipeline,
                    checkpoints,
                }),
                reply,
            },
            PreparationError::Stopped,
        )
        .await
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
    pub async fn query(&self, sql: Box<str>) -> Result<Rows, Report<StatementError>> {
        self.request(
            |reply| Command::Query { sql, reply },
            StatementError::Stopped,
        )
        .await
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
    pub async fn create_table(
        &self,
        table: Box<str>,
        sql: Box<str>,
    ) -> Result<(), Report<StatementError>> {
        self.request(
            |reply| Command::CreateTable { table, sql, reply },
            StatementError::Stopped,
        )
        .await
    }

    /// Writes a copy of the database to `target` that DuckDB can open on its own.
    ///
    /// The copy holds the tables of every request sent before the snapshot, and none sent after
    /// it. It is written to a new file at `<target>.partial`, which replaces any file there, synced
    /// to disk, and then renamed to `target`, so it replaces an existing file at `target` only once
    /// it is complete.
    ///
    /// # Errors
    ///
    /// - [`InvalidTarget`] if `target` is relative or contains `..`
    /// - [`WorkspaceFile`] if `target` or `<target>.partial` is one of the workspace's files
    /// - [`Checkpoint`] if DuckDB cannot write its log into the database file
    /// - [`Write`] if the copy cannot be written, synced or renamed
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`InvalidTarget`]: SnapshotError::InvalidTarget
    /// [`WorkspaceFile`]: SnapshotError::WorkspaceFile
    /// [`Checkpoint`]: SnapshotError::Checkpoint
    /// [`Write`]: SnapshotError::Write
    /// [`Stopped`]: SnapshotError::Stopped
    pub async fn snapshot(&self, target: PathBuf) -> Result<(), Report<SnapshotError>> {
        self.request(
            |reply| Command::Snapshot { target, reply },
            SnapshotError::Stopped,
        )
        .await
    }

    /// Checkpoints and closes the database after the requests already sent have run.
    ///
    /// The database is closed even if the checkpoint fails.
    ///
    /// # Errors
    ///
    /// - [`Checkpoint`] if DuckDB cannot write its log into the database file
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`Checkpoint`]: CloseError::Checkpoint
    /// [`Stopped`]: CloseError::Stopped
    pub async fn close(self) -> Result<(), Report<CloseError>> {
        self.request(|reply| Command::Close { reply }, CloseError::Stopped)
            .await
    }
}
