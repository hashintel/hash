//! Connections that own what the server says outside a statement's results.
//!
//! Postgres reports plans, warnings and notices on the same wire as query
//! results, but `tokio_postgres` delivers them on a side channel that only
//! [`Connection::poll_message`] exposes — awaiting the connection, which is what
//! a pool does by default, discards all of them.
//!
//! [`ManagedConnection`] drives its connection through that channel instead, so
//! a message becomes a typed [`ServerMessage`] rather than nothing. Messages go
//! to whoever asked for them with [`ManagedConnection::messages`]; everything
//! arriving while nobody is collecting is recorded as a tracing event.
//!
//! What Postgres reports is asked for per transaction, through [`observe`] on
//! the transaction builder, because the settings are transaction-scoped. The
//! collector is not: it belongs to the connection and outlives any transaction
//! on it, which is what lets a caller read what the statements of somebody
//! else's transaction reported.
//!
//! [`Connection::poll_message`]: tokio_postgres::Connection::poll_message
//! [`observe`]: crate::store::PostgresStoreTransactionBuilder::observe

use alloc::{borrow::Cow, sync::Arc};
use core::{
    error::Error,
    fmt,
    future::{Future, ready},
};
use std::sync::{Mutex, MutexGuard, PoisonError};

use deadpool::managed::{HookError, PoolError};
use error_stack::{Report, ResultExt as _};
use futures::{Stream, StreamExt as _, future::BoxFuture, stream};
use tokio::{sync::mpsc, task::JoinHandle};
use tokio_postgres::{
    AsyncMessage, Client, Config, GenericClient as _, Notification, Socket,
    error::{DbError, Severity},
    tls::{MakeTlsConnect, TlsConnect},
};

use crate::{
    plan_analysis::{PlanFingerprint, plan_notice},
    store::postgres::{AsClient, InTransaction, PostgresStore},
};

/// A message the server sent outside of a statement's results.
#[derive(Debug)]
pub enum ServerMessage {
    /// A plan `auto_explain` reported for a statement.
    Plan(PlanFingerprint),
    /// Anything else the server reported, at the severity it reported it.
    Reported {
        /// The severity Postgres assigned, where it named one.
        ///
        /// A notice carries WARNING, NOTICE, DEBUG, INFO or LOG. [`None`] means
        /// the server named no machine-readable severity, which only a server
        /// older than 9.6 does — [`DbError::severity`] still holds the text,
        /// possibly translated.
        severity: Option<Severity>,
        /// What the server said.
        notice: Box<DbError>,
    },
    /// A payload from `NOTIFY` on a channel this connection listens to.
    Notification(Notification),
}

/// Failure to receive a message from the server.
#[derive(Debug, derive_more::Display)]
#[display("Could not receive a message from the server: {_variant}")]
pub enum ReceiveMessageError {
    /// The connection carrying the messages failed, so no more will arrive.
    #[display("the connection failed")]
    Connection,
    /// A plan arrived but could not be read.
    #[display("a plan arrived that could not be read")]
    UnreadablePlan,
}

impl Error for ReceiveMessageError {}

/// Failure to provide a connection to Postgres.
#[derive(Debug, derive_more::Display)]
#[display("Could not provide a connection to Postgres: {_variant}")]
pub enum ConnectionError {
    /// The connection could not be established.
    #[display("the connection could not be established")]
    Connect,
    /// A pooled connection was closed and cannot be handed out again.
    #[display("the connection was closed")]
    Closed,
    /// The pool had no connection to give.
    #[display("no connection became available")]
    Unavailable,
}

impl Error for ConnectionError {}

impl ConnectionError {
    /// Reads what a pool says about failing to hand out a connection.
    ///
    /// A failure to build one carries its own report, which is kept; the pool's
    /// own failures become [`ConnectionError::Unavailable`] or
    /// [`ConnectionError::Closed`].
    pub(crate) fn from_pool(error: PoolError<Report<Self>>) -> Report<Self> {
        match error {
            PoolError::Backend(report) | PoolError::PostCreateHook(HookError::Backend(report)) => {
                report
            }
            PoolError::Timeout(timeout) => Report::new(Self::Unavailable)
                .attach(format!("the pool timed out while {timeout:?}")),
            PoolError::Closed => Report::new(Self::Closed),
            PoolError::NoRuntimeSpecified => Report::new(Self::Unavailable)
                .attach("the pool needs a runtime to time an operation out"),
            PoolError::PostCreateHook(error) => {
                Report::new(Self::Unavailable).attach(error.to_string())
            }
        }
    }
}

