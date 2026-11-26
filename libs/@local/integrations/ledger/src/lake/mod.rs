//! Delta tables in an integration's place in the bucket, read and written through DuckDB.
//!
//! Each run's rows are one tagged append: the run id is the transaction's application id, so a
//! second append of a run is refused, and its rows are in a table once.

#[cfg(test)]
mod tests;

use core::{cell::Cell, pin::Pin};
use std::path::Path;

use duckdb::{Appender, Connection, Row, params};
use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;

use crate::{
    RunId,
    sql::{Identifier, Literal},
    storage::Storage,
};

/// The number of runs after which a table's log is compacted into a checkpoint, unless a test
/// sets another.
const CHECKPOINT_RUNS: u64 = 100;

/// Reports why a Delta table could not be read or written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum LakeError {
    /// The bucket, DuckDB or its extensions could not be used, or another process committed
    /// first. Trying again can help.
    #[display("the Delta table could not be reached")]
    Storage,
    /// A statement, a query or the rows are wrong, such as a query that does not parse, names a
    /// file or table that does not exist, or gives other columns than its table has. Trying again
    /// cannot help.
    #[display("the Delta table cannot hold the rows")]
    Invalid,
    /// The storage has no bucket, or its secret is not text. Trying again cannot help.
    #[display("the storage is not configured for Delta tables")]
    Unconfigured,
}

impl LakeError {
    /// The kinds of DuckDB error that fail the same way every time.
    const INVALID: [&str; 13] = [
        "Binder Error",
        "Catalog Error",
        "Constraint Error",
        "Conversion Error",
        "Divide by Zero Error",
        "INTERNAL Error",
        "Invalid Configuration Error",
        "Invalid Input Error",
        "Mismatch Type Error",
        "Not implemented Error",
        "Out of Range Error",
        "Parser Error",
        "Permission Error",
    ];

    /// What a DuckDB error means.
    ///
    /// duckdb-rs gives no kind for an error DuckDB raises, so it is read from the start of the
    /// message, such as `Binder Error: …`. An error of duckdb-rs itself, such as a wrong number of
    /// parameters or a value that does not convert, fails the same way every time.
    fn of(error: &duckdb::Error) -> Self {
        let duckdb::Error::DuckDBFailure(_, message) = error else {
            return Self::Invalid;
        };
        let message = message.as_deref().unwrap_or_default();
        // A file or Delta table that a query names and that does not exist.
        let missing = message.contains("No files found")
            || message.contains("(HTTP 404 Not Found)")
            || message.contains("DeltaKernel EmptyLogError");
        if missing || Self::INVALID.iter().any(|kind| message.starts_with(kind)) {
            Self::Invalid
        } else {
            Self::Storage
        }
    }
}

/// Turns a DuckDB error into a report of what it means.
pub(crate) fn failed(error: duckdb::Error) -> Report<LakeError> {
    let context = LakeError::of(&error);
    Report::new(error).change_context(context)
}

/// What a [`Lake`] needs of an integration's bucket, owned so that it can be opened on a blocking
/// thread.
#[derive(Debug)]
pub(crate) struct LakeSettings {
    /// The integration's place in the bucket, as `s3://bucket/prefix`.
    root: Box<str>,
    region: Box<str>,
    endpoint: Option<Box<str>>,
    use_ssl: bool,
    key_id: Box<str>,
    secret: Pin<Box<Secret<str>>>,
}

impl LakeSettings {
    /// The settings of `storage`'s bucket.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Unconfigured`] if `storage` has no bucket or its secret is not text.
    pub(crate) fn of(storage: &Storage) -> Result<Self, Report<LakeError>> {
        let bucket = storage.bucket().ok_or_else(|| {
            Report::new(LakeError::Unconfigured).attach("the storage has no bucket")
        })?;
        let secret = str::from_utf8(bucket.secret.expose())
            .change_context(LakeError::Unconfigured)
            .attach("the bucket's secret is not text")?;
        Ok(Self {
            root: bucket.uri.trim_end_matches('/').into(),
            region: bucket.region.clone(),
            endpoint: bucket.endpoint.clone(),
            use_ssl: bucket.use_ssl,
            key_id: bucket.key_id.clone(),
            secret: Secret::from_string(secret.to_owned()),
        })
    }

