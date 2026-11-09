//! The orchestration backend on DBOS.
//!
//! A run is a DBOS workflow and each of its steps a DBOS step, recorded in a Postgres system
//! database that every process shares. A run starts on the `integration-runs` queue with its
//! admission key as the deduplication ID, so one run per admission key is queued or running at a
//! time. A run function's version is DBOS's application version, so a worker executes only runs
//! started with its function's version. The shared token buckets are a table in the same schema.

use alloc::{format, string::String, sync::Arc};
use core::future::Future;

use dbos::{
    Client, ClientConfig, DBOS, QueueConflict, QueueOptions,
    sysdb::{self, SystemDatabase as _, postgres},
};
use error_stack::{Report, ResultExt as _};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    BackendError, FunctionVersion, RunError, RunFunction, Worker,
    dbos::{
        step::DbosStepContext,
        stored::{RunFailureStored, RunStartStored},
    },
};

mod coordination;
mod runs;
mod step;
mod stored;

/// The DBOS application every process registers as.
const APP_NAME: &str = "hash-integrations";

/// The workflow every run executes.
const WORKFLOW: &str = "integration-run";

/// The queue every run starts on.
const QUEUE: &str = "integration-runs";

/// The DBOS application version of a run function's version.
fn app_version(version: FunctionVersion) -> String {
    format!("v{version}")
}

/// What the backend was doing with DBOS when a call failed.
///
/// A trait method reports its trait's error, with one of these under it and DBOS's own error
/// under that.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum DbosError {
    #[display("could not migrate DBOS's schema")]
    Migrate,
    #[display("could not connect the DBOS client")]
    ConnectClient,
    #[display("could not register the run queue")]
    RegisterQueue,
    #[display("could not set up the token bucket table")]
    Buckets,
    #[display("could not launch the worker")]
    Launch,
    #[display("could not enqueue the run")]
    Enqueue,
    #[display("could not read the run")]
    Read,
    #[display("the run's record is not one this backend wrote")]
    Recorded,
    #[display("could not cancel the run")]
    Cancel,
}

/// Where the DBOS backend keeps its runs.
#[derive(Debug, Clone)]
pub struct DbosConfig {
    /// The Postgres database that holds DBOS's system schema, as a connection URL.
    pub database_url: String,
    /// The schema DBOS keeps its tables in.
    pub schema: String,
    /// Names this process among the workers sharing the database. DBOS resumes the runs a
    /// process left unfinished when a process with the same ID launches, so a deployment gives
    /// each worker slot a stable ID. `None` takes a new ID per process.
    pub executor_id: Option<String>,
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
            executor_id: None,
            queue_concurrency: None,
        }
    }
}

/// The backend on DBOS.
///
/// It holds a DBOS client, through which [`Runs`](crate::Runs) starts, reads and cancels runs
/// without a worker, and a Postgres connection of its own for the token buckets. A worker is a
/// DBOS instance of its own, built by [`Worker::work`].
pub struct DbosBackend {
    config: DbosConfig,
    executor_id: String,
    client: Client,
    postgres: tokio_postgres::Client,
    /// The token bucket statement, with the schema filled in.
    consume: String,
}

