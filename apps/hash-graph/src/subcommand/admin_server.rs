use alloc::sync::Arc;
use core::{fmt, net::SocketAddr, str::FromStr as _, time::Duration};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_api::rest::jwt::{JwtValidator, JwtValidatorConfig};
use hash_graph_postgres_store::{
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings},
};
use jsonwebtoken::Algorithm;
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

/// Parses a JWT algorithm name (e.g. `"RS256"`) into a [`jsonwebtoken::Algorithm`].
///
/// # Errors
///
/// Returns an error string if the algorithm name is not recognized.
fn parse_jwt_algorithm(name: &str) -> Result<Algorithm, String> {
    Algorithm::from_str(name).map_err(|_err| format!("unknown JWT algorithm: {name}"))
}

/// JWT authentication configuration for the admin server.
///
/// All three identity fields (`jwks_url`, `audience`, `issuer`) must be provided together or not at
/// all. When none are set, `--unsafe-allow-dev-authentication` is required for the server to start.
/// Partial configuration is rejected by clap's `requires`.
///
/// Operational parameters (cache TTL, refresh cooldown, HTTP timeout, algorithms) have sensible
/// defaults and only take effect when JWT authentication is enabled.
//
// Ideally this would have required fields and be used as `Option<JwtConfig>` in `AdminConfig`, but
// clap does not support optional flattened structs with required fields.
// See <https://github.com/clap-rs/clap/issues/5092>.
#[derive(Debug, Clone, Parser)]
pub struct JwtConfig {
    /// JWKS endpoint URL for JWT signature validation.
    ///
    /// When set, all admin endpoints (except `/health`) require a valid JWT.
    /// For Cloudflare Access, this is typically
    /// `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`.
    #[clap(
        long = "jwt-jwks-url",
        env = "HASH_GRAPH_JWT_JWKS_URL",
        requires = "audience",
        requires = "issuer"
    )]
    pub jwks_url: Option<Url>,

    /// Expected JWT audience claim.
    ///
    /// For Cloudflare Access, this is the Application Audience (AUD) Tag.
    #[clap(
        long = "jwt-audience",
        env = "HASH_GRAPH_JWT_AUDIENCE",
        requires = "jwks_url",
        requires = "issuer"
    )]
    pub audience: Option<String>,

    /// Expected JWT issuer claim.
    ///
    /// For Cloudflare Access, this is typically `https://<team>.cloudflareaccess.com`.
    #[clap(
        long = "jwt-issuer",
        env = "HASH_GRAPH_JWT_ISSUER",
        requires = "jwks_url",
        requires = "audience"
    )]
    pub issuer: Option<String>,

    /// How long to cache JWKS keys before re-fetching (in seconds).
    #[clap(
        long = "jwt-jwks-cache-ttl",
        env = "HASH_GRAPH_JWT_JWKS_CACHE_TTL",
        default_value_t = 600
    )]
    pub jwks_cache_ttl_secs: u64,

    /// Minimum interval between forced JWKS refreshes in seconds.
    ///
    /// Prevents denial-of-service via crafted `kid` values triggering unbounded JWKS fetches.
    #[clap(
        long = "jwt-jwks-refresh-cooldown",
        env = "HASH_GRAPH_JWT_JWKS_REFRESH_COOLDOWN",
        default_value_t = 30
    )]
    pub jwks_refresh_cooldown_secs: u64,

    /// HTTP client timeout for JWKS fetches (in seconds).
    #[clap(
        long = "jwt-http-timeout",
        env = "HASH_GRAPH_JWT_HTTP_TIMEOUT",
        default_value_t = 10
    )]
    pub http_timeout_secs: u64,

    /// Algorithms accepted in JWT headers.
    ///
    /// Only asymmetric algorithms should be allowed to prevent algorithm confusion attacks.
    #[clap(
        long = "jwt-allowed-algorithm",
        env = "HASH_GRAPH_JWT_ALLOWED_ALGORITHMS",
        value_delimiter = ',',
        value_parser = parse_jwt_algorithm,
        default_values = ["RS256", "RS384", "RS512", "ES256", "ES384"]
    )]
    pub allowed_algorithms: Vec<Algorithm>,
}

/// Configuration for external identity services (Kratos, Hydra, Mailchimp).
///
/// All fields are optional at the CLI/env level so that `AdminConfig` can be flattened into
/// `ServerArgs` without forcing callers to provide Kratos/Hydra URLs when `--embed-admin` is not
/// set. When the admin server actually starts, [`run_admin_server`] validates that the required
/// URLs are present.
//
// Ideally these would be required fields and `AdminConfig` would be used as
// `Option<AdminConfig>` in `ServerArgs`, but clap does not support optional flattened structs
// with required fields. See <https://github.com/clap-rs/clap/issues/5092>.
#[derive(Debug, Clone, Parser)]
pub struct ExternalServicesConfig {
    /// Kratos admin API URL for identity management.
    #[clap(long, env = "HASH_KRATOS_ADMIN_URL")]
    pub kratos_admin_url: Option<Url>,