/// Where a message from the server is recorded.
///
/// What Postgres says is its own category, separate from what this crate says
/// about its work, so an operator can ask for it on its own. Rooting the name in
/// the crate's path keeps a crate-wide `RUST_LOG` directive matching it too,
/// because [`EnvFilter`] matches a target by prefix.
///
/// [`EnvFilter`]: https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html
const SERVER: &str = "hash_graph_postgres_store::server";

/// What a receiver of a connection's messages is handed.
pub type ReceivedMessage = Result<ServerMessage, Report<ReceiveMessageError>>;

/// Where a connection's messages go while somebody is capturing them.
///
/// Empty for as long as nobody is, which is what keeps an idle connection from
/// accumulating messages nobody reads.
///
/// The lock is held only to read or replace the [`Option`] and never across an
/// await, so it is a blocking lock rather than an async one — [`Drop`] takes it
/// too, and that cannot await.
type Capture = Arc<Mutex<Option<mpsc::UnboundedSender<ReceivedMessage>>>>;

/// The sender a capture installed, if one did.
///
/// Recovers from a poisoned lock rather than propagating it: the guarded value
/// is one [`Option`] that is only taken or replaced, so a panic cannot leave it
/// half-written.
fn captured(capture: &Capture) -> MutexGuard<'_, Option<mpsc::UnboundedSender<ReceivedMessage>>> {
    capture.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Classifies a message from the server.
///
/// [`None`] means the message mapped to nothing, which is a different answer
/// from the [`Err`] of a message that mapped to something unreadable.
fn classify(message: AsyncMessage) -> Option<ReceivedMessage> {
    let notice = match message {
        AsyncMessage::Notice(notice) => notice,
        AsyncMessage::Notification(notification) => {
            return Some(Ok(ServerMessage::Notification(notification)));
        }
        // `AsyncMessage` is non-exhaustive, so a driver newer than this code can
        // send something neither variant covers. Passing it over silently is
        // what this module exists to stop.
        message => {
            tracing::debug!(
                target: SERVER,
                ?message,
                "Postgres sent a message this connection does not know",
            );
            return None;
        }
    };

    if let Some(json) = plan_notice(notice.message()) {
        return Some(
            PlanFingerprint::from_json_str(json)
                .map(ServerMessage::Plan)
                .change_context(ReceiveMessageError::UnreadablePlan),
        );
    }

    // `DbError::severity` may be translated, so the parsed severity is the only
    // one worth matching on.
    Some(Ok(ServerMessage::Reported {
        severity: notice.parsed_severity(),
        notice: Box::new(notice),
    }))
}

/// Records a message no capture took.
fn record(message: ReceivedMessage) {
    let (severity, notice) = match message {
        Ok(ServerMessage::Plan(plan)) => {
            // Capture is opt-in, so a plan without one means the server was told
            // to report plans while nothing was collecting them.
            tracing::debug!(
                target: SERVER,
                nodes = plan.nodes.len(),
                "Postgres reported a plan while nothing was capturing",
            );
            return;
        }
        Ok(ServerMessage::Reported { severity, notice }) => (severity, notice),
        Ok(ServerMessage::Notification(notification)) => {
            tracing::debug!(
                target: SERVER,
                channel = notification.channel(),
                "Postgres sent a notification nothing was listening for",
            );
            return;
        }
        Err(report) => {
            tracing::error!(
                target: SERVER,
                error = ?report,
                "Could not receive a message from Postgres",
            );
            return;
        }
    };

    // The tracing level does not carry the severity: NOTICE and INFO share one,
    // LOG and DEBUG another. Naming it keeps the server's own word on the event.
    // Where Postgres named no severity its text is all there is, translated or
    // not.
    let severity_name = severity.map_or_else(
        || Cow::Borrowed(notice.severity()),
        |severity| Cow::Owned(severity.to_string()),
    );
    let message = notice.message();

    // The server's own words are the event, not a field on one: the target says
    // who spoke and the severity says in what tone, so a sentence of ours in
    // front of it would only push the content out of sight.
    match severity {
        // A notice carries none of these, so one that does is a fault twice
        // over: in what it reports and in how it arrived.
        Some(Severity::Panic | Severity::Fatal | Severity::Error) => {
            tracing::error!(target: SERVER, severity = %severity_name, "{message}");
        }
        // Only a server older than 9.6 names no severity, and which of the five
        // it is cannot be told, so it is reported as the worst of them.
        Some(Severity::Warning) | None => {
            tracing::warn!(target: SERVER, severity = %severity_name, "{message}");
        }
        Some(Severity::Notice | Severity::Info) => {
            tracing::info!(target: SERVER, severity = %severity_name, "{message}");
        }
        Some(Severity::Log | Severity::Debug) => {
            tracing::debug!(target: SERVER, severity = %severity_name, "{message}");
        }
    }
}

