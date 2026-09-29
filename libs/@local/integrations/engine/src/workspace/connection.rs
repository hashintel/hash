use std::{
    fs::{self, File},
    io,
    path::{Path, PathBuf},
    sync::mpsc,
};

use duckdb::{Config, params_from_iter, types::Value};
use error_stack::{Report, ResultExt as _};
use tokio::sync::oneshot;

use super::{
    Command, Rows, WorkspaceConfig,
    error::{CloseError, OpenError, SnapshotError, StatementError},
};
use crate::sql::StringLiteral;

/// Sends `result` to the caller that waits for it.
///
/// A caller that stopped waiting does not see the result, so a failure is logged instead.
pub(super) fn send_reply<T, C>(
    sender: oneshot::Sender<Result<T, Report<C>>>,
    result: Result<T, Report<C>>,
) {
    if let Err(Err(report)) = sender.send(result) {
        tracing::warn!(error = ?report, "workspace command failed after its caller stopped waiting");
    }
}

/// The database's only connection, owned by the workspace thread.
pub(super) struct Connection {
    duckdb: duckdb::Connection,
    path: PathBuf,
}

impl Connection {
    /// Formats `directories` as a DuckDB list of strings.
    fn directory_list(directories: &[PathBuf]) -> Result<String, Report<OpenError>> {
        let literals = directories
            .iter()
            .map(|path| {
                if !path.is_absolute() {
                    return Err(Report::new(OpenError::RelativeDirectory {
                        path: path.clone(),
                    }));
                }
                path.to_str()
                    .map(|text| StringLiteral::new(text).to_string())
                    .ok_or_else(|| Report::new(OpenError::NonUtf8Directory { path: path.clone() }))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(format!("[{}]", literals.join(", ")))
    }

    /// Opens the database at `path` and locks its settings.
    ///
    /// The extension settings apply before the database opens. DuckDB accepts
    /// `allowed_directories` only from a `SET` statement, which must run while external access is
    /// still enabled. `lock_configuration` then stops statements from changing any setting.
    pub(super) fn open(path: PathBuf, config: &WorkspaceConfig) -> Result<Self, Report<OpenError>> {
        let allowed_directories = Self::directory_list(&config.allowed_directories)?;
        let mut duckdb_config = Config::default();
        for setting in [
            "allow_community_extensions",
            "autoinstall_known_extensions",
            "autoload_known_extensions",
        ] {
            duckdb_config = duckdb_config
                .with(setting, "false")
                .change_context(OpenError::Configure { setting })?;
        }
        let connection = duckdb::Connection::open_with_flags(&path, duckdb_config)
            .change_context_lazy(|| OpenError::Open { path: path.clone() })?;

        for (setting, value) in [
            ("allowed_directories", allowed_directories.as_str()),
            ("enable_external_access", "false"),
            ("lock_configuration", "true"),
        ] {
            connection
                .execute_batch(&format!("SET {setting} = {value}"))
                .change_context(OpenError::Configure { setting })?;
        }

        Ok(Self {
            duckdb: connection,
            path,
        })
    }

    fn execute(&self, sql: &str, params: Vec<Value>) -> Result<(), Report<StatementError>> {
        let mut statement = self
            .duckdb
            .prepare(sql)
            .change_context(StatementError::Failed)?;
        statement
            .execute(params_from_iter(params))
            .change_context(StatementError::Failed)?;
        Ok(())
    }

    fn query(&self, sql: &str, params: Vec<Value>) -> Result<Rows, Report<StatementError>> {
        let mut statement = self
            .duckdb
            .prepare(sql)
            .change_context(StatementError::Failed)?;
        let mut rows = Vec::new();

        let mut results = statement
            .query(params_from_iter(params))
            .change_context(StatementError::Failed)?;
        while let Some(row) = results.next().change_context(StatementError::Failed)? {
            let width = row.as_ref().column_count();
            let values = (0..width)
                .map(|index| row.get::<_, Value>(index))
                .collect::<Result<Vec<_>, _>>()
                .change_context(StatementError::Failed)?;
            rows.push(values);
        }
        drop(results);

        Ok(Rows::new(statement.column_names(), rows))
    }

    /// Copies the database file to `target` through a file next to it.
    ///
    /// The copy is synced before it replaces `target`, and the directory is synced after, so a
    /// failure leaves any existing file at `target` as it was.
    fn copy_database(&self, target: &Path) -> io::Result<()> {
        let mut partial = target.as_os_str().to_owned();
        partial.push(".partial");
        let partial = PathBuf::from(partial);

        fs::copy(&self.path, &partial)?;
        File::open(&partial)?.sync_all()?;
        fs::rename(&partial, target)?;

        let directory = target
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        File::open(directory)?.sync_all()
    }

    fn snapshot(&self, target: &Path) -> Result<(), Report<SnapshotError>> {
        // No statement can run between the checkpoint and the copy, because this thread owns the
        // only connection.
        self.duckdb
            .execute_batch("CHECKPOINT")
            .change_context(SnapshotError::Checkpoint)?;

        self.copy_database(target)
            .change_context_lazy(|| SnapshotError::Write {
                target: target.to_owned(),
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
        drop(self);
        checkpoint
    }

    /// Runs `commands` in order until [`Command::Close`] or until the [`Workspace`] is dropped.
    ///
    /// [`Workspace`]: super::Workspace
    pub(super) fn run(self, commands: &mpsc::Receiver<Command>) {
        while let Ok(command) = commands.recv() {
            match command {
                Command::Execute { sql, params, reply } => {
                    send_reply(reply, self.execute(&sql, params));
                }
                Command::Query { sql, params, reply } => {
                    send_reply(reply, self.query(&sql, params));
                }
                Command::Snapshot { target, reply } => send_reply(reply, self.snapshot(&target)),
                Command::Close { reply } => {
                    send_reply(reply, self.close());
                    return;
                }
            }
        }
    }
}