    /// Hydra admin API URL for OAuth2 session management.
    #[clap(long, env = "HASH_HYDRA_ADMIN_URL")]
    pub hydra_admin_url: Option<Url>,

    /// Mailchimp API key for email subscription management.
    ///
    /// The server prefix is extracted from the key (format: `<key>-<server>`, e.g. `abc123-us15`).
    #[clap(long, env = "MAILCHIMP_API_KEY", requires = "mailchimp_list_id")]
    pub mailchimp_api_key: Option<String>,

    /// Mailchimp audience list ID.
    #[clap(long, env = "MAILCHIMP_LIST_ID", requires = "mailchimp_api_key")]
    pub mailchimp_list_id: Option<String>,
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
    pub jwt: JwtConfig,

    #[clap(flatten)]
    pub external_services: ExternalServicesConfig,

    /// Allow header-based authentication and bulk destructive endpoints without JWT.
    ///
    /// When set, the admin server accepts the `X-Authenticated-User-Actor-Id` header for
    /// authentication and registers bulk destructive endpoints (`/snapshot`, `/accounts`,
    /// `/data-types`, `/property-types`, `/entity-types`).
    ///
    /// **This flag must never be used in production or staging.** Without JWT, any client that
    /// can reach the admin port can execute destructive operations without authentication.
    ///
    /// If neither JWT nor this flag is configured, the server refuses to start.
    #[clap(
        long,
        env = "HASH_GRAPH_UNSAFE_DEV_AUTH",
        default_value_t = false,
        conflicts_with = "jwks_url"
    )]
    pub unsafe_allow_dev_authentication: bool,
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
    let jwt_validator = match (config.jwt.jwks_url, config.jwt.audience, config.jwt.issuer) {
        (Some(jwks_url), Some(audience), Some(issuer)) => {
            if config.unsafe_allow_dev_authentication {
                // Clap `conflicts_with` should prevent this, but guard against it anyway.
                return Err(Report::new(GraphError).attach(
                    "--unsafe-allow-dev-authentication cannot be used with JWT authentication. \
                     Remove the flag or the JWT configuration.",
                ));
            }
            tracing::info!(%jwks_url, "JWT authentication enabled for admin API");
            Some(Arc::new(JwtValidator::new(JwtValidatorConfig {
                jwks_url,
                audience,
                issuer,
                jwks_cache_ttl: Duration::from_secs(config.jwt.jwks_cache_ttl_secs),
                jwks_refresh_cooldown: Duration::from_secs(config.jwt.jwks_refresh_cooldown_secs),
                http_timeout: Duration::from_secs(config.jwt.http_timeout_secs),
                allowed_algorithms: config.jwt.allowed_algorithms,
            })))
        }
        (None, None, None) if config.unsafe_allow_dev_authentication => {
            tracing::warn!(
                "--unsafe-allow-dev-authentication is set -- header-based authentication is \
                 enabled without verification. DO NOT use this in production."
            );
            None
        }
        (None, None, None) => {
            return Err(Report::new(GraphError).attach(
                "no JWT authentication configured and --unsafe-allow-dev-authentication is not \
                 set. Either configure JWT (--jwt-jwks-url, --jwt-audience, --jwt-issuer) or pass \
                 --unsafe-allow-dev-authentication for local development.",
            ));
        }
        _ => {
            // Clap `requires` should prevent this, but guard against it anyway.
            return Err(Report::new(GraphError).attach(
                "partial JWT configuration: --jwt-jwks-url, --jwt-audience, and --jwt-issuer must \
                 all be provided together",
            ));
        }
    };

    let kratos_admin_url = config.external_services.kratos_admin_url.ok_or_else(|| {
        Report::new(GraphError).attach(
            "--kratos-admin-url (HASH_KRATOS_ADMIN_URL) is required when running the admin server",
        )
    })?;
    let hydra_admin_url = config.external_services.hydra_admin_url.ok_or_else(|| {
        Report::new(GraphError).attach(
            "--hydra-admin-url (HASH_HYDRA_ADMIN_URL) is required when running the admin server",
        )
    })?;

    let router = hash_graph_api::rest::admin::routes(
        pool,
        jwt_validator,
        hash_graph_api::rest::admin::ExternalServicesConfig {
            kratos_admin_url,
            hydra_admin_url,
            mailchimp_api_key: config.external_services.mailchimp_api_key,
            mailchimp_list_id: config.external_services.mailchimp_list_id,
        },
    );

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