/// A pooled connection that keeps the server's messages instead of dropping them.
#[derive(Debug)]
pub struct ManagedConnection {
    client: Client,
    capture: Capture,
    driver: JoinHandle<()>,
}

/// Something Postgres can be asked to report about a transaction's statements.
///
/// Each is a transaction-scoped setting, so what is asked for here is reported
/// only until the transaction ends.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Diagnostic {
    /// A plan for every statement.
    Plans,
}

impl Diagnostic {
    /// The settings that turn the diagnostic on.
    const fn settings(self) -> &'static [&'static str] {
        match self {
            // Timing is the expensive half of the instrumentation and nothing
            // read from a plan needs it. Parameters stay out because they carry
            // the values a caller filtered by.
            Self::Plans => &[
                "SET LOCAL auto_explain.log_min_duration = 0",
                "SET LOCAL auto_explain.log_analyze = on",
                "SET LOCAL auto_explain.log_buffers = on",
                "SET LOCAL auto_explain.log_format = json",
                "SET LOCAL auto_explain.log_level = NOTICE",
                "SET LOCAL auto_explain.log_timing = off",
                "SET LOCAL auto_explain.log_parameter_max_length = 0",
            ],
        }
    }
}

/// A connection whose messages from the server can be collected.
pub trait CaptureMessages {
    /// Collects the messages the server sends until the guard is dropped.
    ///
    /// Collecting alone issues no statement, and it outlives any transaction on
    /// the connection — which is what lets a caller read what a statement of
    /// somebody else's transaction reported.
    fn messages(&self) -> MessageCapture;
}

impl CaptureMessages for ManagedConnection {
    fn messages(&self) -> MessageCapture {
        let (sender, messages) = mpsc::unbounded_channel();
        *captured(&self.capture) = Some(sender);

        MessageCapture {
            capture: Arc::clone(&self.capture),
            messages,
        }
    }
}

impl ManagedConnection {
    /// The client statements are issued on.
    #[must_use]
    pub const fn client(&self) -> &Client {
        &self.client
    }

    /// The client statements are issued on.
    pub const fn client_mut(&mut self) -> &mut Client {
        &mut self.client
    }

    /// Whether the connection can still be used.
    #[must_use]
    pub fn is_closed(&self) -> bool {
        self.client.is_closed()
    }
}

impl<C> PostgresStore<C, InTransaction>
where
    C: AsClient,
{
    /// Asks Postgres to report the diagnostics for this transaction's statements.
    ///
    /// # Errors
    ///
    /// - [`ConnectionError::Closed`] if a setting cannot be applied
    pub(crate) async fn enable(
        &self,
        diagnostics: &[Diagnostic],
    ) -> Result<(), Report<ConnectionError>> {
        for setting in diagnostics
            .iter()
            .flat_map(|diagnostic| diagnostic.settings())
        {
            self.as_client()
                .execute(*setting, &[])
                .await
                .change_context(ConnectionError::Closed)
                .attach_with(|| (*setting).to_owned())?;
        }

        Ok(())
    }
}

impl Drop for ManagedConnection {
    fn drop(&mut self) {
        // The driver borrows nothing, so it would outlive the connection it
        // drives and hold the socket open.
        self.driver.abort();
    }
}

/// Holds a connection's messages until it is dropped.
///
/// Owns its side of the channel rather than borrowing the connection, so a
/// capture can be held across starting a transaction on that same connection.
#[derive(Debug)]
pub struct MessageCapture {
    capture: Capture,
    messages: mpsc::UnboundedReceiver<ReceivedMessage>,
}

impl MessageCapture {
    /// The messages that have arrived, in the order the server sent them.
    pub fn take(&mut self) -> Vec<ReceivedMessage> {
        let mut messages = Vec::new();
        while let Ok(message) = self.messages.try_recv() {
            messages.push(message);
        }
        messages
    }

    /// The plans among the messages that have arrived, in statement order.
    ///
    /// Anything else the server said is recorded as a tracing event.
    ///
    /// # Errors
    ///
    /// - [`ReceiveMessageError`] for the first message that failed to arrive
    pub fn plans(&mut self) -> Result<Vec<PlanFingerprint>, Report<ReceiveMessageError>> {
        let mut plans = Vec::new();
        for message in self.take() {
            match message? {
                ServerMessage::Plan(plan) => plans.push(plan),
                other @ (ServerMessage::Reported { .. } | ServerMessage::Notification(_)) => {
                    record(Ok(other));
                }
            }
        }
        Ok(plans)
    }
}

