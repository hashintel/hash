use alloc::sync::Arc;
use core::{fmt, net::SocketAddr, time::Duration};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_api::rest::jwt::JwtValidator;
use hash_graph_postgres_store::{
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings},
};
use reqwest::{Client, Url};
use tokio::{net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{HealthcheckArgs, ServerLifecycle, wait_healthcheck},
};

/// Address configuration for the admin server.
///
/// Shared between the standalone `admin-server` subcommand and the `server` subcommand (via
/// `--embed-admin`).
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

/// JWT authentication configuration for the admin server.
///
/// When all three fields are provided, JWT authentication is enabled. When none are provided, JWT
/// authentication is disabled (development mode). Providing a partial configuration is a clap
/// error.
#[derive(Debug, Clone, Parser)]
pub struct JwtConfig {
    /// JWKS endpoint URL for JWT signature validation.
    ///
    /// When set, all admin endpoints (except `/health`) require a valid JWT.
    /// For Cloudflare Access, this is typically `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.
    #[clap(long = "jwt-jwks-url", env = "HASH_GRAPH_JWT_JWKS_URL")]
    pub jwks_url: Url,

    /// Expected JWT audience claim.
    ///
    /// For Cloudflare Access, this is the Application Audience (AUD) Tag.
    #[clap(long = "jwt-audience", env = "HASH_GRAPH_JWT_AUDIENCE")]
    pub audience: String,

    /// Expected JWT issuer claim.
    ///
    /// For Cloudflare Access, this is typically `https://<team>.cloudflareaccess.com`.
    #[clap(long = "jwt-issuer", env = "HASH_GRAPH_JWT_ISSUER")]
    pub issuer: String,
}

/// Configuration for the admin server.
///
/// Shared between the standalone `admin-server` subcommand and the `server` subcommand (via
/// `--embed-admin`).
#[derive(Debug, Clone, Parser)]
pub struct AdminConfig {
    #[clap(flatten)]
    pub address: AdminAddress,

    #[clap(flatten)]
    pub jwt: Option<JwtConfig>,
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
    let jwt_validator = if let Some(jwt) = config.jwt {
        tracing::info!(jwks_url = %jwt.jwks_url, "JWT authentication enabled for admin API");
        Some(Arc::new(JwtValidator::new(
            jwt.jwks_url,
            jwt.audience,
            jwt.issuer,
        )))
    } else {
        tracing::warn!("JWT authentication disabled for admin API -- no JWKS URL configured");
        None
    };

    let router = hash_graph_api::rest::admin::routes(pool, jwt_validator);

    let listener = TcpListener::bind((&*config.address.admin_host, config.address.admin_port))
        .await
        .change_context(GraphError)?;
    tracing::info!("Admin server listening on {}", config.address);

    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.cancelled_owned())
    .await
    .change_context(GraphError)?;

    Ok(())
}

/// Spawns the admin server as a background task with lifecycle management.
pub(crate) fn start_admin_server(
    pool: PostgresStorePool,
    config: AdminConfig,
    lifecycle: &ServerLifecycle,
) {
    SnapshotEntry::install_error_stack_hook();

    let shutdown = lifecycle.shutdown.clone();
    lifecycle.spawn("Admin server", async move {
        run_admin_server(pool, config, shutdown).await
    });
}

/// Standalone `admin-server` subcommand entrypoint.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "False positive on tokio::select!"
)]
#[expect(
    clippy::exit,
    reason = "Force shutdown on double ctrl-c is intentional"
)]
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

    let lifecycle = ServerLifecycle::new();
    start_admin_server(pool, args.config, &lifecycle);

    // Wait for shutdown signal or unexpected server exit
    let aborted = tokio::select! {
        result = signal::ctrl_c() => {
            match result {
                Ok(()) => false,
                Err(error) => {
                    tracing::error!("Failed to install Ctrl+C handler: {error}");
                    true
                }
            }
        }
        () = lifecycle.abort.cancelled() => {
            tracing::error!("Admin server exited unexpectedly");
            true
        }
    };

    // Double ctrl-c for force shutdown
    tokio::select! {
        () = lifecycle.shutdown_and_wait() => {}
        result = signal::ctrl_c() => {
            if let Err(error) = result {
                tracing::error!("Failed to install Ctrl+C handler: {error}");
            }
            tracing::warn!("Forced shutdown");
            std::process::exit(1);
        }
    }

    tracing::info!("Shutdown complete");

    if aborted {
        Err(GraphError.into())
    } else {
        Ok(())
    }
}

pub async fn healthcheck(address: AdminAddress) -> Result<(), Report<HealthcheckError>> {
    let request_url = format!("http://{address}/health");

    timeout(
        Duration::from_secs(10),
        Client::new().head(&request_url).send(),
    )
    .await
    .change_context(HealthcheckError::Timeout)?
    .change_context(HealthcheckError::NotHealthy)?
    .error_for_status()
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
