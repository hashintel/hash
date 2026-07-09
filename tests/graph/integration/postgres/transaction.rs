use hash_graph_postgres_store::store::{AsClient as _, IsolationLevel, TransactionBuilder as _};

use crate::DatabaseTestWrapper;

/// The transaction builder composes all options into the single `BEGIN` statement, so the
/// transaction's characteristics are in effect from the very first statement.
#[tokio::test]
async fn transaction_builder_composes_options_into_begin() {
    let mut database = DatabaseTestWrapper::new().await;

    let transaction = database
        .connection
        .transaction()
        .isolation_level(IsolationLevel::RepeatableRead)
        .read_only()
        .await
        .expect("should be able to begin a transaction");

    let row = transaction
        .as_client()
        .query_one(
            "SELECT current_setting('transaction_isolation'), \
             current_setting('transaction_read_only');",
            &[],
        )
        .await
        .expect("should be able to read the transaction characteristics");

    assert_eq!(row.get::<_, String>(0), "repeatable read");
    assert_eq!(row.get::<_, String>(1), "on");

    transaction
        .rollback()
        .await
        .expect("should be able to roll back the transaction");
}

/// Without options the builder behaves like the previous plain `transaction()` method.
#[tokio::test]
async fn transaction_builder_defaults_to_session_characteristics() {
    let mut database = DatabaseTestWrapper::new().await;

    let transaction = database
        .connection
        .transaction()
        .await
        .expect("should be able to begin a transaction");

    let row = transaction
        .as_client()
        .query_one("SELECT current_setting('transaction_read_only');", &[])
        .await
        .expect("should be able to read the transaction characteristics");

    assert_eq!(row.get::<_, String>(0), "off");

    transaction
        .rollback()
        .await
        .expect("should be able to roll back the transaction");
}

/// Beginning a transaction on a store which is already backed by a transaction creates a
/// savepoint. Savepoints inherit the characteristics of the enclosing transaction, so the
/// options are ignored instead of failing.
#[tokio::test]
async fn transaction_options_are_ignored_for_savepoints() {
    let mut database = DatabaseTestWrapper::new().await;

    let mut outer = database
        .connection
        .transaction()
        .await
        .expect("should be able to begin a transaction");

    let inner = outer
        .transaction()
        .isolation_level(IsolationLevel::RepeatableRead)
        .read_only()
        .await
        .expect("should be able to begin a nested transaction");

    let row = inner
        .as_client()
        .query_one(
            "SELECT current_setting('transaction_isolation'), \
             current_setting('transaction_read_only');",
            &[],
        )
        .await
        .expect("should be able to read the transaction characteristics");

    // The savepoint runs within the enclosing transaction and inherits its characteristics.
    assert_eq!(row.get::<_, String>(0), "read committed");
    assert_eq!(row.get::<_, String>(1), "off");

    inner
        .rollback()
        .await
        .expect("should be able to roll back the nested transaction");
    outer
        .rollback()
        .await
        .expect("should be able to roll back the transaction");
}
