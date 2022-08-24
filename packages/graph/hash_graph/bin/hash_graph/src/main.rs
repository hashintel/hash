mod args;

use std::{collections::HashMap, fmt, net::SocketAddr, sync::Arc};

use error_stack::{Context, IntoReport, Result, ResultExt};
use graph::{
    api::rest::rest_api_router,
    logging::init_logger,
    ontology::AccountId,
    store::{AccountStore, DataTypeStore, PostgresStorePool, StorePool},
};
use serde_json::json;
use tokio_postgres::NoTls;
use type_system::{
    uri::{BaseUri, VersionedUri},
    DataType,
};
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
    let text = DataType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Text".to_owned(),
        Some("An ordered sequence of characters".to_owned()),
        "string".to_owned(),
        HashMap::default(),
    );

    let number = DataType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Number".to_owned(),
        Some("An arithmetical value (in the Real number system)".to_owned()),
        "number".to_owned(),
        HashMap::default(),
    );

    let boolean = DataType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Boolean".to_owned(),
        Some("A True or False value".to_owned()),
        "boolean".to_owned(),
        HashMap::default(),
    );

    let null = DataType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/null/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Null".to_owned(),
        Some("A placeholder value representing 'nothing'".to_owned()),
        "null".to_owned(),
        HashMap::default(),
    );

    let object = DataType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Object".to_owned(),
        Some("A plain JSON object with no pre-defined structure".to_owned()),
        "object".to_owned(),
        HashMap::default(),
    );

    let empty_list = DataType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Empty List".to_owned(),
        Some("An Empty List".to_owned()),
        "array".to_owned(),
        [("const".to_owned(), json!([]))].into_iter().collect(),
    );

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
    let data_types = [text, number, boolean, empty_list, object, null];
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
    let api_address = format!("{}:{}", args.api_host, args.api_port);
    let addr: SocketAddr = api_address
        .parse()
        .into_report()
        .change_context(GraphError)
        .attach_printable_lazy(|| api_address.clone())?;

    tracing::info!("Listening on {api_address}");
    axum::Server::bind(&addr)
        .serve(rest_router.into_make_service())
        .await
        .unwrap();

    Ok(())
}
