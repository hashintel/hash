use clap::Parser;
use error_stack::{Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    snapshot::SnapshotEntry,
    store::{DatabaseConnectionInfo, PostgresStorePool},
};
use tokio_postgres::NoTls;

use crate::error::GraphError;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct TestServerArgs {
    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    /// The address the REST client is listening at.
    #[clap(flatten)]
    pub api_address: crate::subcommand::server::ApiAddress,
}

pub async fn test_server(args: TestServerArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);
    SnapshotEntry::install_error_stack_hook();

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
