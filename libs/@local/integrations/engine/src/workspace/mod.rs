mod connection;
mod error;
mod rows;

use core::error::Error;
use std::{path::PathBuf, sync::mpsc, thread};

use duckdb::types::Value;
use error_stack::{Report, ResultExt as _};
use tokio::sync::oneshot;

use self::connection::Connection;
pub use self::{
    error::{CloseError, OpenError, SnapshotError, StatementError},
    rows::Rows,
};

/// Settings for a [`Workspace`].
#[derive(Debug, Default)]
pub struct WorkspaceConfig {
    /// The directories whose files statements can read and write, as absolute paths.
    ///
    /// Statements can also write in DuckDB's temporary directory, `<database>.tmp`, once DuckDB
    /// has created it. They cannot open any other file.
    pub allowed_directories: Vec<PathBuf>,
}

/// A request to the workspace thread, with the channel for its reply.
enum Command {
    Execute {
        sql: String,
        params: Vec<Value>,
        reply: oneshot::Sender<Result<(), Report<StatementError>>>,
    },
    Query {
        sql: String,
        params: Vec<Value>,
        reply: oneshot::Sender<Result<Rows, Report<StatementError>>>,
    },
    Snapshot {
        target: PathBuf,
        reply: oneshot::Sender<Result<(), Report<SnapshotError>>>,
    },
    Close {
        reply: oneshot::Sender<Result<(), Report<CloseError>>>,
    },
}

/// A DuckDB database file in which an integration's statements run.
///
/// A dedicated thread owns the database's only connection and runs statements in the order they
/// are sent. Statements can open files only in [`WorkspaceConfig::allowed_directories`] and in
/// DuckDB's temporary directory. They cannot install extensions or change settings.
///
/// A statement can begin a transaction. Until a later statement commits it or rolls it back,
/// [`snapshot`](Self::snapshot) and [`close`](Self::close) fail if the transaction has changes,
/// because DuckDB cannot checkpoint the database.
///
/// Dropping the workspace closes the database after the statements already sent have run. It
/// does not wait for that, and it does not report a failed checkpoint. [`close`](Self::close)
/// waits and reports a failed checkpoint.
#[derive(Debug)]
pub struct Workspace {
    commands: mpsc::Sender<Command>,
}

impl Workspace {
    /// Opens the database at `path`, creating it if it does not exist.
    ///
    /// # Errors
    ///
    /// - [`RelativeDirectory`] if an allowed directory is not an absolute path
    /// - [`NonUtf8Directory`] if an allowed directory is not valid UTF-8
    /// - [`Configure`] if DuckDB refuses a setting
    /// - [`Open`] if DuckDB cannot open the database
    /// - [`Spawn`] if the workspace thread cannot be started
    /// - [`Stopped`] if the workspace thread stopped before it opened the database
    ///
    /// [`RelativeDirectory`]: OpenError::RelativeDirectory
    /// [`NonUtf8Directory`]: OpenError::NonUtf8Directory
    /// [`Configure`]: OpenError::Configure
    /// [`Open`]: OpenError::Open
    /// [`Spawn`]: OpenError::Spawn
    /// [`Stopped`]: OpenError::Stopped
    pub async fn open(path: PathBuf, config: WorkspaceConfig) -> Result<Self, Report<OpenError>> {
        let (commands, receiver) = mpsc::channel();
        let (ready, opened) = oneshot::channel();

        thread::Builder::new()
            .name("integrations-workspace".to_owned())
            .spawn(move || match Connection::open(path, &config) {
                Ok(connection) => {
                    connection::send_reply(ready, Ok(()));
                    connection.run(&receiver);
                }
                Err(report) => connection::send_reply(ready, Err(report)),
            })
            .change_context(OpenError::Spawn)?;

        opened.await.change_context(OpenError::Stopped)??;
        Ok(Self { commands })
    }

    /// Sends `command` and waits for the reply that `result` receives.
    async fn request<T, C>(
        &self,
        command: Command,
        result: oneshot::Receiver<Result<T, Report<C>>>,
        stopped: C,
    ) -> Result<T, Report<C>>
    where
        C: Error + Send + Sync + 'static,
    {
        if self.commands.send(command).is_err() {
            return Err(Report::new(stopped));
        }
        result.await.change_context(stopped)?
    }

    /// Runs a statement that returns no rows, such as `CREATE TABLE` or `INSERT`.
    ///
    /// Each `?` in `sql` is replaced by the next value from `params`.
    ///
    /// # Errors
    ///
    /// - [`Failed`] if DuckDB cannot prepare or run the statement
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`Failed`]: StatementError::Failed
    /// [`Stopped`]: StatementError::Stopped
    pub async fn execute(
        &self,
        sql: String,
        params: impl IntoIterator<Item = Value>,
    ) -> Result<(), Report<StatementError>> {
        let (reply, result) = oneshot::channel();
        let command = Command::Execute {
            sql,
            params: params.into_iter().collect(),
            reply,
        };
        self.request(command, result, StatementError::Stopped).await
    }

    /// Runs a query and returns all of its rows.
    ///
    /// Each `?` in `sql` is replaced by the next value from `params`.
    ///
    /// # Errors
    ///
    /// - [`Failed`] if DuckDB cannot prepare or run the query, or cannot read a value
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`Failed`]: StatementError::Failed
    /// [`Stopped`]: StatementError::Stopped
    pub async fn query(
        &self,
        sql: String,
        params: impl IntoIterator<Item = Value>,
    ) -> Result<Rows, Report<StatementError>> {
        let (reply, result) = oneshot::channel();
        let command = Command::Query {
            sql,
            params: params.into_iter().collect(),
            reply,
        };
        self.request(command, result, StatementError::Stopped).await
    }

    /// Writes a copy of the database to `target` that DuckDB can open on its own.
    ///
    /// The copy holds the changes of every statement sent before the snapshot, and none sent after
    /// it. It is synced to disk before this returns, and it replaces an existing file at `target`
    /// only once it is complete.
    ///
    /// # Errors
    ///
    /// - [`Checkpoint`] if DuckDB cannot write its log into the database file, for example while a
    ///   transaction holds uncommitted changes
    /// - [`Write`] if the copy cannot be written or synced
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`Checkpoint`]: SnapshotError::Checkpoint
    /// [`Write`]: SnapshotError::Write
    /// [`Stopped`]: SnapshotError::Stopped
    pub async fn snapshot(&self, target: PathBuf) -> Result<(), Report<SnapshotError>> {
        let (reply, result) = oneshot::channel();
        self.request(
            Command::Snapshot { target, reply },
            result,
            SnapshotError::Stopped,
        )
        .await
    }

    /// Checkpoints and closes the database after the statements already sent have run.
    ///
    /// The database is closed even if the checkpoint fails. Changes of a transaction that was not
    /// committed are then lost.
    ///
    /// # Errors
    ///
    /// - [`Checkpoint`] if DuckDB cannot write its log into the database file, for example while a
    ///   transaction holds uncommitted changes
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`Checkpoint`]: CloseError::Checkpoint
    /// [`Stopped`]: CloseError::Stopped
    pub async fn close(self) -> Result<(), Report<CloseError>> {
        let (reply, result) = oneshot::channel();
        self.request(Command::Close { reply }, result, CloseError::Stopped)
            .await
    }
}
