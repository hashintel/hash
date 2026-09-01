use alloc::sync::Arc;
use core::{net::SocketAddr, time::Duration};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_api::rest::{auth::build_authentication_provider, rate_limit::RateLimitConfig};
use hash_graph_atlas::cli::{self, PasswordString};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_store::filter::protection::PropertyProtectionFilterConfig;
use reqwest::Client;
use tokio::{net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{
        HealthcheckArgs, ServerLifecycle,
        server::{KratosSessionAuthConfig, TemporalConfig, create_temporal_client},
        wait_healthcheck,
    },
};

/// Address configuration for the atlas server.
#[derive(Debug, Clone, Parser)]
pub struct AtlasAddress {
    /// The host the atlas HTTP server is listening at.
    #[clap(long, default_value = "127.0.0.1", env = "HASH_GRAPH_ATLAS_HOST")]
    pub atlas_host: String,

    /// The port the atlas HTTP server is listening at.
    #[clap(long, default_value_t = 4003, env = "HASH_GRAPH_ATLAS_PORT")]
    pub atlas_port: u16,
}

/// CLI arguments for the `atlas` subcommand.
///
/// Without a subcommand, `atlas` serves the root's active generation - the deployment default
/// (`command: atlas` in the compose stack). `atlas fit` runs one production generation over the
/// live store.
#[derive(Debug, Parser)]
pub struct AtlasArgs {
    #[clap(flatten)]
    pub address: AtlasAddress,

    #[clap(flatten)]
    pub healthcheck: HealthcheckArgs,

    #[clap(flatten)]
    pub root: cli::RootArgs,

    #[clap(flatten)]
    pub serve: cli::ServeArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub db_pool_config: DatabasePoolConfig,

    #[clap(flatten)]
    pub temporal: TemporalConfig,

    #[clap(flatten)]
    pub session_auth: KratosSessionAuthConfig,

    /// Shared secret internal services present to act on behalf of an actor.
    ///
    /// Sent as the `Authorization: HASH-Service <secret>` credential next to
    /// `X-Authenticated-User-Actor-Id`.
    //
    // Optional at parse time so `--healthcheck` does not require the environment variable. The
    // serve refuses to start without it.
    #[clap(long, env = "HASH_GRAPH_SERVICE_SECRET", hide_env_values = true)]
    pub service_secret: Option<PasswordString>,

    #[clap(flatten)]
    pub rate_limit: RateLimitConfig,

    /// Disables filter protection that prevents enumeration attacks on protected properties.
    ///
    /// The flag matches the server subcommand's, so the embedding exclusions the atlas ensures
    /// carry stay equal to the exclusions the store's own workflow starts carry.
    #[clap(long, env = "HASH_GRAPH_SKIP_FILTER_PROTECTION")]
    pub skip_filter_protection: bool,

    #[command(subcommand)]
    pub command: Option<AtlasCommand>,
}

/// The explicit atlas operations. When absent, the subcommand serves.
#[derive(Debug, clap::Subcommand)]
pub enum AtlasCommand {
    /// Fits one generation over the live store and activates it on
    /// admission.
    Fit {
        #[clap(flatten)]
        args: cli::FitArgs,

        #[clap(flatten)]
        credential: cli::EmbedderArgs,
    },
}

