use std::{net::SocketAddr, time::Duration};

use authorization::{
    backend::{SpiceDbOpenApi, ZanzibarBackend},
    zanzibar::ZanzibarClient,
    AuthorizationApi,
};
use clap::Parser;
use error_stack::{Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, PostgresStorePool},
};
use reqwest::Client;
use tokio::{net::TcpListener, time::timeout};
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

    /// The address the REST server is listening at.
    #[clap(flatten)]
    pub api_address: ApiAddress,

    /// Runs the healthcheck for the test server.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,

    /// The host the Spice DB server is listening at.
    #[clap(long, env = "HASH_SPICEDB_HOST")]
    pub spicedb_host: String,

    /// The port the Spice DB server is listening at.
    #[clap(long, env = "HASH_SPICEDB_HTTP_PORT")]
    pub spicedb_http_port: u16,

    /// The secret key used to authenticate with the Spice DB server.
    #[clap(long, env = "HASH_SPICEDB_GRPC_PRESHARED_KEY")]
    pub spicedb_grpc_preshared_key: Option<String>,
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

    let mut spicedb_client = SpiceDbOpenApi::new(
        format!("{}:{}", args.spicedb_host, args.spicedb_http_port),
        args.spicedb_grpc_preshared_key.as_deref(),
    )
    .change_context(GraphError)?;
    spicedb_client
        .import_schema(include_str!(
            "../../../../../../libs/@local/hash-authorization/schemas/v1__initial_schema.zed"
        ))
        .await
        .change_context(GraphError)?;

    let mut zanzibar_client = ZanzibarClient::new(spicedb_client);
    zanzibar_client.seed().await.change_context(GraphError)?;
    let authorization_api = zanzibar_client.into_backend();

    let router = graph::api::rest::test_server::routes(pool, authorization_api);

    tracing::info!("Listening on {}", args.api_address);
    axum::serve(
        TcpListener::bind((args.api_address.api_host, args.api_address.api_port))
            .await
            .change_context(GraphError)?,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
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
    .change_context(HealthcheckError::Timeout)?
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
