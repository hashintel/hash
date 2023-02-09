use clap::Parser;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{future, StreamExt};
use graph::logging::{init_logger, LoggingArgs};
use tarpc::server::{self, Channel};
use tokio_serde::formats::MessagePack;
use type_fetcher::{fetcher::Fetcher, fetcher_server::FetchServer};

use crate::error::GraphError;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct TypeFetcherArgs {
    /// The host the type fetcher RPC server is listening at.
    #[clap(
        long,
        default_value = "127.0.0.1",
        env = "HASH_GRAPH_TYPE_FETCHER_HOST"
    )]
    pub type_fetcher_host: String,

    /// The port the type fetcher RPC server is listening at.
    #[clap(long, default_value_t = 4444, env = "HASH_GRAPH_TYPE_FETCHER_PORT")]
    pub type_fetcher_port: u16,

    #[clap(flatten)]
    pub log_config: LoggingArgs,
}

pub async fn type_fetcher(args: TypeFetcherArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);

    let mut listener = tarpc::serde_transport::tcp::listen(
        (args.type_fetcher_host, args.type_fetcher_port),
        MessagePack::default,
    )
    .await
    .into_report()
    .change_context(GraphError)?;

    tracing::info!("Listening on port {}", listener.local_addr().port());

    listener.config_mut().max_frame_length(usize::MAX);
    // Allow listeneer to accept up to 255 connections at a time.
    //
    // The pipeline must be invoked, we do this with `for_each` because it doesn't contain any
    // useful information we would like to store or report on.
    listener
        .filter_map(|r| future::ready(r.ok()))
        .map(server::BaseChannel::with_defaults)
        .map(|channel| {
            let server = FetchServer;
            channel.execute(server.serve())
        })
        .buffer_unordered(255)
        .for_each(|_| async {})
        .await;

    Ok(())
}