/// Runs the atlas server, shutting down when `shutdown` is cancelled.
pub(crate) async fn run_atlas(
    args: AtlasArgs,
    shutdown: CancellationToken,
) -> Result<(), Report<GraphError>> {
    // Before running anything, make sure that the configuration is valid.
    let session_auth = args.session_auth.into_provider_config()?;

    // The same filter-protection configuration the server subcommand parses, so the embedding
    // exclusions the staging arm's ensures carry stay equal to the exclusions the store's own
    // workflow starts carry.
    let filter_protection = if args.skip_filter_protection {
        PropertyProtectionFilterConfig::new()
    } else {
        PropertyProtectionFilterConfig::hash_default()
    };
    let exclusions = filter_protection.embedding_exclusions().clone();

    let service_secret = args
        .service_secret
        .map(cli::SecretString::from)
        .ok_or_else(|| {
            Report::new(GraphError).attach(
                "--service-secret (HASH_GRAPH_SERVICE_SECRET) must be set and non-empty when \
                 running the atlas server",
            )
        })?;

    // A single pool serves the whole process, so the detail trailers, the permission
    // resolution, and the credential chain's actor lookups behind every request read through
    // shared connections and none waits on a connection another holds.
    let pool = Arc::new(
        PostgresStorePool::new(
            &args.db_info,
            &args.db_pool_config,
            NoTls,
            PostgresStoreSettings {
                filter_protection,
                ..PostgresStoreSettings::default()
            },
        )
        .await
        .change_context(GraphError)?,
    );

    // Absent a configured Temporal server, arrivals stage and never ensure, which fails closed.
    let workflow =
        create_temporal_client(&args.temporal)
            .await?
            .map(|client| cli::EmbeddingWorkflow {
                temporal: client,
                exclusions,
            });

    // The chain the REST router authenticates with, so a credential means the same thing on
    // every route of the deployment: a Kratos session, or the service secret with the actor it
    // delegates. Cloudflare Access fronts the admin server's operator routes, so no JWT
    // verifier enters this chain.
    let provider = Arc::new(build_authentication_provider(
        session_auth,
        None,
        service_secret.clone().into_unguarded().as_ref().to_owned(),
        &pool,
    ));

    // Every request answers under the scope of the actor it names.
    let router = cli::ServeCommand::new(args.root, args.serve)
        .run(cli::ServeOptions {
            provider,
            service_secret,
            rate_limit: (&args.rate_limit).into(),
            pool,
            visibility: cli::VisibilityLimits::default(),
            workflow,
        })
        .map_err(Report::new)
        .change_context(GraphError)?;

    let listener = TcpListener::bind((&*args.address.atlas_host, args.address.atlas_port))
        .await
        .change_context(GraphError)?;

    tracing::info!(
        "Listening on port {}",
        listener.local_addr().change_context(GraphError)?.port()
    );

    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.cancelled_owned())
    .await
    .change_context(GraphError)?;

    Ok(())
}

/// Renders one fit's verdict, the `atlas fit` subcommand's product.
#[expect(
    clippy::print_stdout,
    reason = "the verdict is the subcommand's product"
)]
fn print_verdict(verdict: &cli::FitVerdict) {
    println!("{verdict}");
}

/// Standalone `atlas` subcommand entrypoint.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "False positive on tokio::select!"
)]
#[expect(
    clippy::exit,
    reason = "Force shutdown on double ctrl-c is intentional"
)]
pub async fn atlas(mut args: AtlasArgs) -> Result<(), Report<GraphError>> {
    if let Some(AtlasCommand::Fit {
        args: fit_args,
        credential,
    }) = args.command.take()
    {
        let mut client = cli::connect(&args.db_info.url())
            .await
            .map_err(Report::new)
            .change_context(GraphError)?;
        let verdict = cli::FitCommand::new(args.root, fit_args)
            .run(&mut client, credential)
            .await
            .map_err(Report::new)
            .change_context(GraphError)?;
        print_verdict(&verdict);

        return Ok(());
    }

    if args.healthcheck.healthcheck {
        return wait_healthcheck(|| healthcheck(args.address.clone()), &args.healthcheck)
            .await
            .change_context(GraphError);
    }

    let lifecycle = ServerLifecycle::new();
    let shutdown = lifecycle.shutdown.clone();
    lifecycle.spawn("Atlas", async move { run_atlas(args, shutdown).await });

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
            tracing::error!("Atlas exited unexpectedly");
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

async fn healthcheck(address: AtlasAddress) -> Result<(), Report<HealthcheckError>> {
    let request_url = format!(
        "http://{}:{}/status",
        address.atlas_host, address.atlas_port
    );

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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn status_endpoint_reports_healthy() {
        // The liveness route mirrors the one `cli::open_router` mounts
        // beside the read API; the test exercises the healthcheck
        // plumbing without standing up a generation.
        let router = axum::Router::new().route(
            "/status",
            axum::routing::get(async || axum::http::StatusCode::OK),
        );
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("should bind to an ephemeral port");
        let port = listener
            .local_addr()
            .expect("listener should have a local address")
            .port();
        tokio::spawn(async move { axum::serve(listener, router).await });

        let address = AtlasAddress {
            atlas_host: "127.0.0.1".to_owned(),
            atlas_port: port,
        };
        wait_healthcheck(
            || healthcheck(address.clone()),
            &HealthcheckArgs {
                healthcheck: true,
                wait: true,
                timeout: Some(5),
            },
        )
        .await
        .expect("running atlas stub should report healthy");
    }
}