    /// Opens a [`Lake`] on a blocking thread, as DuckDB blocks, and runs `work` with it there.
    ///
    /// A panic in `work` is raised again here: running it again would fail the same way.
    ///
    /// # Errors
    ///
    /// Returns the error of `work`, or that of opening the lake as `from_lake` turns it.
    pub(crate) async fn run<T, C>(
        self,
        from_lake: fn(Report<LakeError>) -> Report<C>,
        work: impl FnOnce(&Lake) -> Result<T, Report<C>> + Send + 'static,
    ) -> Result<T, Report<C>>
    where
        T: Send + 'static,
        C: core::error::Error + Send + Sync + 'static,
    {
        let task = tokio::task::spawn_blocking(move || work(&self.open().map_err(from_lake)?));
        match task.await {
            Ok(result) => result,
            Err(error) if error.is_panic() => std::panic::resume_unwind(error.into_panic()),
            Err(error) => Err(from_lake(
                Report::new(error).change_context(LakeError::Storage),
            )),
        }
    }

    /// Opens an in-memory DuckDB that reaches the bucket. It blocks.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Storage`] if DuckDB cannot be opened or its extensions cannot be
    /// loaded, and the error of [`LakeError::of`] if DuckDB refuses the bucket's settings.
    pub(crate) fn open(&self) -> Result<Lake, Report<LakeError>> {
        let connection = Connection::open_in_memory().map_err(failed)?;
        connection
            .execute_batch("INSTALL httpfs; LOAD httpfs; INSTALL delta; LOAD delta;")
            .map_err(failed)
            .change_context(LakeError::Storage)?;
        let mut options = vec![
            "TYPE s3".to_owned(),
            format!("KEY_ID {}", Literal::new(&self.key_id)),
            format!("SECRET {}", Literal::new(self.secret.expose())),
            format!("REGION {}", Literal::new(&self.region)),
            format!("USE_SSL {}", self.use_ssl),
            format!("SCOPE {}", Literal::new(&self.root)),
        ];
        if let Some(endpoint) = &self.endpoint {
            options.push(format!("ENDPOINT {}", Literal::new(endpoint)));
            options.push("URL_STYLE 'path'".to_owned());
        }
        // `CREATE SECRET` takes no bound parameters. DuckDB repeats a statement it refuses in its
        // message, so the message, which holds the secret, is dropped.
        connection
            .execute_batch(&format!("CREATE SECRET lake ({})", options.join(", ")))
            .map_err(|error| {
                Report::new(LakeError::of(&error)).attach("DuckDB refused the bucket's settings")
            })?;
        Ok(Lake {
            connection,
            root: self.root.clone(),
            names: Cell::new(0),
            checkpoint_runs: CHECKPOINT_RUNS,
        })
    }
}

/// An in-memory DuckDB that reads and writes the Delta tables of an integration.
#[derive(Debug)]
pub(crate) struct Lake {
    connection: Connection,
    root: Box<str>,
    /// The number of names this lake has given out, so that each name is new.
    names: Cell<usize>,
    /// The number of runs after which a table's log is compacted into a checkpoint.
    checkpoint_runs: u64,
}

impl Lake {
    /// Compacts a table's log into a checkpoint after every `runs` runs instead of
    /// [`CHECKPOINT_RUNS`].
    #[cfg(test)]
    pub(crate) const fn checkpoint_every(mut self, runs: u64) -> Self {
        self.checkpoint_runs = runs;
        self
    }

    /// A name in the lake's SQL that no other table or database of the lake has.
    fn name(&self, prefix: &str) -> String {
        let number = self.names.get();
        self.names.set(number + 1);
        format!("{prefix}_{number}")
    }

