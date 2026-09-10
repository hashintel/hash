//! Tests that what the server says outside a statement's results is not discarded.
//!
//! Each test installs its own [`Recorder`] through [`subscriber::set_default`], which scopes it to
//! the test's thread. The driver records from a task of its own, so the tests rely on the
//! current-thread runtime `#[tokio::test]` builds polling that task on this thread; under
//! `flavor = "multi_thread"` the events would reach the harness's global subscriber instead and
//! the recorder would see none of them.

#![expect(
    unreachable_pub,
    reason = "the shared harness is public for the test binaries that re-export it, which this \
              one does not"
)]

extern crate alloc;

#[path = "../common/mod.rs"]
mod common;

use alloc::sync::Arc;
use core::{num::NonZero, time::Duration};
use std::sync::{Mutex, PoisonError};

use hash_graph_postgres_store::store::{
    AsClient as _, DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
    postgres::connection::{ConnectionError, SERVER_TARGET},
};
use hash_graph_store::pool::StorePool as _;
use tokio_postgres::NoTls;
use tracing::{Event, Level, Subscriber, subscriber};
use tracing_subscriber::{layer::Context, prelude::*};

use crate::common::{DatabaseTestWrapper, connection_info};

/// What an operator would see: the level each message was recorded at and how the event renders.
#[derive(Clone, Default)]
struct Recorder(Arc<Mutex<Vec<(Level, String)>>>);

