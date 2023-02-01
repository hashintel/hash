use std::{
    fmt,
    net::{IpAddr, Ipv4Addr},
};

use clap::Parser;
use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{future, StreamExt};
use graph::logging::{init_logger, LoggingArgs};
use tarpc::server::{self, Channel};
use tokio_serde::formats::MessagePack;
use type_fetcher::{fetcher::Fetcher, fetcher_server::FetchServer};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    /// The port the type fetcher RPC server is listening at.
    #[clap(long, default_value_t = 4444, env = "HASH_GRAPH_TYPE_FETCHER_PORT")]
    pub type_fetcher_port: u16,

    #[clap(flatten)]
    pub log_config: LoggingArgs,
}

#[derive(Debug)]
pub struct FetcherServerError;
impl Context for FetcherServerError {}

impl fmt::Display for FetcherServerError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the type fetcher server encountered an error during execution")
    }
}

#[tokio::main]
async fn main() -> Result<(), FetcherServerError> {
    let args = Args::parse();

    let _log_guard = init_logger(&args.log_config);

    let server_addr = (IpAddr::V4(Ipv4Addr::UNSPECIFIED), args.type_fetcher_port);

    let mut listener = tarpc::serde_transport::tcp::listen(&server_addr, MessagePack::default)
        .await
        .into_report()
        .change_context(FetcherServerError)?;

    tracing::info!("Listening on port {}", listener.local_addr().port());

    listener.config_mut().max_frame_length(usize::MAX);
    listener
        // Ignore accept errors.
        .filter_map(|r| future::ready(r.ok()))
        .map(server::BaseChannel::with_defaults)
        .map(|channel| {
            let server = FetchServer;
            channel.execute(server.serve())
        })
        // Max 255 channels.
        .buffer_unordered(255)
        .for_each(|_| async {})
        .await;

    Ok(())
}
