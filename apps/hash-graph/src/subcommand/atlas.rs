use core::{net::SocketAddr, time::Duration};

use axum::{Router, http::StatusCode, routing::get};
use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_api::rest::http_tracing_layer::HttpTracingLayer;
use reqwest::Client;
use tokio::{net::TcpListener, signal, time::timeout};
use tokio_util::sync::CancellationToken;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{HealthcheckArgs, ServerLifecycle, wait_healthcheck},
};

/// Address configuration for the atlas server.
#[derive(Debug, Clone, Parser)]
pub struct AtlasAddress {
    /// The host the atlas HTTP server is listening at.
    #[clap(long, default_value = "127.0.0.1", env = "HASH_ATLAS_HOST")]
    pub atlas_host: String,

    /// The port the atlas HTTP server is listening at.
    #[clap(long, default_value_t = 4003, env = "HASH_ATLAS_PORT")]
    pub atlas_port: u16,
}

/// CLI arguments for the `atlas` subcommand.
#[derive(Debug, Parser)]
pub struct AtlasArgs {
    #[clap(flatten)]
    pub address: AtlasAddress,

    #[clap(flatten)]
    pub healthcheck: HealthcheckArgs,
}

/// Placeholder service surface: `/status` reports liveness and nothing else.
///
/// The SALT Atlas implementation replaces this router while keeping the
/// subcommand, address, and healthcheck wiring.
fn router() -> Router {
    Router::new()
        .route("/status", get(async || StatusCode::OK))
        .layer(HttpTracingLayer)
}

/// Runs the atlas server, shutting down when `shutdown` is cancelled.
pub(crate) async fn run_atlas(
    address: AtlasAddress,
    shutdown: CancellationToken,
) -> Result<(), Report<GraphError>> {
    let listener = TcpListener::bind((&*address.atlas_host, address.atlas_port))
        .await
        .change_context(GraphError)?;

    tracing::info!(
        "Listening on port {}",
        listener.local_addr().change_context(GraphError)?.port()
    );

    axum::serve(
        listener,
        router().into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.cancelled_owned())
    .await
    .change_context(GraphError)?;

    Ok(())
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
pub async fn atlas(args: AtlasArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck.healthcheck {
        return wait_healthcheck(|| healthcheck(args.address.clone()), &args.healthcheck)
            .await
            .change_context(GraphError);
    }

    let lifecycle = ServerLifecycle::new();
    let shutdown = lifecycle.shutdown.clone();
    lifecycle.spawn(
        "Atlas",
        async move { run_atlas(args.address, shutdown).await },
    );

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
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("should bind to an ephemeral port");
        let port = listener
            .local_addr()
            .expect("listener should have a local address")
            .port();
        tokio::spawn(async move { axum::serve(listener, router()).await });

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
