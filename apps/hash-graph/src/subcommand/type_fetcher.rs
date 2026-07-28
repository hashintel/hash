use core::{net::SocketAddr, time::Duration};
use std::{collections::HashMap, time::Instant};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_api::rest::http_tracing_layer::HttpTracingLayer;
use hash_graph_type_fetcher::fetcher_server::{FetchServer, router};
use reqwest::Client;
use tokio::{
    net::TcpListener,
    signal,
    time::{sleep, timeout},
};
use tokio_util::sync::CancellationToken;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{HealthcheckArgs, ServerLifecycle, wait_healthcheck},
};

/// Address configuration for the type fetcher server.
///
/// Shared between the standalone `type-fetcher` subcommand and the `server`
/// subcommand (via `--embed-type-fetcher`).
#[derive(Debug, Clone, Parser)]
pub struct TypeFetcherAddress {
    /// The host the type fetcher RPC server is listening at.
    #[clap(
        long,
        default_value = "127.0.0.1",
        env = "HASH_GRAPH_TYPE_FETCHER_HOST"
    )]
    pub type_fetcher_host: String,

    /// The port the type fetcher RPC server is listening at.
    #[clap(long, default_value_t = 4455, env = "HASH_GRAPH_TYPE_FETCHER_PORT")]
    pub type_fetcher_port: u16,
}

/// Configuration for the type fetcher server.
///
/// Shared between the standalone `type-fetcher` subcommand and the `server`
/// subcommand (via `--embed-type-fetcher`).
#[derive(Debug, Clone, Parser)]
pub struct TypeFetcherConfig {
    #[clap(flatten)]
    pub address: TypeFetcherAddress,
}

/// CLI arguments for the standalone `type-fetcher` subcommand.
#[derive(Debug, Parser)]
pub struct TypeFetcherArgs {
    #[clap(flatten)]
    pub config: TypeFetcherConfig,

    #[clap(flatten)]
    pub healthcheck: HealthcheckArgs,
}

/// Runs the type fetcher server, shutting down when `shutdown` is cancelled.
pub(crate) async fn run_type_fetcher(
    config: TypeFetcherConfig,
    shutdown: CancellationToken,
) -> Result<(), Report<GraphError>> {
    let listener = TcpListener::bind((
        &*config.address.type_fetcher_host,
        config.address.type_fetcher_port,
    ))
    .await
    .change_context(GraphError)?;

    tracing::info!(
        "Listening on port {}",
        listener.local_addr().change_context(GraphError)?.port()
    );

    let router = router(FetchServer {
        buffer_size: 10,
        predefined_types: HashMap::new(),
    })
    .layer(HttpTracingLayer);

    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.cancelled_owned())
    .await
    .change_context(GraphError)?;

    Ok(())
}

/// Spawns the type fetcher server as a background task with lifecycle management.
pub(crate) fn start_type_fetcher(config: TypeFetcherConfig, lifecycle: &ServerLifecycle) {
    let shutdown = lifecycle.shutdown.clone();
    lifecycle.spawn("Type fetcher", async move {
        run_type_fetcher(config, shutdown).await
    });
}

/// Total window to wait for an external type fetcher to become reachable at startup.
///
/// On a fresh ECS task the type fetcher is reached through its Service Connect (Envoy) sidecar,
/// which takes a few seconds to accept connections. Failing immediately would crash-loop the
/// task, so the probe retries with backoff until this window is exhausted.
pub(crate) const REACHABILITY_WINDOW: Duration = Duration::from_secs(30);

/// Waits for the type fetcher at `address` to respond to its `/health` endpoint.
///
/// Probes with exponential backoff until `window` has elapsed.
///
/// # Errors
///
/// Returns [`HealthcheckError::Timeout`] if the type fetcher did not respond within `window`.
pub(crate) async fn wait_for_type_fetcher(
    address: &TypeFetcherAddress,
    window: Duration,
) -> Result<(), Report<HealthcheckError>> {
    let deadline = Instant::now() + window;
    let mut delay = Duration::from_millis(500);

    loop {
        let Err(report) = healthcheck(address.clone()).await else {
            return Ok(());
        };
        if Instant::now() + delay > deadline {
            return Err(report.change_context(HealthcheckError::Timeout));
        }
        tracing::warn!(
            error = ?report,
            type_fetcher_host = address.type_fetcher_host,
            type_fetcher_port = address.type_fetcher_port,
            remaining = ?deadline.saturating_duration_since(Instant::now()),
            "Type fetcher is not reachable yet, retrying in {delay:?}"
        );
        sleep(delay).await;
        delay = (delay * 2).min(Duration::from_secs(5));
    }
}

/// Standalone `type-fetcher` subcommand entrypoint.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "False positive on tokio::select!"
)]
#[expect(
    clippy::exit,
    reason = "Force shutdown on double ctrl-c is intentional"
)]
pub async fn type_fetcher(args: TypeFetcherArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.config.address.clone()),
            &args.healthcheck,
        )
        .await
        .change_context(GraphError);
    }

    let lifecycle = ServerLifecycle::new();
    start_type_fetcher(args.config, &lifecycle);

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
            tracing::error!("Type fetcher exited unexpectedly");
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

async fn healthcheck(address: TypeFetcherAddress) -> Result<(), Report<HealthcheckError>> {
    let request_url = format!(
        "http://{}:{}/health",
        address.type_fetcher_host, address.type_fetcher_port
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
    use hash_graph_type_fetcher::fetcher_server::{FetchServer, router};

    use super::*;

    #[tokio::test]
    async fn reachability_gate_passes_for_running_type_fetcher() {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("should bind to an ephemeral port");
        let port = listener
            .local_addr()
            .expect("listener should have a local address")
            .port();
        let app = router(FetchServer {
            buffer_size: 10,
            predefined_types: HashMap::new(),
        });
        tokio::spawn(async move { axum::serve(listener, app).await });

        let address = TypeFetcherAddress {
            type_fetcher_host: "127.0.0.1".to_owned(),
            type_fetcher_port: port,
        };
        wait_for_type_fetcher(&address, Duration::from_secs(5))
            .await
            .expect("running type fetcher should be reachable");
    }

    #[tokio::test]
    async fn reachability_gate_times_out_for_dead_port() {
        // Bind to an ephemeral port and drop the listener so the port is closed.
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("should bind to an ephemeral port");
        let port = listener
            .local_addr()
            .expect("listener should have a local address")
            .port();
        drop(listener);

        let address = TypeFetcherAddress {
            type_fetcher_host: "127.0.0.1".to_owned(),
            type_fetcher_port: port,
        };
        let report = wait_for_type_fetcher(&address, Duration::from_millis(100))
            .await
            .expect_err("dead port should not be reachable");
        assert!(matches!(
            report.current_context(),
            HealthcheckError::Timeout
        ));
    }
}