impl Recorder {
    fn recorded(&self) -> Vec<(Level, String)> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// The first recorded event containing `needle`, waiting for the driver to record it.
    async fn wait_for(&self, needle: &str) -> Option<(Level, String)> {
        for _ in 0..200 {
            if let Some(found) = self
                .recorded()
                .into_iter()
                .find(|(_, event)| event.contains(needle))
            {
                return Some(found);
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        None
    }
}

impl<S: Subscriber> tracing_subscriber::Layer<S> for Recorder {
    fn on_event(&self, event: &Event<'_>, _: Context<'_, S>) {
        if event.metadata().target() != SERVER_TARGET {
            return;
        }

        // The `Debug` rendering carries every field, message included, and is enough to assert on.
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((*event.metadata().level(), format!("{event:?}")));
    }
}

/// Postgres applies a `SET LOCAL` outside a transaction to nothing and reports that as a warning
/// with SQLSTATE `25P01`.
#[tokio::test]
async fn connection_records_server_warnings() {
    let recorder = Recorder::default();
    let _guard = subscriber::set_default(tracing_subscriber::registry().with(recorder.clone()));

    let database = DatabaseTestWrapper::new().await;

    database
        .connection
        .as_client()
        .execute("SET LOCAL statement_timeout = '1s'", &[])
        .await
        .expect("the statement should run");

    // Postgres sends the notice before the statement's completion, and the driver records it
    // before that completion reaches the caller.
    let events = recorder.recorded();
    let (level, event) = events
        .iter()
        .find(|(_, event)| event.contains("25P01"))
        .unwrap_or_else(|| panic!("the server's warning should be recorded, got {events:?}"));

    assert_eq!(
        *level,
        Level::WARN,
        "the warning should be recorded at WARN"
    );
    assert!(
        event.contains("WARNING"),
        "the server's own severity should be on the event, got {event}"
    );
    // The connection is a field of the event itself, so it survives a filter that disables spans
    // below WARN.
    assert!(
        event.contains("connection"),
        "the connection should be on the event, got {event}"
    );
}

/// A notice sits one level below a warning, so a mapping that collapses every severity onto one
/// level shows here. `RAISE` inside a `DO` block also fills the detail, hint and context the
/// server sends alongside the message.
#[tokio::test]
async fn connection_records_server_notices() {
    let recorder = Recorder::default();
    let _guard = subscriber::set_default(tracing_subscriber::registry().with(recorder.clone()));

    let database = DatabaseTestWrapper::new().await;

    database
        .connection
        .as_client()
        .execute(
            "DO $$ BEGIN
                RAISE NOTICE 'a notice raised by the test'
                    USING DETAIL = 'the detail the test set', HINT = 'the hint the test set';
            END $$",
            &[],
        )
        .await
        .expect("the block should run");

    let events = recorder.recorded();
    let (level, event) = events
        .iter()
        .find(|(_, event)| event.contains("a notice raised by the test"))
        .unwrap_or_else(|| panic!("the server's notice should be recorded, got {events:?}"));

    assert_eq!(*level, Level::INFO, "the notice should be recorded at INFO");
    assert!(
        event.contains("NOTICE"),
        "the server's own severity should be on the event, got {event}"
    );
    assert!(
        event.contains("the detail the test set"),
        "the detail should be on the event, got {event}"
    );
    assert!(
        event.contains("the hint the test set"),
        "the hint should be on the event, got {event}"
    );
    assert!(
        event.contains("inline_code_block"),
        "the context naming the raising function should be on the event, got {event}"
    );
}

/// A `NOTIFY` on a channel the connection listens to arrives on the same side channel as a notice.
#[tokio::test]
async fn connection_records_notifications() {
    let recorder = Recorder::default();
    let _guard = subscriber::set_default(tracing_subscriber::registry().with(recorder.clone()));

    let database = DatabaseTestWrapper::new().await;

    database
        .connection
        .as_client()
        .batch_execute(
            "LISTEN connection_test; NOTIFY connection_test, 'the payload the test sent'",
        )
        .await
        .expect("the statements should run");

    let (level, event) = recorder
        .wait_for("the payload the test sent")
        .await
        .unwrap_or_else(|| {
            panic!(
                "the notification should be recorded, got {:?}",
                recorder.recorded()
            )
        });

    assert_eq!(
        level,
        Level::INFO,
        "the notification should be recorded at INFO"
    );
    assert!(
        event.contains("connection_test"),
        "the channel should be on the event, got {event}"
    );
}

/// A termination the server initiates arrives as a fatal error response rather than a notice and
/// is recorded like one: at ERROR, with its severity and SQLSTATE.
#[tokio::test]
async fn connection_records_server_termination() {
    let recorder = Recorder::default();
    let _guard = subscriber::set_default(tracing_subscriber::registry().with(recorder.clone()));

    let terminated = DatabaseTestWrapper::new().await;
    let terminator = DatabaseTestWrapper::new().await;

    let pid: i32 = terminated
        .connection
        .as_client()
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .expect("the backend pid should be readable")
        .get(0);
    terminator
        .connection
        .as_client()
        .execute("SELECT pg_terminate_backend($1)", &[&pid])
        .await
        .expect("the backend should be terminated");

    let (level, event) = recorder.wait_for("57P01").await.unwrap_or_else(|| {
        panic!(
            "the termination should be recorded, got {:?}",
            recorder.recorded()
        )
    });

    assert_eq!(
        level,
        Level::ERROR,
        "the termination should be recorded at ERROR"
    );
    assert!(
        event.contains("FATAL"),
        "the server's own severity should be on the event, got {event}"
    );
}

/// A connection whose backend the server terminated is not handed out again.
#[tokio::test]
async fn pool_replaces_terminated_connection() {
    let terminator = DatabaseTestWrapper::new().await;
    let pool = PostgresStorePool::new(
        &connection_info(),
        &DatabasePoolConfig {
            max_connections: NonZero::<usize>::MIN,
        },
        NoTls,
        PostgresStoreSettings::default(),
    )
    .expect("the pool should be built");

    let store = pool
        .acquire_owned(None)
        .await
        .expect("the pool should hand out a connection");
    let pid: i32 = store
        .as_client()
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .expect("the backend pid should be readable")
        .get(0);
    terminator
        .connection
        .as_client()
        .execute("SELECT pg_terminate_backend($1)", &[&pid])
        .await
        .expect("the backend should be terminated");

    // The client learns of the termination from the driver, which is polled while this sleeps.
    for _ in 0..200 {
        if store.as_client().is_closed() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(
        store.as_client().is_closed(),
        "the terminated connection should be closed"
    );
    drop(store);

    let replacement = pool
        .acquire_owned(None)
        .await
        .expect("the pool should hand out a replacement");
    let replacement_pid: i32 = replacement
        .as_client()
        .query_one("SELECT pg_backend_pid()", &[])
        .await
        .expect("the replacement should run statements")
        .get(0);

    assert_ne!(
        replacement_pid, pid,
        "the pool should not hand the terminated connection out again"
    );
}

/// The pool connects lazily, so a database that does not exist surfaces on acquisition, as
/// [`ConnectionError::Connect`] with the driver's error underneath.
#[tokio::test]
async fn pool_reports_unreachable_database() {
    let reachable = connection_info();
    let unreachable = DatabaseConnectionInfo::new(
        DatabaseType::Postgres,
        reachable.user().to_owned(),
        reachable.password().to_owned(),
        reachable.host().to_owned(),
        reachable.port(),
        "hash_graph_does_not_exist".to_owned(),
    );
    let pool = PostgresStorePool::new(
        &unreachable,
        &DatabasePoolConfig::default(),
        NoTls,
        PostgresStoreSettings::default(),
    )
    .expect("the pool should be built without connecting");

    let Err(report) = pool.acquire_owned(None).await else {
        panic!("acquiring should fail against a database that does not exist");
    };

    assert_eq!(
        *report.current_context(),
        ConnectionError::Connect,
        "the failure should be a failed connect"
    );
    assert!(
        report.downcast_ref::<tokio_postgres::Error>().is_some(),
        "the driver's error should stay in the report"
    );
}
