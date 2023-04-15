use std::time::Duration;

use clap::Parser;
use error_stack::{IntoReport, Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, PostgresStorePool},
};
use reqwest::Client;
use tokio::time::timeout;
use tokio_postgres::NoTls;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::server::ApiAddress,
};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct TestServerArgs {
    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    /// The address the REST client is listening at.
    #[clap(flatten)]
    pub api_address: ApiAddress,

    /// Runs the healthcheck for the test server.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,
}

pub async fn test_server(args: TestServerArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);
    SnapshotEntry::install_error_stack_hook();

    if args.healthcheck {
        return healthcheck(args.api_address)
            .await
            .change_context(GraphError);
    }

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    let router = graph::api::rest::test_server::routes(pool);

    tracing::info!("Listening on {}", args.api_address);
    axum::Server::bind(&args.api_address.try_into().change_context(GraphError)?)
        .serve(router.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .await
        .expect("failed to start server");

    Ok(())
}

pub async fn healthcheck(address: ApiAddress) -> Result<(), HealthcheckError> {
    let request_url = format!("http://{address}/snapshot");

    timeout(
        Duration::from_secs(10),
        Client::new().head(&request_url).send(),
    )
    .await
    .into_report()
    .change_context(HealthcheckError::Timeout)?
    .into_report()
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
