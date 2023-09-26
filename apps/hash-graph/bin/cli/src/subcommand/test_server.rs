use std::{net::SocketAddr, time::Duration};

#[cfg(feature = "authorization")]
use authorization::backend::{SpiceDbOpenApi, ZanzibarBackend};
#[cfg(not(feature = "authorization"))]
use authorization::NoAuthorization;
use clap::Parser;
use error_stack::{Result, ResultExt};
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

    /// The address the REST server is listening at.
    #[clap(flatten)]
    pub api_address: ApiAddress,

    /// Runs the healthcheck for the test server.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,

    /// The host the Spice DB server is listening at.
    #[cfg(feature = "authorization")]
    #[clap(long, env = "HASH_SPICEDB_HOST")]
    pub spicedb_host: String,

    /// The port the Spice DB server is listening at.
    #[cfg(feature = "authorization")]
    #[clap(long, env = "HASH_SPICEDB_HTTP_PORT")]
    pub spicedb_http_port: u16,

    /// The secret key used to authenticate with the Spice DB server.
    #[cfg(feature = "authorization")]
    #[clap(long, env = "HASH_SPICEDB_GRPC_PRESHARED_KEY")]
    pub spicedb_grpc_preshared_key: String,
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

    #[cfg(feature = "authorization")]
    let authorization_api = {
        let mut spicedb_client = SpiceDbOpenApi::new(
            format!("{}:{}", args.spicedb_host, args.spicedb_http_port),
            &args.spicedb_grpc_preshared_key,
        )
        .change_context(GraphError)?;
        spicedb_client
            .import_schema(include_str!(
                "../../../../lib/authorization/schemas/v1__initial_schema.zed"
            ))
            .await
            .change_context(GraphError)?;
        spicedb_client
    };
    #[cfg(not(feature = "authorization"))]
    let authorization_api = NoAuthorization;

    let router = graph::api::rest::test_server::routes(pool, authorization_api);

    tracing::info!("Listening on {}", args.api_address);
    axum::Server::bind(&SocketAddr::try_from(args.api_address).change_context(GraphError)?)
        .serve(router.into_make_service_with_connect_info::<SocketAddr>())
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
