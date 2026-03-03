use core::time::Duration;
use std::collections::HashMap;

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use futures::{FutureExt as _, StreamExt as _, future};
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
    subcommand::wait_healthcheck,
};

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

#[derive(Debug, Parser)]
pub struct TypeFetcherArgs {
    #[clap(flatten)]
    pub address: TypeFetcherAddress,

    /// Runs the healthcheck for the type fetcher.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,

    /// Waits for the healthcheck to become healthy.
    #[clap(long, default_value_t = false, requires = "healthcheck")]
    pub wait: bool,

    /// Timeout for the wait flag in seconds.
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,
}

#[expect(
    clippy::integer_division_remainder_used,
    reason = "False positive on tokio::select!"
)]
pub async fn type_fetcher(args: TypeFetcherArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.address.clone()),
            args.wait,
            args.timeout.map(Duration::from_secs),
        )
        .await
        .change_context(GraphError);
    }

    let mut listener = tarpc::serde_transport::tcp::listen(
        (
            args.address.type_fetcher_host,
            args.address.type_fetcher_port,
        ),
        tarpc::tokio_serde::formats::Json::default,
    )
    .await
    .change_context(GraphError)?;

    tracing::info!("Listening on port {}", listener.local_addr().port());

    listener.config_mut().max_frame_length(usize::MAX);

    let cancellation_token = CancellationToken::new();
    let cancellation_token_ref = &cancellation_token;

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
                        let cancellation_token = cancellation_token_ref.clone();
                        tokio::spawn(
                            async move {
                                tokio::select! {
                                    () = response => {}
                                    () = cancellation_token.cancelled() => {
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
        () = signal::ctrl_c().map(|result| match result {
            Ok(()) => (),
            Err(error) => {
                tracing::error!("Failed to install Ctrl+C handler: {error}");
                // Continue with shutdown even if signal handling had issues
            }
        }) => {
            tracing::info!("Received SIGINT, shutting down type fetcher gracefully");
            cancellation_token.cancel();
        }
    }

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