impl Drop for MessageCapture {
    fn drop(&mut self) {
        // Leaving the sender installed would let an idle connection accumulate
        // messages with nobody to read them.
        drop(captured(&self.capture).take());

        while let Ok(message) = self.messages.try_recv() {
            record(message);
        }
    }
}

/// Drives a connection's messages into `capture` until it closes.
async fn drive(
    mut messages: impl Stream<Item = Result<AsyncMessage, tokio_postgres::Error>> + Unpin,
    capture: Capture,
) {
    while let Some(message) = messages.next().await {
        let classified = match message {
            Ok(message) => {
                let Some(classified) = classify(message) else {
                    continue;
                };
                classified
            }
            // The failure belongs to the connection this drives, not to any one
            // message, so it is not the classifier's to report.
            Err(error) => Err(error).change_context(ReceiveMessageError::Connection),
        };

        // A receiver dropped without releasing its capture is the one case a
        // send fails, and the message is recorded either way.
        let unclaimed = match captured(&capture).as_ref() {
            Some(sender) => sender.send(classified).err().map(|error| error.0),
            None => Some(classified),
        };

        if let Some(message) = unclaimed {
            record(message);
        }
    }
}

/// Establishes a connection with the TLS setup erased.
///
/// A [`tokio_postgres::Connection`] names the socket and TLS types it was built
/// from, so it cannot cross an erased boundary. Driving it starts here, where
/// those types are still known, and only the client and its driver come back.
trait Connect: Send + Sync {
    fn connect(&self, capture: Capture) -> BoxFuture<'_, Connected>;
}

/// A client and the task driving its messages.
type Connected = Result<(Client, JoinHandle<()>), Report<ConnectionError>>;

/// Connects with a concrete TLS setup.
struct TlsConnector<Tls> {
    config: Config,
    tls: Tls,
}

impl<Tls> Connect for TlsConnector<Tls>
where
    Tls: Clone
        + MakeTlsConnect<
            Socket,
            Stream: Send + Sync,
            TlsConnect: TlsConnect<Socket, Future: Send> + Send + Sync,
        > + Send
        + Sync
        + 'static,
{
    fn connect(&self, capture: Capture) -> BoxFuture<'_, Connected> {
        let config = self.config.clone();
        let tls = self.tls.clone();

        Box::pin(async move {
            let (client, mut connection) = config
                .connect(tls)
                .await
                .change_context(ConnectionError::Connect)?;
            let messages = stream::poll_fn(move |context| connection.poll_message(context));

            Ok((client, tokio::spawn(drive(messages, capture))))
        })
    }
}

/// Creates and recycles [`ManagedConnection`]s for a pool.
pub struct ConnectionManager {
    connect: Box<dyn Connect>,
}

impl fmt::Debug for ConnectionManager {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("ConnectionManager")
            .finish_non_exhaustive()
    }
}

impl ConnectionManager {
    /// Creates a manager handing out connections built from `config`.
    pub fn new<Tls>(config: Config, tls: Tls) -> Self
    where
        Tls: Clone
            + MakeTlsConnect<
                Socket,
                Stream: Send + Sync,
                TlsConnect: TlsConnect<Socket, Future: Send> + Send + Sync,
            > + Send
            + Sync
            + 'static,
    {
        Self {
            connect: Box::new(TlsConnector { config, tls }),
        }
    }
}

impl deadpool::managed::Manager for ConnectionManager {
    type Error = Report<ConnectionError>;
    type Type = ManagedConnection;

    async fn create(&self) -> Result<Self::Type, Self::Error> {
        let capture: Capture = Arc::new(Mutex::new(None));
        let (client, driver) = self.connect.connect(Arc::clone(&capture)).await?;

        Ok(ManagedConnection {
            client,
            capture,
            driver,
        })
    }

    /// Recycling asks the client what it already knows and drops state the
    /// enclosing transaction has already released, so it needs no round trip.
    fn recycle(
        &self,
        obj: &mut Self::Type,
        _: &deadpool::managed::Metrics,
    ) -> impl Future<Output = deadpool::managed::RecycleResult<Self::Error>> + Send {
        ready(if obj.is_closed() {
            Err(deadpool::managed::RecycleError::Backend(Report::new(
                ConnectionError::Closed,
            )))
        } else {
            // A capture belongs to one checkout. Its guard clears it on drop, so
            // a sender still installed here means the guard was leaked.
            if captured(&obj.capture).take().is_some() {
                tracing::warn!(
                    target: SERVER,
                    "A message capture outlived its checkout",
                );
            }

            Ok(())
        })
    }
}
