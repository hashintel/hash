//! Connections that keep what the server says outside a statement's results.
//!
//! Postgres reports warnings and notices on the same wire as query results, but `tokio_postgres`
//! delivers them on a side channel that only [`Connection::poll_message`] exposes. Awaiting the
//! connection — which is what a pool does — passes a notice's severity text and primary message to
//! the `log` facade and drops the rest: its SQLSTATE, detail, hint and context, the
//! machine-readable severity, and every notification outright. `SET LOCAL` outside a transaction,
//! for instance, is only ever reported as a warning.
//!
//! A [`ManagedConnection`] owns a task that drives that channel instead, so a message keeps its
//! structure and becomes a tracing event under [`SERVER_TARGET`] at the level of its severity.
//!
//! [`Connection::poll_message`]: tokio_postgres::Connection::poll_message

use core::{
    error::Error,
    fmt,
    future::{Future, ready},
    sync::atomic::{AtomicU64, Ordering},
};

use deadpool::managed::{HookError, Metrics, PoolError, RecycleError, RecycleResult, TimeoutType};
use error_stack::{Report, ResultExt as _};
use futures::{Stream, StreamExt as _, future::BoxFuture, stream};
use tokio::task::JoinHandle;
use tokio_postgres::{
    AsyncMessage, Client, Config, Socket,
    error::{DbError, Severity},
    tls::{MakeTlsConnect, TlsConnect},
};

/// The TLS setup a connection is established with.
pub trait PostgresTls = Clone
    + MakeTlsConnect<
        Socket,
        Stream: Send + Sync,
        TlsConnect: TlsConnect<Socket, Future: Send> + Send + Sync,
    > + Send
    + Sync
    + 'static;

/// The target a message from the server is recorded under.
///
/// The name is rooted in the crate's path, so a crate-wide `RUST_LOG` directive matches it as well
/// as one naming it alone: [`EnvFilter`] matches a target by prefix.
///
/// [`EnvFilter`]: https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html
pub const SERVER_TARGET: &str = "hash_graph_postgres_store::server";

/// Failure to provide a connection to Postgres.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[display("Could not provide a connection to Postgres: {_variant}")]
pub enum ConnectionError {
    /// The connection could not be established.
    ///
    /// The cause covers both the permanently fatal — a rejected password, a missing database — and
    /// the transient, such as a refused connection or a server still starting up. The
    /// [`tokio_postgres::Error`] the report was raised from tells them apart: it carries a SQLSTATE
    /// where the server answered and an I/O error where it did not.
    #[display("the connection could not be established")]
    Connect,
    /// The pool is closed and hands out no further connections.
    #[display("the pool is closed")]
    Closed,
    /// The pool had no connection to hand out.
    ///
    /// A configured timeout elapsed, or the pool has no runtime to time one out with.
    #[display("no connection could be handed out")]
    Unavailable,
}

impl Error for ConnectionError {}

impl ConnectionError {
    /// Reads what a pool says about failing to hand out a connection.
    ///
    /// A failure to establish one carries its own report, which is kept. The pool's own failures
    /// become [`ConnectionError::Unavailable`] or [`ConnectionError::Closed`].
    pub(crate) fn from_pool(error: PoolError<Report<Self>>) -> Report<Self> {
        match error {
            PoolError::Backend(report) | PoolError::PostCreateHook(HookError::Backend(report)) => {
                report
            }
            PoolError::Timeout(TimeoutType::Wait) => Report::new(Self::Unavailable)
                .attach("the pool timed out waiting for a connection to become available"),
            PoolError::Timeout(TimeoutType::Create) => Report::new(Self::Unavailable)
                .attach("the pool timed out establishing a connection"),
            PoolError::Timeout(TimeoutType::Recycle) => {
                Report::new(Self::Unavailable).attach("the pool timed out recycling a connection")
            }
            PoolError::Closed => Report::new(Self::Closed),
            PoolError::NoRuntimeSpecified => Report::new(Self::Unavailable)
                .attach("the pool needs a runtime to time an operation out"),
            PoolError::PostCreateHook(HookError::Message(message)) => {
                Report::new(Self::Unavailable).attach(message)
            }
        }
    }
}

/// Records a message the server sent outside of a statement's results on connection `id`.
fn record(id: u64, message: AsyncMessage) {
    match message {
        AsyncMessage::Notice(notice) => report(id, &notice),
        AsyncMessage::Notification(notification) => tracing::info!(
            target: SERVER_TARGET,
            connection = id,
            channel = notification.channel(),
            process_id = notification.process_id(),
            payload = notification.payload(),
            "Postgres sent a notification",
        ),
        // `AsyncMessage` is `#[non_exhaustive]`, so a driver newer than this arm can send a kind of
        // message neither variant covers.
        unrecognized => tracing::warn!(
            target: SERVER_TARGET,
            connection = id,
            ?unrecognized,
            "Postgres sent a message of an unknown kind",
        ),
    }
}

/// Records what the server reported on connection `id`, at the level of its severity.
fn report(id: u64, notice: &DbError) {
    // The tracing level does not carry the severity: PANIC, FATAL and ERROR share one, NOTICE and
    // INFO another, LOG and DEBUG a third. Naming it keeps the server's own word on the event.
    // Where Postgres named none, its text is all there is, translated or not.
    let severity = notice.parsed_severity();
    let severity_name = severity.map_or_else(
        || notice.severity().to_owned(),
        |severity| severity.to_string(),
    );
    let code = notice.code().code();
    let message = notice.message();

    // `detail`, `hint` and `context` hold what to do about the message and which function raised
    // it.
    macro_rules! event {
        ($level:ident) => {
            tracing::$level!(
                target: SERVER_TARGET,
                connection = id,
                severity = %severity_name,
                code,
                detail = notice.detail(),
                hint = notice.hint(),
                context = notice.where_(),
                "{message}",
            )
        };
    }

    match severity {
        Some(Severity::Panic | Severity::Fatal | Severity::Error) => event!(error),
        Some(Severity::Warning) | None => event!(warn),
        Some(Severity::Notice | Severity::Info) => event!(info),
        Some(Severity::Log | Severity::Debug) => event!(debug),
    }
}

