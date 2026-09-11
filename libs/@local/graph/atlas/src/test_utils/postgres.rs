//! Per-case databases for integration tests against the local PostgreSQL service.

use core::{panic::AssertUnwindSafe, time::Duration};
use std::panic::resume_unwind;

use futures::FutureExt as _;
use tokio::task::JoinHandle;
use tokio_postgres::{Client, Config, NoTls};
use uuid::Uuid;

/// A database created and removed by one integration case.
pub(crate) struct Database {
    admin: Client,
    connection: JoinHandle<Result<(), tokio_postgres::Error>>,
    name: String,
}

impl Database {
    /// Creates an empty database using the fixed local test administrator.
    ///
    /// # Panics
    ///
    /// Panics if PostgreSQL is unavailable or database creation fails.
    pub(crate) async fn new() -> Self {
        let (admin, connection) = Config::new()
            .host("localhost")
            .port(5432)
            .user("postgres")
            .password("postgres")
            .dbname("postgres")
            .connect_timeout(Duration::from_secs(5))
            .connect(NoTls)
            .await
            .expect("should connect to integration-test PostgreSQL at localhost:5432");

        let connection = tokio::spawn(connection);

        let name = format!("atlas_integration_{}", Uuid::now_v7().simple());
        if let Err(error) = admin
            .batch_execute(&format!("CREATE DATABASE {name}"))
            .await
        {
            connection.abort();
            panic!("should create test database {name}: {error}");
        }

        Self {
            admin,
            connection,
            name,
        }
    }

    /// Runs the case and removes its database after success or assertion failure.
    ///
    /// # Panics
    ///
    /// Resumes an assertion panic after cleanup. Panics if cleanup or the connection task fails.
    pub(crate) async fn run(self, case: impl AsyncFnOnce(&str)) {
        let result = Box::pin(AssertUnwindSafe(case(&self.name)).catch_unwind()).await;

        // only this case connects to the uniquely named database.
        let cleanup = self
            .admin
            .batch_execute(&format!("DROP DATABASE {} WITH (FORCE)", self.name))
            .await;
        drop(self.admin);

        let connection = self.connection.await;
        if let Err(panic) = result {
            if let Err(error) = cleanup {
                tracing::subscriber::with_default(
                    tracing_subscriber::fmt().with_test_writer().finish(),
                    || tracing::error!(database = %self.name, %error, "failed to remove test database"),
                );
            }
            resume_unwind(panic);
        }

        cleanup.expect("should remove the test database");
        connection
            .expect("should join the admin connection")
            .expect("should close the admin connection");
    }
}
