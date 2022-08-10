mod args;

use std::{fmt, net::SocketAddr, sync::Arc};

use error_stack::{Context, Result, ResultExt};
use graph::{
    api::rest::rest_api_router,
    logging::init_logger,
    ontology::{types::DataType, AccountId},
    store::{DataTypeStore, PostgresStorePool, StorePool},
};
use tokio_postgres::NoTls;
use uuid::Uuid;

use crate::args::Args;

#[derive(Debug)]
pub struct GraphError;
impl Context for GraphError {}

impl fmt::Display for GraphError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The Graph query layer encountered an error during execution")
    }
}

/// A place to collect temporary implementations that are useful before stabilisation of the Graph.
///
/// This will include things that are mocks or stubs to make up for missing pieces of infrastructure
/// that haven't been created yet.
async fn stop_gap_setup(pool: &PostgresStorePool<NoTls>) -> Result<(), GraphError> {
    // TODO: Revisit once an authentication and authorization setup is in place
    let root_account_id = AccountId::new(Uuid::nil());

    let mut connection = pool
        .acquire()
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    // TODO: When we improve error management we need to match on it here, this will continue
    //  normally even if the DB is down
    if connection
        .insert_account_id(root_account_id)
        .await
        .change_context(GraphError)
        .is_err()
    {
        tracing::info!(%root_account_id, "tried to create root account, but id already exists");
    } else {
        tracing::info!(%root_account_id, "created root account id");
    }

    // Seed the primitive data types if they don't already exist
    let data_types = [
        DataType::text(),
        DataType::number(),
        DataType::boolean(),
        DataType::empty_list(),
        DataType::object(),
        DataType::null(),
    ];
    for data_type in data_types {
        if connection
            .create_data_type(&data_type, root_account_id)
            .await
            .change_context(GraphError)
            .is_err()
        {
            tracing::info!(%root_account_id, "tried to insert primitive {} data type, but it already exists", data_type.title());
        } else {
            tracing::info!(%root_account_id, "inserted the primitive {} data type", data_type.title());
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), GraphError> {
    let args = Args::parse();
    let _log_guard = init_logger(
        args.log_config.log_format,
        args.log_config.log_folder,
        args.log_config.log_level,
        &args.log_config.log_file_prefix,
    );

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    stop_gap_setup(&pool).await?;

    let rest_router = rest_api_router(Arc::new(pool));
    let addr = SocketAddr::from(([127, 0, 0, 1], 4000));

    tracing::info!("Listening on {addr}");
    axum::Server::bind(&addr)
        .serve(rest_router.into_make_service())
        .await
        .unwrap();

    Ok(())
}