    /// The Delta table at `key` below the integration's place. Each call attaches the table again.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if the table's location cannot be attached.
    pub(crate) fn table(&self, key: &str) -> Result<Table<'_>, Report<LakeError>> {
        let alias = self.name("lake");
        self.connection
            .execute(
                &format!("ATTACH ? AS {} (TYPE delta)", Identifier::new(&alias)),
                params![format!("{}/{key}", self.root)],
            )
            .map_err(failed)?;
        Ok(Table { lake: self, alias })
    }

    /// Runs `query` into a temporary table, in the order it gives the rows. The query runs once,
    /// and fails before anything is written to a Delta table.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Invalid`] if `query` is not one `SELECT`, and the error of
    /// [`LakeError::of`] if the query fails.
    pub(crate) fn stage_query(&self, query: &str) -> Result<Staged<'_>, Report<LakeError>> {
        // duckdb-rs runs every statement of a text, and a query cannot be a bound parameter, so
        // DuckDB's parser checks first that the query is a single `SELECT`.
        let refused: Option<String> = self
            .connection
            .query_row(
                "SELECT CASE WHEN parsed ->> '$.error' = 'true' THEN parsed ->> '$.error_message' \
                 WHEN json_array_length(parsed -> '$.statements') <> 1 THEN 'the text holds \
                 several statements' END FROM (SELECT json_serialize_sql(?::VARCHAR) AS parsed)",
                params![query],
                |row| row.get(0),
            )
            .map_err(failed)?;
        if let Some(reason) = refused {
            return Err(Report::new(LakeError::Invalid)
                .attach(format!("the query is not one `SELECT`: {reason}")));
        }
        let staged = Staged {
            lake: self,
            name: self.name("staged"),
            sequence: None,
        };
        self.connection
            .execute(
                &format!(
                    "CREATE TEMPORARY TABLE {} AS {query}",
                    Identifier::new(&staged.name)
                ),
                [],
            )
            .map_err(failed)?;
        Ok(staged)
    }

    /// An empty temporary table with `columns`, to append rows to.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if DuckDB cannot create the table.
    pub(crate) fn stage_rows(&self, columns: &Columns) -> Result<Staged<'_>, Report<LakeError>> {
        let staged = Staged {
            lake: self,
            name: self.name("staged"),
            sequence: None,
        };
        self.connection
            .execute_batch(&format!(
                "CREATE TEMPORARY TABLE {} ({})",
                Identifier::new(&staged.name),
                columns.definitions()
            ))
            .map_err(failed)?;
        Ok(staged)
    }

    /// Attaches the DuckDB database at `path`, creating it if it does not exist.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Invalid`] if `path` is not text, and the error of [`LakeError::of`]
    /// if the database cannot be attached.
    pub(crate) fn attach_database(&self, path: &Path) -> Result<Database<'_>, Report<LakeError>> {
        let path = path.to_str().ok_or_else(|| {
            Report::new(LakeError::Invalid).attach("the database's path is not text")
        })?;
        let database = Database {
            lake: self,
            name: self.name("database"),
        };
        self.connection
            .execute(
                &format!("ATTACH ? AS {}", Identifier::new(&database.name)),
                params![path],
            )
            .map_err(failed)?;
        Ok(database)
    }
}

/// One column of a table: its name and DuckDB type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Column {
    name: Box<str>,
    kind: Box<str>,
}

impl Column {
    pub(crate) fn new(name: &str, kind: &str) -> Self {
        Self {
            name: name.into(),
            kind: kind.into(),
        }
    }
}

/// The columns of the rows of a table, without `run`, which every table of the lake has first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Columns(Vec<Column>);

impl Columns {
    /// The column every table of the lake has, which holds the run of a row.
    const RUN: &str = "run";

    pub(crate) fn new(columns: impl IntoIterator<Item = Column>) -> Self {
        Self(columns.into_iter().collect())
    }

