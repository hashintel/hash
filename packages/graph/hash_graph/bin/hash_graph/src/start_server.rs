use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use error_stack::{IntoReport, Result, ResultExt};
use graph::{
    api::rest::rest_api_router,
    identifier::account::AccountId,
    logging::init_logger,
    ontology::domain_validator::DomainValidator,
    provenance::{OwnedById, UpdatedById},
    store::{
        AccountStore, BaseUriAlreadyExists, DataTypeStore, EntityTypeStore, PostgresStorePool,
        StorePool,
    },
};
use serde_json::json;
use tokio_postgres::NoTls;
use type_system::{
    uri::{BaseUri, VersionedUri},
    AllOf, DataType, EntityType, Links, Object,
};
use uuid::Uuid;

use crate::{args::Args, error::GraphError};

// TODO: Consider making this a refinery migration
/// A place to collect temporary implementations that are useful before stabilization of the Graph.
///
/// This will include things that are mocks or stubs to make up for missing pieces of infrastructure
/// that haven't been created yet.
#[expect(clippy::too_many_lines, reason = "temporary solution")]
async fn stop_gap_setup(pool: &PostgresStorePool<NoTls>) -> Result<(), GraphError> {
    // TODO: how do we make these URIs compliant
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
        HashMap::from([("const".to_owned(), json!([]))]),
    );

    let link_entity_type = EntityType::new(
        VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/entity-type/link/".to_owned(),
            )
            .expect("failed to construct base URI"),
            1,
        ),
        "Link".to_owned(),
        Some("A link".to_owned()),
        Object::new(HashMap::default(), Vec::default()).expect("invalid property object"),
        AllOf::new([]),
        Links::new(HashMap::default(), Vec::new()).expect("invalid links"),
        HashMap::default(),
        Vec::default(),
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
    for data_type in [text, number, boolean, empty_list, object, null] {
        let title = data_type.title().to_owned();
        if let Err(error) = connection
            .create_data_type(
                data_type,
                OwnedById::new(root_account_id),
                UpdatedById::new(root_account_id),
            )
            .await
            .change_context(GraphError)
        {
            if error.contains::<BaseUriAlreadyExists>() {
                tracing::info!(%root_account_id, "tried to insert primitive {} data type, but it already exists", title);
            } else {
                return Err(error.change_context(GraphError));
            }
        } else {
            tracing::info!(%root_account_id, "inserted the primitive {} data type", title);
        }
    }

    // Seed the entity types if they don't already exist
    let title = link_entity_type.title().to_owned();
    if let Err(error) = connection
        .create_entity_type(
            link_entity_type,
            OwnedById::new(root_account_id),
            UpdatedById::new(root_account_id),
        )
        .await
    {
        if error.contains::<BaseUriAlreadyExists>() {
            tracing::info!(%root_account_id, "tried to insert {} entity type, but it already exists", title);
        } else {
            return Err(error.change_context(GraphError));
        }
    } else {
        tracing::info!(%root_account_id, "inserted the {} entity type", title);
    }

    Ok(())
}

pub async fn start_server(args: Args) -> Result<(), GraphError> {
    let log_args = args.log_config.clone();
    let _log_guard = init_logger(
        log_args.log_format,
        log_args.log_folder,
        log_args.log_level,
        &log_args.log_file_prefix,
        args.otlp_endpoint.as_deref(),
    );

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    stop_gap_setup(&pool).await?;

    let rest_router = rest_api_router(
        Arc::new(pool),
        DomainValidator::new(args.allowed_url_domain),
    );
    let api_address = format!("{}:{}", args.api_host, args.api_port);
    let addr: SocketAddr = api_address
        .parse()
        .into_report()
        .change_context(GraphError)
        .attach_printable_lazy(|| api_address.clone())?;

    tracing::info!("Listening on {api_address}");
    axum::Server::bind(&addr)
        .serve(rest_router.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("failed to start server");

    Ok(())
}
