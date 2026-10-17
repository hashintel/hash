use alloc::sync::Arc;
use core::{error::Error, panic::AssertUnwindSafe};
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io, panic,
    path::{Path, PathBuf},
    sync::mpsc,
};

use duckdb::{Config, types::Value};
use error_stack::{Report, ResultExt as _};

use crate::{
    sql::Identifier,
    workspace::{
        CloseError, Command, OpenError, Rows, Setting, SnapshotError, StatementError,
        files::WorkspaceFiles,
        interrupt::{Interrupt, InterruptGuard, RequestId},
        reply::Reply,
        select::Select,
    },
};

/// The database's only connection, owned by the workspace thread.
///
/// Fields are dropped in declaration order, so `interrupt` stops interrupts before `duckdb` closes
/// the database, and `lock` is released after it.
pub(super) struct Connection {
    interrupt: InterruptGuard,
    duckdb: duckdb::Connection,
    files: WorkspaceFiles,
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

    /// Opens the database at `path` with its settings locked.
    pub(super) fn open(path: PathBuf) -> Result<Self, Report<OpenError>> {
        let files = WorkspaceFiles::new(path);
        let lock = Self::lock(&files)?;

        let mut config = Config::default();
        for (setting, value) in [
            (Setting::AllowCommunityExtensions, "false"),
            (Setting::AutoinstallKnownExtensions, "false"),
            (Setting::AutoloadKnownExtensions, "false"),
            (Setting::EnableExternalAccess, "false"),
            (Setting::LockConfiguration, "true"),
        ] {
            config = config
                .with(setting.to_string(), value)
                .change_context_lazy(|| OpenError::Configure {
                    setting,
                    value: value.into(),
                })?;
        }
        let duckdb = duckdb::Connection::open_with_flags(files.database(), config)
            .change_context_lazy(|| OpenError::Open {
                path: files.database().to_owned(),
            })?;

        Ok(Self {
            interrupt: InterruptGuard::new(Arc::new(Interrupt::new(duckdb.interrupt_handle()))),
            duckdb,
            files,
            lock,
        })
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

    #[tracing::instrument(level = "debug", skip_all)]
    fn query(&self, sql: &str) -> Result<Rows, Report<StatementError>> {
        let select = self.select(sql)?;
        let mut statement = self
            .duckdb
            .prepare(select.as_str())
            .map_err(StatementError::from_duckdb)?;
        let mut results = statement.query([]).map_err(StatementError::from_duckdb)?;

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

        let mut rows = Vec::new();
        while let Some(row) = results.next().map_err(StatementError::from_duckdb)? {
            let values = (0..row.as_ref().column_count())
                .map(|index| row.get::<_, Value>(index))
                .collect::<Result<Box<[_]>, _>>()
                .map_err(StatementError::from_duckdb)?;
            rows.push(values);
        }
        drop(results);

        let columns = statement
            .column_names()
            .into_iter()
            .map(String::into_boxed_str)
            .collect();
        Ok(Rows::new(columns, rows))
    }

    #[tracing::instrument(level = "debug", skip(self, sql))]
    fn create_table(&self, table: &str, sql: &str) -> Result<(), Report<StatementError>> {
        let select = self.select(sql)?;
        // `select` is one statement, so the whole text is one statement as well.
        self.duckdb
            .prepare(&format!(
                "CREATE OR REPLACE TABLE {} AS {}",
                Identifier::new(table),
                select.as_str()
            ))
            .and_then(|mut statement| statement.execute([]))
            .map_err(StatementError::from_duckdb)?;
        Ok(())
    }

    /// Copies the database file to `partial`, syncs it and renames it to `target`.
    ///
    /// An existing file at `partial` is removed first, so the copy cannot write through a link to
    /// another file, such as the database file itself.
    fn write_copy(&self, partial: &Path, target: &Path) -> io::Result<()> {
        match fs::remove_file(partial) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let mut copy = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(partial)?;
        io::copy(&mut File::open(self.files.database())?, &mut copy)?;
        copy.sync_all()?;
        drop(copy);
        fs::rename(partial, target)?;

        let directory = target
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        File::open(directory)?.sync_all()
    }

    #[tracing::instrument(level = "debug", skip(self))]
    fn snapshot(&self, target: &Path) -> Result<(), Report<SnapshotError>> {
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

        self.write_copy(&partial, target).map_err(|error| {
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
        })
    }

    /// Checkpoints the database, then closes it whether or not the checkpoint succeeded.
    ///
    /// DuckDB also checkpoints when it closes the database, but it cannot report a failure from
    /// there.
    fn close(self) -> Result<(), Report<CloseError>> {
        let checkpoint = self
            .duckdb
            .execute_batch("CHECKPOINT")
            .change_context(CloseError::Checkpoint);
        drop(self.interrupt);
        drop(self.duckdb);
        drop(self.lock);
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
        request: impl FnOnce(&Self) -> Result<T, Report<C>>,
    ) where
        C: Error + Send + Sync + 'static,
    {
        let interrupt = self.interrupt();
        interrupt.start(id);
        if reply.is_closed() {
            interrupt.finish();
            return;
        }
        let result = request(self);
        if !interrupt.finish() {
            reply.send(result);
        }
    }

    /// Runs `commands` in order until [`Command::Close`] or until the [`Workspace`] is dropped.
    ///
    /// [`Workspace`]: crate::Workspace
    pub(super) fn run(self, commands: &mpsc::Receiver<(RequestId, Command)>) {
        while let Ok((id, command)) = commands.recv() {
            match command {
                Command::Query { sql, reply } => {
                    self.answer(id, reply, |connection| connection.query(&sql));
                }
                Command::CreateTable { table, sql, reply } => {
                    self.answer(id, reply, |connection| {
                        connection.create_table(&table, &sql)
                    });
                }
                Command::Snapshot { target, reply } => {
                    self.answer(id, reply, |connection| connection.snapshot(&target));
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

    /// Opens the database at `path`, sends the result on `ready`, and runs `commands`.
    ///
    /// A panic while the commands run is logged. The connection is dropped while the panic
    /// unwinds, so nothing it holds is used after the panic.
    pub(super) fn serve(
        path: PathBuf,
        ready: Reply<Arc<Interrupt>, OpenError>,
        commands: &mpsc::Receiver<(RequestId, Command)>,
    ) {
        let connection = match Self::open(path) {
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