/// Records the messages of connection `id` until its stream ends.
///
/// The task runs outside any span: a connection outlives the request that made the pool grow, so
/// its messages carry `id` rather than a request's trace, and `id` is what joins them to the
/// acquisition that created the connection.
async fn drive(
    id: u64,
    mut messages: impl Stream<Item = Result<AsyncMessage, tokio_postgres::Error>> + Unpin,
) {
    while let Some(message) = messages.next().await {
        match message {
            Ok(message) => record(id, message),
            // `Connection::poll_message` documents an error as terminal and closes its request
            // receiver on the way out, so the stream must not be polled again.
            Err(error) => {
                // A termination the server initiates — `pg_terminate_backend`, an idle-session
                // timeout, a shutdown — arrives as an error response rather than a notice.
                if let Some(notice) = error.as_db_error() {
                    report(id, notice);
                } else {
                    tracing::warn!(
                        connection = id,
                        error = ?Report::new(error),
                        "Lost the connection carrying Postgres' messages",
                    );
                }
                break;
            }
        }
    }
}

/// A pooled connection that records the server's messages instead of dropping them.
///
/// The client and the task recording its messages are one unit. Dropping the connection drops the
/// client, which lets `tokio_postgres` close the connection gracefully with a `Terminate`; the
/// recording task then sees the message stream end and finishes on its own.
#[derive(Debug)]
pub struct ManagedConnection {
    id: u64,
    client: Client,
    driver: JoinHandle<()>,
}

impl ManagedConnection {
    /// The client statements are issued on.
    ///
    /// The client prepares a statement for each execution. The query compiler's plans rely on
    /// Postgres planning every execution against its actual parameter values.
    #[must_use]
    pub const fn client(&self) -> &Client {
        &self.client
    }

    /// The client statements are issued on, borrowed exclusively.
    pub const fn client_mut(&mut self) -> &mut Client {
        &mut self.client
    }

    /// Whether the connection can no longer be used.
    ///
    /// A recording task that has stopped counts as closed too, so a client whose messages nothing
    /// reads is not handed out again.
    #[must_use]
    pub fn is_closed(&self) -> bool {
        self.client.is_closed() || self.driver.is_finished()
    }
}

/// Establishes a connection with the TLS setup erased.
///
/// A [`tokio_postgres::Connection`] names the TLS stream type it was built from, so it cannot cross
/// an erased boundary. Driving it starts here, where that type is still known, and only the
/// [`ManagedConnection`] comes back.
trait Connect: Send + Sync {
    fn connect(
        &self,
        id: u64,
    ) -> BoxFuture<'static, Result<ManagedConnection, Report<ConnectionError>>>;
}

/// Connects with a concrete TLS setup.
struct Connector<Tls> {
    config: Config,
    tls: Tls,
}

impl<Tls> Connect for Connector<Tls>
where
    Tls: PostgresTls,
{
    fn connect(
        &self,
        id: u64,
    ) -> BoxFuture<'static, Result<ManagedConnection, Report<ConnectionError>>> {
        let config = self.config.clone();
        let tls = self.tls.clone();

        Box::pin(async move {
            let (client, mut connection) = config
                .connect(tls)
                .await
                .change_context(ConnectionError::Connect)?;
            let messages = stream::poll_fn(move |context| connection.poll_message(context));

            Ok(ManagedConnection {
                id,
                client,
                driver: tokio::spawn(drive(id, messages)),
            })
        })
    }
}

/// Creates and recycles [`ManagedConnection`]s for a pool.
pub(crate) struct ConnectionManager {
    connect: Box<dyn Connect>,
    next_id: AtomicU64,
}

impl fmt::Debug for ConnectionManager {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("ConnectionManager")
            .finish_non_exhaustive()
    }
}

impl ConnectionManager {
    /// Creates a manager handing out connections built from `config`.
    pub(crate) fn new(config: Config, tls: impl PostgresTls) -> Self {
        Self {
            connect: Box::new(Connector { config, tls }),
            next_id: AtomicU64::new(0),
        }
    }
}

impl deadpool::managed::Manager for ConnectionManager {
    type Error = Report<ConnectionError>;
    type Type = ManagedConnection;

    async fn create(&self) -> Result<Self::Type, Self::Error> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let connection = self.connect.connect(id).await?;
        tracing::info!(connection = id, "Created a connection to Postgres");

        Ok(connection)
    }

    fn recycle(
        &self,
        obj: &mut Self::Type,
        metrics: &Metrics,
    ) -> impl Future<Output = RecycleResult<Self::Error>> + Send {
        let client_closed = obj.client.is_closed();
        let driver_finished = obj.driver.is_finished();
        ready(if client_closed || driver_finished {
            tracing::warn!(
                connection = obj.id,
                client_closed,
                driver_finished,
                age = ?metrics.created.elapsed(),
                reuse = metrics.recycle_count,
                "Dropping a closed connection from the pool",
            );
            Err(RecycleError::message("the connection is closed"))
        } else {
            Ok(())
        })
    }
}
