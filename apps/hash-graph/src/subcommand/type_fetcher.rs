use core::time::Duration;
use std::collections::HashMap;

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, future};
use hash_graph_type_fetcher::{
    fetcher::{Fetcher as _, FetcherRequest, FetcherResponse},
    fetcher_server::FetchServer,
};
use tarpc::{
    serde_transport::Transport,
    server::{self, Channel as _},
};
use tokio::{signal, time::timeout};
use tokio_util::sync::CancellationToken;
use tracing::Instrument as _;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{HealthcheckArgs, ServerTaskTracker, wait_healthcheck},
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
#[expect(
    clippy::integer_division_remainder_used,
    reason = "False positive on tokio::select!"
)]
pub(crate) async fn run_type_fetcher(
    config: TypeFetcherConfig,
    shutdown: CancellationToken,
) -> Result<(), Report<GraphError>> {
    let mut listener = tarpc::serde_transport::tcp::listen(
        (
            config.address.type_fetcher_host,
            config.address.type_fetcher_port,
        ),
        tarpc::tokio_serde::formats::Json::default,
    )
    .await
    .change_context(GraphError)?;

    tracing::info!("Listening on port {}", listener.local_addr().port());

    listener.config_mut().max_frame_length(usize::MAX);

    let shutdown_ref = &shutdown;

    // Allow listener to accept up to 255 connections at a time.
    //
    // The pipeline must be invoked, we do this with `for_each` because it doesn't contain any
    // useful information we would like to store or report on.
    let server_task = async move {
        listener
            .filter_map(|result| future::ready(result.ok()))
            .map(server::BaseChannel::with_defaults)
            .map(|channel| {
                channel
                    .execute(
                        FetchServer {
                            buffer_size: 10,
                            predefined_types: HashMap::new(),
                        }
                        .serve(),
                    )
                    .for_each(async move |response| {
                        let shutdown = shutdown_ref.clone();
                        tokio::spawn(
                            async move {
                                tokio::select! {
                                    () = response => {}
                                    () = shutdown.cancelled() => {
                                        tracing::debug!("Type fetcher response task cancelled");
                                    }
                                }
                            }
                            .in_current_span(),
                        );
                    })
            })
            .buffer_unordered(255)
            .for_each(|()| async {})
            .await;
    };

    tokio::select! {
        () = server_task => {
            tracing::info!("Type fetcher server task completed");
        }
        () = shutdown.cancelled() => {}
    }

    Ok(())
}

/// Spawns the type fetcher server as a background task with graceful shutdown support.
pub(crate) fn start_type_fetcher(config: TypeFetcherConfig) -> ServerTaskTracker {
    let (handle, shutdown) = ServerTaskTracker::new();
    handle.spawn(async move {
        if let Err(report) = run_type_fetcher(config, shutdown).await {
            tracing::error!(error = ?report, "Type fetcher server failed");
        }
    });
    handle
}

/// Standalone `type-fetcher` subcommand entrypoint.
pub async fn type_fetcher(args: TypeFetcherArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.config.address.clone()),
            &args.healthcheck,
        )
        .await
        .change_context(GraphError);
    }

    let handle = start_type_fetcher(args.config);

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

async fn healthcheck(address: TypeFetcherAddress) -> Result<(), Report<HealthcheckError>> {
    let transport = tarpc::serde_transport::tcp::connect(
        (address.type_fetcher_host, address.type_fetcher_port),
        tarpc::tokio_serde::formats::Json::default,
    );

    let _: Transport<_, FetcherRequest, FetcherResponse, _> =
        timeout(Duration::from_secs(10), transport)
            .await
            .change_context(HealthcheckError::Timeout)?
            .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