impl DbosBackend {
    /// Connects to the system database, migrating DBOS's schema if it is missing or behind,
    /// registers the run queue and creates the token bucket table. A queue that already exists
    /// keeps its stored limits.
    ///
    /// # Errors
    ///
    /// - [`DbosError::Migrate`] if the schema cannot be created or migrated.
    /// - [`DbosError::ConnectClient`] if the DBOS client cannot connect.
    /// - [`DbosError::RegisterQueue`] if the run queue cannot be registered.
    /// - [`DbosError::Buckets`] if the token bucket connection or table cannot be set up.
    #[tracing::instrument(skip_all, fields(schema = %config.schema))]
    pub async fn connect(config: DbosConfig) -> Result<Self, Report<DbosError>> {
        migrate(&config).await?;

        let mut client_config = ClientConfig::new(config.database_url.clone());
        client_config.app_name = Some(String::from(APP_NAME));
        client_config.schema = config.schema.clone();
        let client = Client::connect(client_config)
            .await
            .change_context(DbosError::ConnectClient)?;

        let concurrency = config
            .queue_concurrency
            .map(i32::try_from)
            .transpose()
            .change_context(DbosError::RegisterQueue)?;
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
            .change_context(DbosError::RegisterQueue)?;

        let (postgres, connection) = tokio_postgres::connect(&config.database_url, NoTls)
            .await
            .change_context(DbosError::Buckets)?;
        tokio::spawn(async move {
            if let Err(error) = connection.await {
                tracing::error!(error = %error, "the token bucket connection closed");
            }
        });
        postgres
            .batch_execute(&coordination::create_table(&config.schema))
            .await
            .change_context(DbosError::Buckets)?;

        Ok(Self {
            consume: coordination::consume(&config.schema),
            executor_id: config
                .executor_id
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            config,
            client,
            postgres,
        })
    }

    /// Closes the connection to the system database.
    pub async fn close(&self) {
        self.client.close().await;
    }
}

impl Worker for DbosBackend {
    /// A DBOS instance for `F::VERSION`, launched with the run workflow registered on it. Its
    /// launch resumes the runs a previous process under this executor ID left unfinished.
    #[tracing::instrument(skip_all, fields(version = %F::VERSION))]
    fn work<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
        shutdown: CancellationToken,
    ) -> impl Future<Output = Result<(), Report<BackendError>>> + Send {
        async move {
            let dbos = self.launch(function).await.change_context(BackendError)?;
            shutdown.cancelled().await;
            dbos.shutdown().await;
            Ok(())
        }
    }
}

impl DbosBackend {
    /// Launches a DBOS instance for `F::VERSION` with the run workflow registered on it.
    async fn launch<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
    ) -> Result<DBOS, Report<DbosError>> {
        let mut config = dbos::Config::new(APP_NAME, self.config.database_url.clone());
        config.schema = self.config.schema.clone();
        config.app_version = Some(app_version(F::VERSION));
        config.executor_id = Some(self.executor_id.clone());

        let dbos = DBOS::new(config);
        dbos.register_workflow(WORKFLOW, move |start: RunStartStored| {
            run_workflow(Arc::clone(&function), start)
        })
        .change_context(DbosError::Launch)?;
        dbos.launch().await.change_context(DbosError::Launch)?;
        Ok(dbos)
    }
}

/// The `integration-run` workflow: `function` on a stored start.
async fn run_workflow<F: RunFunction>(
    function: Arc<F>,
    start: RunStartStored,
) -> dbos::Result<(), RunFailureStored> {
    let input = start.input.decode::<F::Input>().map_err(|error| {
        tracing::error!(error = ?error, "the run's input is not the function's input");
        dbos::Error::Application(RunFailureStored::Function {
            code: String::from("invalid-input"),
        })
    })?;
    let mut context = DbosStepContext::new(start.policy);

    match function.run(&mut context, input).await {
        Ok(()) => Ok(()),
        Err(report) => Err(match report.current_context() {
            RunError::Failed { code } => dbos::Error::Application(RunFailureStored::Function {
                code: String::from(code.as_ref()),
            }),
            RunError::Stopped => context.reason.take().unwrap_or_else(|| {
                dbos::Error::Application(RunFailureStored::Function {
                    code: String::from("stopped-without-step"),
                })
            }),
        }),
    }
}

/// Creates or migrates DBOS's schema.
///
/// A DBOS client only verifies the schema, so this opens a system database connection with
/// migration on, as a launching worker does, and closes it again.
async fn migrate(config: &DbosConfig) -> Result<(), Report<DbosError>> {
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
    .change_context(DbosError::Migrate)?;
    database.close().await;
    Ok(())
}
