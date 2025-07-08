use core::{net::SocketAddr, time::Duration};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use futures::FutureExt as _;
use hash_graph_authorization::{
    AuthorizationApi as _,
    backend::{SpiceDbOpenApi, ZanzibarBackend as _},
    zanzibar::ZanzibarClient,
};
use hash_graph_postgres_store::{
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings},
};
use reqwest::Client;
use tokio::{net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{server::HttpAddress, wait_healthcheck},
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
    pub http_address: HttpAddress,

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

pub async fn test_server(args: TestServerArgs) -> Result<(), Report<GraphError>> {
    SnapshotEntry::install_error_stack_hook();

    if args.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.http_address.clone()),
            args.wait,
            args.timeout.map(Duration::from_secs),
        )
        .await
        .change_context(GraphError);
    }

    let pool = PostgresStorePool::new(
        &args.db_info,
        &args.pool_config,
        NoTls,
        PostgresStoreSettings::default(),
    )
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
            "../../../../libs/@local/graph/authorization/schemas/v1__initial_schema.zed"
        ))
        .await
        .change_context(GraphError)?;

    let mut zanzibar_client = ZanzibarClient::new(spicedb_client);
    zanzibar_client.seed().await.change_context(GraphError)?;

    let router = hash_graph_test_server::routes(pool, zanzibar_client);

    tracing::info!("Listening on {}", args.http_address);
    axum::serve(
        TcpListener::bind((args.http_address.api_host, args.http_address.api_port))
            .await
            .change_context(GraphError)?,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(signal::ctrl_c().map(|result| match result {
        Ok(()) => (),
        Err(error) => {
            tracing::error!("Failed to install Ctrl+C handler: {error}");
            // Continue with shutdown even if signal handling had issues
        }
    }))
    .await
    .expect("failed to start server");

    Ok(())
}

pub async fn healthcheck(address: HttpAddress) -> Result<(), Report<HealthcheckError>> {
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