    /// The columns of the rows `select` gives.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Invalid`] if a column is named `run`, and the error of
    /// [`LakeError::of`] if `select` cannot be described.
    fn of(connection: &Connection, select: &str) -> Result<Self, Report<LakeError>> {
        let mut statement = connection
            .prepare(&format!(
                "SELECT column_name, column_type FROM (DESCRIBE {select})"
            ))
            .map_err(failed)?;
        let columns = statement
            .query_map([], |row| {
                Ok(Column {
                    name: row.get::<_, String>(0)?.into(),
                    kind: row.get::<_, String>(1)?.into(),
                })
            })
            .map_err(failed)?
            .collect::<duckdb::Result<Vec<_>>>()
            .map_err(failed)?;
        if columns
            .iter()
            .any(|column| column.name.eq_ignore_ascii_case(Self::RUN))
        {
            return Err(Report::new(LakeError::Invalid).attach("the rows have a column `run`"));
        }
        Ok(Self(columns))
    }

    /// The column definitions, in order.
    fn definitions(&self) -> String {
        self.0
            .iter()
            .map(|column| format!("{} {}", Identifier::new(&column.name), column.kind))
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// The names, in order, for a `SELECT`.
    fn names(&self) -> String {
        self.0
            .iter()
            .map(|column| Identifier::new(&column.name).to_string())
            .collect::<Vec<_>>()
            .join(", ")
    }

    /// The names, without regard to case or order, as DuckDB compares them.
    fn name_set(&self) -> Vec<String> {
        let mut names = self
            .0
            .iter()
            .map(|column| column.name.to_lowercase())
            .collect::<Vec<_>>();
        names.sort();
        names
    }
}

/// Rows in a temporary table of a [`Lake`], ready to be appended to a [`Table`].
#[derive(Debug)]
pub(crate) struct Staged<'lake> {
    lake: &'lake Lake,
    name: String,
    /// The column that holds each row's position in the staged table, if the rows carry one.
    sequence: Option<&'static str>,
}

impl Staged<'_> {
    /// Gives each row its position in the staged table, in the order the rows were staged, as
    /// the column `name`.
    #[must_use]
    pub(crate) const fn numbered(mut self, name: &'static str) -> Self {
        self.sequence = Some(name);
        self
    }

    /// An appender that adds rows to the staged table, with the values in the order of its
    /// columns.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if DuckDB cannot append to the table.
    pub(crate) fn appender(&self) -> Result<Appender<'_>, Report<LakeError>> {
        self.lake.connection.appender(&self.name).map_err(failed)
    }

    /// The `SELECT` of the staged rows, with the position column if they are numbered.
    fn select(&self) -> String {
        let table = Identifier::new(&self.name);
        self.sequence.map_or_else(
            || format!("SELECT * FROM {table}"),
            |sequence| {
                format!(
                    "SELECT rowid AS {}, * FROM {table}",
                    Identifier::new(sequence)
                )
            },
        )
    }

    /// The columns of the staged rows.
    fn columns(&self) -> Result<Columns, Report<LakeError>> {
        Columns::of(&self.lake.connection, &self.select())
    }
}

/// A DuckDB database attached to a [`Lake`], to copy rows into.
#[derive(Debug)]
pub(crate) struct Database<'lake> {
    lake: &'lake Lake,
    name: String,
}

impl Database<'_> {
    /// Detaches the database, so that another connection can open it.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if DuckDB cannot detach it.
    pub(crate) fn detach(self) -> Result<(), Report<LakeError>> {
        self.lake
            .connection
            .execute_batch(&format!("DETACH {}", Identifier::new(&self.name)))
            .map_err(failed)
    }
}

/// A Delta table attached to a [`Lake`], partitioned by run.
#[derive(Debug)]
pub(crate) struct Table<'lake> {
    lake: &'lake Lake,
    alias: String,
}

