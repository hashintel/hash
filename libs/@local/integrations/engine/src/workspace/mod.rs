mod connection;
mod error;
mod files;
mod interrupt;
mod reply;
mod rows;
mod select;

use alloc::sync::Arc;
use core::error::Error;
use std::{path::PathBuf, thread};

use error_stack::{Report, ResultExt as _};
use tokio::sync::mpsc;

pub use self::{
    error::{CloseError, DataErrorType, OpenError, QueryErrorType, Setting, StatementError},
    rows::Rows,
};
use crate::workspace::{
    connection::Connection,
    interrupt::{Interrupt, Pending, RequestId},
    reply::Reply,
};

/// A request to the workspace thread, with the channel for its reply.
enum Command {
    Query {
        sql: Box<str>,
        reply: Reply<Rows, StatementError>,
    },
    CreateTable {
        table: Box<str>,
        sql: Box<str>,
        reply: Reply<(), StatementError>,
    },
    Close {
        reply: Reply<(), CloseError>,
    },
}

/// A DuckDB database file in which an integration's queries run.
///
/// A dedicated thread owns the database's only connection and runs queries in the order they
/// are sent. A query is a single `SELECT` statement, and the only table functions it can call are
/// `range`, `generate_series` and `unnest`. Queries cannot open files, load extensions or change
/// settings.
/// At most one request waits in the queue; further callers wait for space before sending theirs.
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
    /// Opens the database at `path`, creating it if it does not exist.
    ///
    /// # Errors
    ///
    /// - [`Lock`] if `<database>.lock` cannot be created or locked
    /// - [`Locked`] if another workspace has the database open
    /// - [`Configure`] if DuckDB refuses a setting
    /// - [`Open`] if DuckDB cannot open the database
    /// - [`Spawn`] if the workspace thread cannot be started
    /// - [`Stopped`] if the workspace thread stopped before it opened the database
    ///
    /// [`Lock`]: OpenError::Lock
    /// [`Locked`]: OpenError::Locked
    /// [`Configure`]: OpenError::Configure
    /// [`Open`]: OpenError::Open
    /// [`Spawn`]: OpenError::Spawn
    /// [`Stopped`]: OpenError::Stopped
    pub async fn open(path: PathBuf) -> Result<Self, Report<OpenError>> {
        let (commands, mut receiver) = mpsc::channel(1);
        let (ready, opened) = Reply::channel();
        let span = tracing::info_span!("workspace", path = %path.display());

        thread::Builder::new()
            .name("integrations-workspace".to_owned())
            .spawn(move || {
                let _entered = span.entered();
                Connection::serve(path, ready, &mut receiver);
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

    /// Runs the query `sql` and returns all of its rows.
    ///
    /// # Errors
    ///
    /// - [`NotSelect`] if DuckDB does not read `sql` as a `SELECT` query
    /// - [`StatementCount`] if `sql` is not exactly one statement
    /// - [`TableFunction`] if the query calls a table function that is not allowed
    /// - [`UnsupportedType`] if a column has a type whose values cannot be read
    /// - [`InvalidQuery`] if DuckDB cannot run the query as written
    /// - [`InvalidData`] if a value in the rows causes an error
    /// - [`Failed`] if DuckDB fails for another reason or a value cannot be read
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`UnsupportedType`]: StatementError::UnsupportedType
    /// [`InvalidQuery`]: StatementError::InvalidQuery
    /// [`InvalidData`]: StatementError::InvalidData
    /// [`Failed`]: StatementError::Failed
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
    /// - [`InvalidQuery`] if DuckDB cannot run the query as written
    /// - [`InvalidData`] if a value in the rows causes an error
    /// - [`Failed`] if DuckDB fails for another reason
    /// - [`Stopped`] if the workspace thread stopped
    ///
    /// [`NotSelect`]: StatementError::NotSelect
    /// [`StatementCount`]: StatementError::StatementCount
    /// [`TableFunction`]: StatementError::TableFunction
    /// [`InvalidQuery`]: StatementError::InvalidQuery
    /// [`InvalidData`]: StatementError::InvalidData
    /// [`Failed`]: StatementError::Failed
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
