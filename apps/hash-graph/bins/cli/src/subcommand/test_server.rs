use core::{net::SocketAddr, time::Duration};

use authorization::{
    AuthorizationApi as _,
    backend::{SpiceDbOpenApi, ZanzibarBackend as _},
    zanzibar::ZanzibarClient,
};
use clap::Parser;
use error_stack::{Result, ResultExt as _};
use graph::{
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool},
};
use reqwest::Client;
use tokio::{net::TcpListener, time::timeout};
use tokio_postgres::NoTls;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{server::ApiAddress, wait_healthcheck},
};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct TestServerArgs {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub pool_config: DatabasePoolConfig,

    /// The address the REST server is listening at.
    #[clap(flatten)]
    pub api_address: ApiAddress,

    /// Runs the healthcheck for the test server.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,

    /// Waits for the healthcheck to become healthy
    #[clap(long, default_value_t = false, requires = "healthcheck")]
    pub wait: bool,

    /// Timeout for the wait flag in seconds
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,

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
    SnapshotEntry::install_error_stack_hook();

    if args.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.api_address.clone()),
            args.wait,
            args.timeout.map(Duration::from_secs),
        )
        .await
        .change_context(GraphError);
    }

    let pool = PostgresStorePool::new(&args.db_info, &args.pool_config, NoTls)
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

    let router = test_server::routes(pool, zanzibar_client);

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
