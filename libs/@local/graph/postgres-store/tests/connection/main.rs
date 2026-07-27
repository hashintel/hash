#![expect(
    clippy::tests_outside_test_module,
    reason = "this is an integration test"
)]
#![expect(
    unreachable_pub,
    reason = "the shared harness is public for the test binaries that re-export it, which this \
              one does not"
)]

//! Tests that a plan Postgres reports reaches the caller that asked for it.

#[path = "../common/mod.rs"]
mod common;

use hash_graph_postgres_store::store::{
    IsolationLevel, Transaction as _,
    postgres::{
        AsClient as _,
        connection::{CaptureMessages as _, Diagnostic, ServerMessage},
    },
};

use crate::common::DatabaseTestWrapper;

#[tokio::test]
async fn a_statement_s_plan_reaches_the_caller() {
    let mut database = DatabaseTestWrapper::new().await;

    let (transaction, mut capture) = database
        .connection
        .transaction()
        .observe(Diagnostic::Plans)
        .await
        .expect("the transaction should begin with plan capture enabled");

    let rows = transaction
        .as_client()
        .query(
            "SELECT count(*) FROM generate_series(1, $1) AS g WHERE g % 1000 = 0",
            &[&10_000_i32],
        )
        .await
        .expect("the query should run");
    assert_eq!(rows.len(), 1);

    transaction
        .rollback()
        .await
        .expect("the transaction should roll back");

    let plans = capture.plans().expect("the plans should arrive");
    let plan = plans
        .first()
        .expect("the statement should have reported a plan");

    // The plan is asserted on its shape, not its timing: the query returns one
    // row and reads ten thousand to find it, on any machine and cache state.
    assert_eq!(plan.rows_returned(), 1);
    assert_eq!(plan.rows_discarded(), 9_990);
    assert!(!plan.spills());
}

/// A caller deciding at runtime takes the same path either way, which is the
/// whole reason `maybe_observe` exists: were the decision made by choosing
/// between `observe` and nothing, the two branches would differ in type and the
/// work between them would have to be written twice.
#[tokio::test]
async fn a_runtime_decision_does_not_split_the_path() {
    for wanted in [Some(Diagnostic::Plans), None] {
        let mut database = DatabaseTestWrapper::new().await;

        let (transaction, mut capture) = database
            .connection
            .transaction()
            .maybe_observe(wanted)
            .isolation_level(IsolationLevel::ReadCommitted)
            .await
            .expect("the transaction should begin");

        transaction
            .as_client()
            .query(
                "SELECT count(*) FROM generate_series(1, $1) AS g",
                &[&10_i32],
            )
            .await
            .expect("the query should run");

        transaction
            .rollback()
            .await
            .expect("the transaction should roll back");

        let plans = capture.plans().expect("the plans should arrive");
        assert_eq!(
            plans.is_empty(),
            wanted.is_none(),
            "asking for {wanted:?} should decide whether a plan arrives, got {plans:?}",
        );
    }
}

#[tokio::test]
async fn a_capture_holds_nothing_without_being_enabled() {
    let database = DatabaseTestWrapper::new().await;
    let mut capture = database.connection.messages();

    let rows = database
        .connection
        .as_client()
        .query(
            "SELECT count(*) FROM generate_series(1, $1) AS g",
            &[&10_000_i32],
        )
        .await
        .expect("the query should run");
    assert_eq!(rows.len(), 1);

    let messages = capture.take();
    assert!(
        messages.is_empty(),
        "a statement outside an enabled capture should report nothing, got {messages:?}",
    );
}

#[tokio::test]
async fn a_server_warning_reaches_the_caller() {
    let database = DatabaseTestWrapper::new().await;
    let mut capture = database.connection.messages();

    // `SET LOCAL` outside a transaction is exactly the mistake this makes
    // visible: Postgres only warns about it, and the warning used to be dropped.
    database
        .connection
        .as_client()
        .execute("SET LOCAL auto_explain.log_analyze = on", &[])
        .await
        .expect("the statement should run");

    let messages = capture.take();
    let warned = messages.iter().any(|message| {
        matches!(
            message,
            Ok(ServerMessage::Reported { notice, .. })
                if notice.message().contains("SET LOCAL")
        )
    });

    assert!(
        warned,
        "the server's warning about SET LOCAL should arrive, got {messages:?}",
    );
}
