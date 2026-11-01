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

/// The disk space the workspace files use, and the limit they are checked against.
struct DiskUsage {
    used: ByteSize,
    limit: ByteSize,
}

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
    /// An exclusive lock on the workspace's lock file, held until the database is closed.
    lock: File,
}

impl Connection {
    /// Takes an exclusive lock on the lock file of `files`.
    ///
    /// DuckDB does not stop a second connection in the same process from opening a database, so
    /// the workspace locks a file of its own first.
    fn lock(files: &WorkspaceFiles) -> Result<File, Report<OpenError>> {
        let lock = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(files.lock())
            .change_context_lazy(|| OpenError::Lock {
                path: files.lock().to_owned(),
            })?;
        match lock.try_lock() {
            Ok(()) => Ok(lock),
            Err(TryLockError::WouldBlock) => Err(Report::new(OpenError::Locked {
                path: files.lock().to_owned(),
            })),
            Err(TryLockError::Error(error)) => {
                Err(Report::new(error).change_context(OpenError::Lock {
                    path: files.lock().to_owned(),
                }))
            }
        }
    }

    /// Returns the size of the file at `path`, the total size of the files under it if it is a
    /// directory, or zero if it does not exist.
    fn file_size(path: &Path) -> io::Result<u64> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
            Err(error) => return Err(error),
        };
        if !metadata.is_dir() {
            return Ok(metadata.len());
        }

        let mut total = 0_u64;
        for entry in fs::read_dir(path)? {
            total = total.saturating_add(Self::file_size(&entry?.path())?);
        }
        Ok(total)
    }

    /// Returns the disk space the workspace files use.
    fn workspace_size(&self) -> Result<ByteSize, Report<DiskUsageError>> {
        let mut used = 0_u64;
        for path in self.files.measured() {
            let size = Self::file_size(path).change_context_lazy(|| DiskUsageError::Measure {
                path: path.to_owned(),
            })?;
            used = used.saturating_add(size);
        }
        self.metrics.disk_usage(used);
        Ok(ByteSize::from_bytes(used))
    }

    /// Returns the disk space the workspace files use, or `None` if there is no disk limit.
    ///
    /// When the files are over the limit, a checkpoint writes the log into the database file and
    /// truncates the log, and the files are measured again.
    fn disk_usage(&self) -> Result<Option<DiskUsage>, Report<DiskUsageError>> {
        let Some(limit) = self.disk_limit else {
            return Ok(None);
        };
        let mut used = self.workspace_size()?;
        if used > limit {
            self.duckdb
                .execute_batch("CHECKPOINT")
                .change_context(DiskUsageError::Checkpoint)?;
            used = self.workspace_size()?;
        }
        Ok(Some(DiskUsage { used, limit }))
    }

    /// Checks the workspace files against the disk limit after a request.
    fn check_disk_limit(&self) -> Result<(), Report<StatementError>> {
        match self
            .disk_usage()
            .change_context(StatementError::DiskUsage)?
        {
            Some(DiskUsage { used, limit }) if used > limit => {
                Err(Report::new(StatementError::DiskLimit { used, limit }))
            }
            Some(_) | None => Ok(()),
        }
    }

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

        let opened = Self {
            interrupt: InterruptGuard::new(Arc::new(Interrupt::new(duckdb.interrupt_handle()))),
            duckdb,
            files,
            disk_limit: config.disk_limit,
            variables: config.variables,
            metrics,
            lock,
        };
        match opened.disk_usage().change_context(OpenError::DiskUsage)? {
            Some(DiskUsage { used, limit }) if used > limit => {
                Err(Report::new(OpenError::DiskLimit { used, limit }))
            }
            Some(_) | None => Ok(opened),
        }
    }

    /// Returns the [`Interrupt`] that cancels the requests running on this connection.
    pub(super) const fn interrupt(&self) -> &Arc<Interrupt> {
        self.interrupt.interrupt()
    }

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

    /// Copies the database file to `partial`, syncs it and renames it to `target`.
    ///
    /// An existing file at `partial` is removed first, so the copy cannot write through a link to
    /// another file, such as the database file itself.
    fn write_copy(&self, partial: &Path, target: &Path) -> io::Result<u64> {
        match fs::remove_file(partial) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let mut copy = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(partial)?;
        let bytes = io::copy(&mut File::open(self.files.database())?, &mut copy)?;
        copy.sync_all()?;
        drop(copy);
        fs::rename(partial, target)?;
        // The engine chooses `target`, and `snapshot` refuses relative paths and `..` before this
        // runs. Opening the directory only syncs the rename to disk.
        // nosemgrep: rust.actix.path-traversal.tainted-path.tainted-path
        File::open(WorkspaceFiles::directory(target))?.sync_all()?;
        Ok(bytes)
    }

    #[tracing::instrument(level = "debug", skip(self))]
    fn snapshot(&self, target: &Path) -> Result<(), Report<SnapshotError>> {
        if !target.is_absolute()
            || target
                .components()
                .any(|part| matches!(part, Component::ParentDir))
        {
            return Err(Report::new(SnapshotError::InvalidTarget {
                target: target.to_owned(),
            }));
        }
        let partial = WorkspaceFiles::partial(target);
        if self.files.contains(target) || self.files.contains(&partial) {
            return Err(Report::new(SnapshotError::WorkspaceFile {
                target: target.to_owned(),
            }));
        }

        // No statement can run between the checkpoint and the copy, because this thread owns the
        // only connection.
        self.duckdb
            .execute_batch("CHECKPOINT")
            .change_context(SnapshotError::Checkpoint)?;

        let bytes = self.write_copy(&partial, target).map_err(|error| {
            if let Err(removal) = fs::remove_file(&partial)
                && removal.kind() != io::ErrorKind::NotFound
            {
                tracing::error!(
                    error = ?removal,
                    path = %partial.display(),
                    "could not remove the partial snapshot"
                );
            }
            Report::new(error).change_context(SnapshotError::Write {
                target: target.to_owned(),
            })
        })?;
        self.metrics.snapshot(bytes);
        Ok(())
    }

    /// Checkpoints the database, then closes it whether or not the checkpoint succeeded.
    ///
    /// DuckDB also checkpoints when it closes the database, but it cannot report a failure from
    /// there.
    fn close(self) -> Result<(), Report<CloseError>> {
        let started = Instant::now();
        let checkpoint = self
            .duckdb
            .execute_batch("CHECKPOINT")
            .change_context(CloseError::Checkpoint);
        drop(self.interrupt);
        drop(self.duckdb);
        drop(self.lock);
        self.metrics.request(
            Operation::Close,
            if checkpoint.is_ok() {
                Outcome::Success
            } else {
                Outcome::Failure
            },
            started.elapsed(),
        );
        checkpoint
    }

    /// Runs `request` and sends its result on `reply`.
    ///
    /// A request whose caller stopped waiting before it started is skipped. A request that its
    /// caller cancelled was interrupted, so its result is dropped.
    ///
    /// The start is recorded before the reply is checked, so a caller that cancels the request
    /// either closed the reply before the check or interrupts the request.
    fn answer<T, C>(
        &self,
        id: RequestId,
        reply: Reply<T, C>,
        operation: Operation,
        request: impl FnOnce(&Self) -> Result<T, Report<C>>,
    ) where
        C: Error + Send + Sync + 'static,
    {
        let started = Instant::now();
        let interrupt = self.interrupt();
        interrupt.start(id);
        if reply.is_closed() {
            interrupt.finish();
            self.metrics
                .request(operation, Outcome::Skipped, started.elapsed());
            return;
        }
        let result = request(self);
        let cancelled = interrupt.finish();
        let outcome = if cancelled {
            Outcome::Cancelled
        } else if result.is_ok() {
            Outcome::Success
        } else {
            Outcome::Failure
        };
        self.metrics.request(operation, outcome, started.elapsed());
        if !cancelled {
            reply.send(result);
        }
    }

    /// Runs `commands` in order until [`Command::Close`] or until the [`Workspace`] is dropped.
    ///
    /// [`Workspace`]: crate::Workspace
    pub(super) fn run(self, commands: &mut mpsc::Receiver<(RequestId, Command)>) {
        while let Some((id, command)) = commands.blocking_recv() {
            match command {
                Command::Stage { request, reply } => {
                    self.answer(id, reply, Operation::StageTable, |connection| {
                        connection.stage_table(&request)
                    });
                }
                Command::Pipeline { request, reply } => {
                    self.answer(id, reply, Operation::PreparePipeline, |connection| {
                        connection.prepare_pipeline(&request)
                    });
                }
                Command::Link { request, reply } => {
                    self.answer(id, reply, Operation::PrepareLinkPipeline, |connection| {
                        connection.prepare_link_pipeline(&request)
                    });
                }
                Command::Query { sql, reply } => {
                    self.answer(id, reply, Operation::Query, |connection| {
                        connection.query(&sql)
                    });
                }
                Command::CreateTable { table, sql, reply } => {
                    self.answer(id, reply, Operation::CreateTable, |connection| {
                        connection.create_table(&table, &sql)
                    });
                }
                Command::Snapshot { target, reply } => {
                    self.answer(id, reply, Operation::Snapshot, |connection| {
                        connection.snapshot(&target)
                    });
                }
                Command::Close { reply } => {
                    reply.send(self.close());
                    return;
                }
            }
        }

        if let Err(report) = self.close() {
            tracing::error!(error = ?report, "could not close the dropped workspace");
        }
    }

    /// Opens the database at `path` with the limits in `config`, sends the result on `ready`, and
    /// runs `commands`.
    ///
    /// A panic while the commands run is logged. The connection is dropped while the panic
    /// unwinds, so nothing it holds is used after the panic.
    pub(super) fn serve(
        path: PathBuf,
        config: WorkspaceConfig,
        ready: Reply<Arc<Interrupt>, OpenError>,
        commands: &mut mpsc::Receiver<(RequestId, Command)>,
    ) {
        let metrics = Metrics::new();
        let started = Instant::now();
        let opened = Self::open(path, config, metrics.clone());
        metrics.request(
            Operation::Open,
            if opened.is_ok() {
                Outcome::Success
            } else {
                Outcome::Failure
            },
            started.elapsed(),
        );
        let connection = match opened {
            Ok(connection) => connection,
            Err(report) => {
                ready.send(Err(report));
                return;
            }
        };
        ready.send(Ok(Arc::clone(connection.interrupt())));

        if let Err(panic) = panic::catch_unwind(AssertUnwindSafe(|| connection.run(commands))) {
            let message = panic
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| panic.downcast_ref::<String>().map(String::as_str))
                .unwrap_or_default();
            tracing::error!(panic = message, "the workspace thread panicked");
        }
    }
}
