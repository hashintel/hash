//! The orchestration backend on DBOS.
//!
//! A run is a DBOS workflow and each of its steps a DBOS step, recorded in a Postgres system
//! database that every process shares. A run starts on the `integration-runs` queue with its
//! admission key as the deduplication ID, so one run per admission key is queued or running at a
//! time. A run function's version is DBOS's application version, so a worker executes only runs
//! started with its function's version.

use alloc::string::String;

use dbos::{
    Client, ClientConfig, QueueConflict, QueueOptions,
    sysdb::{self, SystemDatabase as _, postgres},
};
use error_stack::{Report, ResultExt as _};

use crate::BackendError;

/// The DBOS application every process registers as.
const APP_NAME: &str = "hash-integrations";

/// The queue every run starts on.
const QUEUE: &str = "integration-runs";

/// Where the DBOS backend keeps its runs.
#[derive(Debug, Clone)]
pub struct DbosConfig {
    /// The Postgres database that holds DBOS's system schema, as a connection URL.
    pub database_url: String,
    /// The schema DBOS keeps its tables in.
    pub schema: String,
    /// How many runs execute at once across every worker. `None` sets no limit.
    pub queue_concurrency: Option<u32>,
}

impl DbosConfig {
    /// Uses DBOS's default schema and no concurrency limit.
    #[must_use]
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
            schema: String::from(sysdb::DEFAULT_SCHEMA),
            queue_concurrency: None,
        }
    }
}

/// The backend on DBOS.
///
/// It holds a DBOS client, which starts, reads and cancels runs without a worker.
pub struct DbosBackend {
    client: Client,
}

impl DbosBackend {
    /// Connects to the system database, migrating DBOS's schema if it is missing or behind, and
    /// registers the run queue. A queue that already exists keeps its stored limits.
    ///
    /// # Errors
    ///
    /// Returns [`BackendError`] if the database is unreachable, the schema cannot be migrated, or
    /// the queue cannot be registered.
    #[tracing::instrument(skip_all, fields(schema = %config.schema))]
    pub async fn connect(config: DbosConfig) -> Result<Self, Report<BackendError>> {
        migrate(&config).await?;

        let mut client_config = ClientConfig::new(config.database_url.clone());
        client_config.app_name = Some(String::from(APP_NAME));
        client_config.schema = config.schema.clone();
        let client = Client::connect(client_config)
            .await
            .change_context(BackendError)?;

        let concurrency = config
            .queue_concurrency
            .map(i32::try_from)
            .transpose()
            .change_context(BackendError)?;
        client
            .register_queue(
                QUEUE,
                QueueOptions {
                    concurrency,
                    ..QueueOptions::default()
                },
                QueueConflict::NeverUpdate,
            )
            .await
            .change_context(BackendError)?;

        Ok(Self { client })
    }

    /// Closes the connection to the system database.
    pub async fn close(&self) {
        self.client.close().await;
    }
}

/// Creates or migrates DBOS's schema.
///
/// A DBOS client only verifies the schema, so this opens a system database connection with
/// migration on, as a launching worker does, and closes it again.
async fn migrate(config: &DbosConfig) -> Result<(), Report<BackendError>> {
    let database = postgres::PostgresSystemDatabase::connect(&postgres::Config {
        max_connections: 1,
        use_listen_notify: false,
        migrate: true,
        settings: postgres::Settings {
            schema: &config.schema,
            application_name: Some(APP_NAME),
            ..postgres::Settings::default()
        },
        ..postgres::Config::new(&config.database_url)
    })
    .await
    .change_context(BackendError)?;
    database.close().await;
    Ok(())
}
