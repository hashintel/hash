use core::{fmt, net::SocketAddr, time::Duration};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_postgres_store::{
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings},
};
use reqwest::Client;
use tokio::{net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{HealthcheckArgs, ServerTaskTracker, wait_healthcheck},
};

/// Address configuration for the admin server.
///
/// Shared between the standalone `admin-server` subcommand and the `server`
/// subcommand (via `--embed-admin`).
#[derive(Debug, Clone, Parser)]
pub struct AdminAddress {
    /// The host the admin server is listening at.
    #[clap(long, default_value = "127.0.0.1", env = "HASH_GRAPH_ADMIN_HOST")]
    pub admin_host: String,

    /// The port the admin server is listening at.
    #[clap(long, default_value_t = 4001, env = "HASH_GRAPH_ADMIN_PORT")]
    pub admin_port: u16,
}

impl fmt::Display for AdminAddress {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.admin_host, self.admin_port)
    }
}

/// Configuration for the admin server.
///
/// Shared between the standalone `admin-server` subcommand and the `server`
/// subcommand (via `--embed-admin`).
#[derive(Debug, Clone, Parser)]
pub struct AdminConfig {
    #[clap(flatten)]
    pub address: AdminAddress,
}

/// CLI arguments for the standalone `admin-server` subcommand.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct AdminServerArgs {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub pool_config: DatabasePoolConfig,

    #[clap(flatten)]
    pub config: AdminConfig,

    #[clap(flatten)]
    pub healthcheck: HealthcheckArgs,
}

/// Runs the admin server until `shutdown` is cancelled.
pub(crate) async fn run_admin_server(
    pool: PostgresStorePool,
    config: AdminConfig,
    shutdown: CancellationToken,
) -> Result<(), Report<GraphError>> {
    SnapshotEntry::install_error_stack_hook();

    let router = hash_graph_api::rest::admin::routes(pool);

    tracing::info!("Admin server listening on {}", config.address);
    axum::serve(
        TcpListener::bind((config.address.admin_host, config.address.admin_port))
            .await
            .change_context(GraphError)?,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.cancelled_owned())
    .await
    .change_context(GraphError)?;

    Ok(())
}

/// Spawns the admin server as a background task with graceful shutdown support.
pub(crate) fn start_admin_server(
    pool: PostgresStorePool,
    config: AdminConfig,
) -> ServerTaskTracker {
    let (handle, shutdown) = ServerTaskTracker::new();
    handle.spawn(async move {
        if let Err(report) = run_admin_server(pool, config, shutdown).await {
            tracing::error!(error = ?report, "Admin server failed");
        }
    });
    handle
}

/// Standalone `admin-server` subcommand entrypoint.
pub async fn admin_server(args: AdminServerArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.config.address.clone()),
            &args.healthcheck,
        )
        .await
        .change_context(GraphError);
    }

    let pool = PostgresStorePool::new(
        &args.db_info,
        &args.pool_config,
        NoTls,
        PostgresStoreSettings::default(),
    )
    .await
    .change_context(GraphError)
    .map_err(|report| {
        tracing::error!(error = ?report, "Failed to connect to database");
        report
    })?;

    let handle = start_admin_server(pool, args.config);

    // Wait for shutdown signal
    match signal::ctrl_c().await {
        Ok(()) => {}
        Err(error) => {
            tracing::error!("Failed to install Ctrl+C handler: {error}");
        }
    }

    tracing::info!("Shutting down...");
    handle.await;
    tracing::info!("Shutdown complete");

    Ok(())
}

pub async fn healthcheck(address: AdminAddress) -> Result<(), Report<HealthcheckError>> {
    let request_url = format!("http://{address}/health");

    timeout(
        Duration::from_secs(10),
        Client::new().head(&request_url).send(),
    )
    .await
    .change_context(HealthcheckError::Timeout)?
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