impl Table<'_> {
    const fn connection(&self) -> &Connection {
        &self.lake.connection
    }

    fn name(&self) -> Identifier<'_> {
        Identifier::new(&self.alias)
    }

    /// Whether the table has been created.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if the table's location cannot be read.
    pub(crate) fn exists(&self) -> Result<bool, Report<LakeError>> {
        self.connection()
            .query_row(
                "SELECT count(*) > 0 FROM duckdb_tables() WHERE database_name = ?",
                params![self.alias],
                |row| row.get(0),
            )
            .map_err(failed)
    }

    /// Creates the table with `columns` if it does not exist, or checks that it has them.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Invalid`] if the table has other columns, and the error of
    /// [`LakeError::of`] if the table cannot be read or created.
    fn ensure(&self, columns: &Columns) -> Result<(), Report<LakeError>> {
        if !self.exists()? {
            // `CREATE TABLE IF NOT EXISTS` on a Delta table breaks the next insert. Column
            // definitions take no bound parameters.
            let created = self
                .connection()
                .execute_batch(&format!(
                    "CREATE TABLE {}.{} ({} VARCHAR, {}) PARTITIONED BY ({})",
                    self.name(),
                    self.name(),
                    Columns::RUN,
                    columns.definitions(),
                    Columns::RUN
                ))
                .map_err(failed);
            match created {
                Ok(()) => return Ok(()),
                // Another process may have created it since `exists` looked.
                Err(report) if !self.exists()? => return Err(report),
                Err(_) => {}
            }
        }
        let table = Columns::of(
            self.connection(),
            &format!("SELECT * EXCLUDE ({}) FROM {}", Columns::RUN, self.name()),
        )?;
        if table.name_set() == columns.name_set() {
            Ok(())
        } else {
            Err(Report::new(LakeError::Invalid).attach(format!(
                "the rows have the columns {}, and the table {}",
                columns.names(),
                table.names()
            )))
        }
    }

    /// Whether the rows of `run` have been appended. A table that does not exist has no runs.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if the table's log cannot be read.
    pub(crate) fn has_run(&self, run: RunId) -> Result<bool, Report<LakeError>> {
        if !self.exists()? {
            return Ok(false);
        }
        self.connection()
            .query_row(
                "SELECT * FROM delta_get_transaction_version(?, ?)",
                params![self.alias, run.to_string()],
                |row| row.get::<_, Option<u64>>(0),
            )
            .map(|version| version.is_some())
            .map_err(failed)
    }

    /// The number of rows of `run`.
    ///
    /// # Errors
    ///
    /// Returns the error of [`LakeError::of`] if the table cannot be read.
    pub(crate) fn rows(&self, run: RunId) -> Result<u64, Report<LakeError>> {
        self.connection()
            .query_row(
                &format!("SELECT count(*) FROM {} WHERE run = ?", self.name()),
                params![run.to_string()],
                |row| row.get(0),
            )
            .map_err(failed)
    }

    /// The rows of `run`, with `columns` in their order, each turned into a `T` by `read`.
    ///
    /// # Errors
    ///
    /// Returns the error of `read`, or that of [`LakeError::of`] as `from_lake` turns it if the
    /// table cannot be read.
    pub(crate) fn read_run<T, C: core::error::Error + Send + Sync + 'static>(
        &self,
        run: RunId,
        columns: &Columns,
        from_lake: fn(Report<LakeError>) -> Report<C>,
        mut read: impl FnMut(&Row<'_>) -> Result<T, Report<C>>,
    ) -> Result<Vec<T>, Report<C>> {
        let mut statement = self
            .connection()
            .prepare(&format!(
                "SELECT {} FROM {} WHERE run = ?",
                columns.names(),
                self.name()
            ))
            .map_err(failed)
            .map_err(from_lake)?;
        let mut found = statement
            .query(params![run.to_string()])
            .map_err(failed)
            .map_err(from_lake)?;
        let mut rows = Vec::new();
        while let Some(row) = found.next().map_err(failed).map_err(from_lake)? {
            rows.push(read(row)?);
        }
        Ok(rows)
    }

    /// Copies the rows of `run` into a new table `into` of `database`, without the `run` column
    /// and the column `order`, in the order of `order`.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Invalid`] if the table does not exist, and the error of
    /// [`LakeError::of`] if it cannot be read or the database cannot be written.
    pub(crate) fn copy_run(
        &self,
        run: RunId,
        database: &Database<'_>,
        into: &str,
        order: &str,
    ) -> Result<(), Report<LakeError>> {
        if !self.exists()? {
            return Err(Report::new(LakeError::Invalid).attach("the table does not exist"));
        }
        let order = Identifier::new(order);
        self.connection()
            .execute(
                &format!(
                    "CREATE TABLE {}.{} AS SELECT * EXCLUDE ({}, {order}) FROM {} WHERE run = ? \
                     ORDER BY {order}",
                    Identifier::new(&database.name),
                    Identifier::new(into),
                    Columns::RUN,
                    self.name()
                ),
                params![run.to_string()],
            )
            .map_err(failed)?;
        Ok(())
    }

    /// Appends `staged` as the rows of `run`, matching its columns to the table's by name, in one
    /// commit tagged with `run`, and returns the number of rows of `run` in the table. The table
    /// is created with the columns of the first rows appended to it.
    ///
    /// A run whose rows were appended before is left as it is, also if another process appends
    /// it at the same time. An append without rows commits nothing, so it does not mark the run
    /// as appended.
    ///
    /// # Errors
    ///
    /// Returns [`LakeError::Invalid`] if the rows have other columns than the table, or a column
    /// `run`, and the error of [`LakeError::of`] if the rows do not fit the table or it cannot be
    /// read or written. An error after the commit leaves the rows in the table, and appending
    /// again returns their number.
    pub(crate) fn append_run(
        &self,
        run: RunId,
        staged: &Staged<'_>,
    ) -> Result<u64, Report<LakeError>> {
        if self.has_run(run)? {
            self.checkpoint();
            return self.rows(run);
        }
        self.ensure(&staged.columns()?)?;
        let connection = self.connection();
        connection
            .execute_batch("BEGIN TRANSACTION")
            .map_err(failed)?;
        let appended = connection
            .execute(
                "CALL delta_set_transaction_version(?, ?, 1::UBIGINT, NULL::UBIGINT)",
                params![self.alias, run.to_string()],
            )
            .and_then(|_| {
                connection.execute(
                    &format!(
                        "INSERT INTO {} BY NAME SELECT ?::VARCHAR AS {}, * FROM ({})",
                        self.name(),
                        Columns::RUN,
                        staged.select()
                    ),
                    params![run.to_string()],
                )
            })
            .and_then(|_| connection.execute_batch("COMMIT"));
        if let Err(error) = appended {
            return self.recover(run, failed(error));
        }
        self.checkpoint();
        self.rows(run)
    }

    /// Ends the transaction of an append that failed with `report`. Another process may have
    /// appended the run since `has_run` looked, so the run's rows are counted if it did.
    fn recover(&self, run: RunId, mut report: Report<LakeError>) -> Result<u64, Report<LakeError>> {
        let connection = self.connection();
        // A failed `COMMIT` has ended the transaction already.
        if !connection.is_autocommit()
            && let Err(rollback) = connection.execute_batch("ROLLBACK")
        {
            report = report.attach(format!(
                "the transaction could not be rolled back: {rollback}"
            ));
        }
        match self.has_run(run) {
            Ok(true) => self.rows(run),
            Ok(false) => Err(report),
            Err(check) => Err(report.attach(format!(
                "whether another process appended the run could not be read: {check:?}"
            ))),
        }
    }

    /// Compacts the table's log into a checkpoint when the number of runs in it is a multiple of
    /// [`CHECKPOINT_RUNS`], or the number a test set. DuckDB does not write checkpoints on its own,
    /// and without them every read replays the whole log. A checkpoint that fails is logged:
    /// the rows are committed, and a later checkpoint compacts the log.
    fn checkpoint(&self) {
        let checkpointed = self
            .connection()
            .query_row(
                &format!("SELECT count(DISTINCT run) FROM {}", self.name()),
                [],
                |row| row.get::<_, u64>(0),
            )
            .and_then(|runs| {
                if runs > 0 && runs.is_multiple_of(self.lake.checkpoint_runs) {
                    self.connection()
                        .execute_batch(&format!("CHECKPOINT {}", self.name()))
                } else {
                    Ok(())
                }
            });
        if let Err(error) = checkpointed {
            tracing::warn!(%error, "the Delta table's log could not be compacted into a checkpoint");
        }
    }
}
