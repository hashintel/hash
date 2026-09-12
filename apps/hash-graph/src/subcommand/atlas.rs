use alloc::sync::Arc;
use core::{net::SocketAddr, time::Duration};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_api::rest::{auth::build_authentication_provider, rate_limit::RateLimitConfig};
use hash_graph_atlas::cli::{self, PasswordString, Storage};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_store::filter::protection::PropertyProtectionFilterConfig;
use hash_telemetry::Telemetry;
use opentelemetry::metrics::Meter;
use reqwest::Client;
use tokio::{net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;

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
#[derive(Debug, Parser)]
pub struct AtlasArgs {
    #[command(subcommand)]
    pub command: AtlasCommand,
}

/// The atlas operations.
#[derive(Debug, clap::Subcommand)]
pub enum AtlasCommand {
    /// Serves the read API over the root's active generation.
    Serve(Box<AtlasServeArgs>),
    /// Fits one generation over the live store and activates it on admission.
    Fit(Box<AtlasFitArgs>),
    /// Probes the liveness endpoint of a serving atlas process.
    Healthcheck(AtlasHealthcheckArgs),
}

/// CLI arguments for `atlas serve`.
#[derive(Debug, Parser)]
pub struct AtlasServeArgs {
    #[clap(flatten)]
    pub address: AtlasAddress,

    #[clap(flatten)]
    pub root: cli::RootArgs,

    #[clap(flatten)]
    pub serve: cli::ServeArgs,

    #[clap(flatten)]
    pub s3: cli::S3Args,

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
    #[clap(long, env = "HASH_GRAPH_SERVICE_SECRET", hide_env_values = true)]
    pub service_secret: PasswordString,

    #[clap(flatten)]
    pub rate_limit: RateLimitConfig,

    /// Disables filter protection that prevents enumeration attacks on protected properties.
    ///
    /// The flag matches the server subcommand's, so the embedding exclusions the atlas ensures
    /// carry stay equal to the exclusions the store's own workflow starts carry.
    #[clap(long, env = "HASH_GRAPH_SKIP_FILTER_PROTECTION")]
    pub skip_filter_protection: bool,
}

/// CLI arguments for `atlas fit`.
#[derive(Debug, Parser)]
pub struct AtlasFitArgs {
    #[clap(flatten)]
    pub root: cli::RootArgs,

    #[clap(flatten)]
    pub s3: cli::S3Args,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub fit: cli::FitArgs,

    #[clap(flatten)]
    pub credential: cli::EmbedderArgs,
}

/// CLI arguments for `atlas healthcheck`.
#[derive(Debug, Parser)]
pub struct AtlasHealthcheckArgs {
    #[clap(flatten)]
    pub address: AtlasAddress,

    /// Waits for the healthcheck to become healthy.
    #[clap(long, default_value_t = false)]
    pub wait: bool,

    /// Timeout for the wait flag in seconds.
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,
}

struct AtlasTelemetry {
    meter: Meter,
}

/// Runs HTTP and retains generation maintenance through listener and request failures.
async fn run_atlas(
    args: AtlasServeArgs,
    telemetry: &AtlasTelemetry,
    lifecycle: ServerLifecycle,
) -> Result<(), Report<GraphError>> {
    // Before running anything, make sure that the configuration is valid.
    let session_auth = args.session_auth.into_provider_config()?;

    let filter_protection = if args.skip_filter_protection {
        PropertyProtectionFilterConfig::new()
    } else {
        PropertyProtectionFilterConfig::hash_default()
    };
    let exclusions = filter_protection.embedding_exclusions().clone();

    let service_secret = cli::SecretString::from(args.service_secret);

    let mut storage = Storage::in_temp_dir();
    if let Some(s3) = args.s3.client().await.change_context(GraphError)? {
        storage.set_s3(s3);
    }

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

    let provider = Arc::new(build_authentication_provider(
        session_auth,
        None,
        service_secret.clone().into_unguarded().as_ref().to_owned(),
        &pool,
        &telemetry.meter,
    ));

    let serve = cli::ServeCommand::new(args.root, args.serve)
        .run(cli::ServeOptions {
            provider,
            service_secret,
            rate_limit: (&args.rate_limit).into(),
            pool,
            visibility: cli::VisibilityLimits {
                bytes: 1 << 30,
                soft: Duration::from_mins(8),
                hard: Duration::from_mins(10),
            },
            workflow,
            storage,
        })
        .change_context(GraphError)?;

    let shutdown = lifecycle.shutdown.clone();
    let serve_shutdown = shutdown.clone();

    let (router, maintenance, download) =
        serve.into_parts(move || serve_shutdown.clone().cancelled_owned());

    lifecycle.spawn("Atlas generations", async move {
        maintenance.await;
        Ok(())
    });
    if let Some(download) = download {
        lifecycle.spawn("Atlas download", async move {
            download.await;
            Ok(())
        });
    }

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
pub async fn atlas(args: AtlasArgs, telemetry: &Telemetry) -> Result<(), Report<GraphError>> {
    let serve_args = match args.command {
        AtlasCommand::Fit(fit_args) => {
            let mut storage = Storage::in_temp_dir();
            if let Some(s3) = fit_args.s3.client().await.change_context(GraphError)? {
                storage.set_s3(s3);
            }

            let mut client = cli::connect(&fit_args.db_info.url())
                .await
                .change_context(GraphError)?;

            let command = cli::FitCommand::new(fit_args.root, fit_args.fit, storage)
                .await
                .change_context(GraphError)?;
            let verdict = Box::pin(command.run(&mut client, fit_args.credential))
                .await
                .change_context(GraphError)?;

            print_verdict(&verdict);

            return Ok(());
        }
        AtlasCommand::Healthcheck(healthcheck_args) => {
            return wait_healthcheck(
                || healthcheck(healthcheck_args.address.clone()),
                &HealthcheckArgs {
                    healthcheck: true,
                    wait: healthcheck_args.wait,
                    timeout: healthcheck_args.timeout,
                },
            )
            .await
            .change_context(GraphError);
        }
        AtlasCommand::Serve(serve_args) => serve_args,
    };

    let telemetry = AtlasTelemetry {
        meter: telemetry.meter("Graph Atlas API"),
    };

    let lifecycle = ServerLifecycle::new();
    let server_lifecycle = lifecycle.clone();
    lifecycle.spawn("Atlas", async move {
        run_atlas(*serve_args, &telemetry, server_lifecycle).await
    });

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
    use tokio::net::TcpListener;

    use super::{AtlasAddress, HealthcheckArgs, healthcheck, wait_healthcheck};

    #[tokio::test]
    async fn status_healthy() {
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
