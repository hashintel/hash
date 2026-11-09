//! The orchestration backend on DBOS.
//!
//! A run is a DBOS workflow and each of its steps a DBOS step, recorded in a Postgres system
//! database that every process shares. A run starts on the `integration-runs` queue with its
//! admission key as the deduplication ID, so one run per admission key is queued or running at a
//! time. A run function's version is DBOS's application version, so a worker executes only runs
//! started with its function's version.

use alloc::{format, string::String, sync::Arc};
use core::future::Future;

use dbos::{
    Client, ClientConfig, DBOS, DuplicationPolicy, Enqueue, EnqueueOptions, QueueConflict,
    QueueOptions,
    sysdb::{self, SystemDatabase as _, postgres},
};
use error_stack::{Report, ResultExt as _};
use tokio_util::sync::CancellationToken;

use crate::{
    BackendError, FunctionVersion, RunError, RunFunction, RunId, RunStart, StartError, Worker,
    dbos::{
        step::DbosStepContext,
        stored::{RunFailureStored, RunStartStored},
    },
};

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
/// It holds a DBOS client, which starts, reads and cancels runs without a worker. A worker is a
/// DBOS instance of its own, built by [`Worker::work`].
pub struct DbosBackend {
    config: DbosConfig,
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

        Ok(Self { config, client })
    }

    /// Starts a run: enqueues it under the ID `run` with its admission key as the deduplication ID.
    ///
    /// # Errors
    ///
    /// - [`StartError::AlreadyActive`] if another run is active under the same admission key.
    /// - [`StartError::Backend`] if the backend could not record the start.
    #[tracing::instrument(skip_all, fields(run = %run))]
    pub async fn start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        let version = app_version(start.version);
        let stored = RunStartStored::from(start);
        let handle = self
            .client
            .enqueue_with::<_, (), RunFailureStored>(
                WORKFLOW,
                &stored,
                EnqueueOptions {
                    workflow_id: Some(run.as_ref()),
                    app_version: Some(&version),
                    ..EnqueueOptions::on(Enqueue {
                        deduplication_id: Some(&stored.admission),
                        duplication_policy: DuplicationPolicy::ReturnExisting,
                        ..Enqueue::new(QUEUE)
                    })
                },
            )
            .await
            .change_context(StartError::Backend)?;

        let active = handle.workflow_id();
        if active == run.as_ref() {
            return Ok(());
        }
        Err(Report::new(StartError::AlreadyActive {
            active: active.parse().change_context(StartError::Backend)?,
        }))
    }

    /// Closes the connection to the system database.
    pub async fn close(&self) {
        self.client.close().await;
    }
}

impl Worker for DbosBackend {
    /// A DBOS instance for `F::VERSION`, launched with the run workflow registered on it.
    #[tracing::instrument(skip_all, fields(version = %F::VERSION))]
    fn work<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
        shutdown: CancellationToken,
    ) -> impl Future<Output = Result<(), Report<BackendError>>> + Send {
        async move {
            let mut config = dbos::Config::new(APP_NAME, self.config.database_url.clone());
            config.schema = self.config.schema.clone();
            config.app_version = Some(app_version(F::VERSION));

            let dbos = DBOS::new(config);
            dbos.register_workflow(WORKFLOW, move |start: RunStartStored| {
                run_workflow(Arc::clone(&function), start)
            })
            .change_context(BackendError)?;
            dbos.launch().await.change_context(BackendError)?;

            shutdown.cancelled().await;
            dbos.shutdown().await;
            Ok(())
        }
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
