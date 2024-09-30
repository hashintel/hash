use core::time::Duration;

use clap::Parser;
use error_stack::{Result, ResultExt as _};
use futures::{StreamExt as _, future};
use tarpc::{
    serde_transport::Transport,
    server::{self, Channel as _},
};
use tokio::time::timeout;
use type_fetcher::{
    fetcher::{Fetcher as _, FetcherRequest, FetcherResponse},
    fetcher_server::FetchServer,
};

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

    /// Waits for the healthcheck to become healthy
    #[clap(long, default_value_t = false, requires = "healthcheck")]
    pub wait: bool,

    /// Timeout for the wait flag in seconds
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,
}

pub async fn type_fetcher(args: TypeFetcherArgs) -> Result<(), GraphError> {
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
    // Allow listeneer to accept up to 255 connections at a time.
    //
    // The pipeline must be invoked, we do this with `for_each` because it doesn't contain any
    // useful information we would like to store or report on.
    listener
        .filter_map(|result| future::ready(result.ok()))
        .map(server::BaseChannel::with_defaults)
        .map(|channel| {
            let server = FetchServer { buffer_size: 10 };
            channel.execute(server.serve())
        })
        .buffer_unordered(255)
        .for_each(|()| async {})
        .await;

    Ok(())
}

async fn healthcheck(address: TypeFetcherAddress) -> Result<(), HealthcheckError> {
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
