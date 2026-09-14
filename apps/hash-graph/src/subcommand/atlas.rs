use core::time::Duration;

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_atlas::cli::{self, PasswordString};
use hash_graph_postgres_store::store::DatabaseConnectionInfo;
use reqwest::Client;
use tokio::time::timeout;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{
        HealthcheckArgs, wait_healthcheck,
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
    /// Fits one generation over the live store and activates it on admission.
    Fit(Box<AtlasFitArgs>),
    /// Probes the liveness endpoint of a serving atlas process.
    Healthcheck(AtlasHealthcheckArgs),
}

/// CLI arguments for `atlas fit`.
#[derive(Debug, Parser)]
pub struct AtlasFitArgs {
    #[clap(flatten)]
    pub root: cli::RootArgs,

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

/// Renders one fit's verdict, the `atlas fit` subcommand's product.
#[expect(
    clippy::print_stdout,
    reason = "the verdict is the subcommand's product"
)]
fn print_verdict(verdict: &cli::FitVerdict) {
    println!("{verdict}");
}

/// Standalone `atlas` subcommand entrypoint.
pub async fn atlas(args: AtlasArgs) -> Result<(), Report<GraphError>> {
    match args.command {
        AtlasCommand::Fit(fit_args) => {
            let mut client = cli::connect(&fit_args.db_info.url())
                .await
                .map_err(Report::new)
                .change_context(GraphError)?;
            let verdict = cli::FitCommand::new(fit_args.root, fit_args.fit)
                .run(&mut client, fit_args.credential)
                .await
                .map_err(Report::new)
                .change_context(GraphError)?;
            print_verdict(&verdict);

            Ok(())
        }
        AtlasCommand::Healthcheck(healthcheck_args) => wait_healthcheck(
            || healthcheck(healthcheck_args.address.clone()),
            &HealthcheckArgs {
                healthcheck: true,
                wait: healthcheck_args.wait,
                timeout: healthcheck_args.timeout,
            },
        )
        .await
        .change_context(GraphError),
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
