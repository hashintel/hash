use std::{fmt, net::SocketAddr};

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

    let type_fetcher_address = format!("{}:{}", args.type_fetcher_host, args.type_fetcher_port);

    let type_fetcher_address: SocketAddr = type_fetcher_address
        .parse()
        .into_report()
        .change_context(FetcherServerError)
        .attach_printable_lazy(|| type_fetcher_address.clone())?;

    let mut listener =
        tarpc::serde_transport::tcp::listen(&type_fetcher_address, MessagePack::default)
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
        // The above pipeline must be invoked, we do this with `for_each` because it doesn't contain 
        // any useful information we would like to store or report on.
        .for_each(|_| async {})
        .await;

    Ok(())
}
