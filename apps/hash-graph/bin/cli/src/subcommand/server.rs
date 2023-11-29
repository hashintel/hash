use std::{
    collections::HashMap,
    fmt, fs,
    net::{AddrParseError, SocketAddr},
    sync::Arc,
    time::Duration,
};

use authorization::NoAuthorization;
#[cfg(feature = "authorization")]
use authorization::{
    backend::{SpiceDbOpenApi, ZanzibarBackend},
    zanzibar::ZanzibarClient,
};
use clap::Parser;
use error_stack::{Report, Result, ResultExt};
use graph::{
    api::rest::{rest_api_router, OpenApiDocumentation, RestRouterDependencies},
    logging::{init_logger, LoggingArgs},
    ontology::domain_validator::DomainValidator,
    store::{
        error::VersionedUrlAlreadyExists, AccountStore, DataTypeStore, DatabaseConnectionInfo,
        EntityTypeStore, FetchingPool, PostgresStorePool, StorePool,
    },
};
use graph_types::{
    account::AccountId,
    ontology::{
        PartialCustomOntologyMetadata, PartialEntityTypeMetadata, PartialOntologyElementMetadata,
    },
};
use regex::Regex;
use reqwest::Client;
use serde_json::json;
use time::OffsetDateTime;
use tokio::{net::TcpListener, time::timeout};
use tokio_postgres::NoTls;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    AllOf, DataType, EntityType, Links, Object,
};
use uuid::Uuid;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::type_fetcher::TypeFetcherAddress,
};

#[derive(Debug, Parser)]
pub struct ApiAddress {
    /// The host the REST client is listening at.
    #[clap(long, default_value = "127.0.0.1", env = "HASH_GRAPH_API_HOST")]
    pub api_host: String,

    /// The port the REST client is listening at.
    #[clap(long, default_value_t = 4000, env = "HASH_GRAPH_API_PORT")]
    pub api_port: u16,
}

impl fmt::Display for ApiAddress {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.api_host, self.api_port)
    }
}

impl TryFrom<ApiAddress> for SocketAddr {
    type Error = Report<AddrParseError>;

    fn try_from(address: ApiAddress) -> Result<Self, AddrParseError> {
        address
            .to_string()
            .parse::<Self>()
            .attach_printable(address)
    }
}

#[derive(Debug, Parser)]
pub struct ServerArgs {
    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    /// The address the REST client is listening at.
    #[clap(flatten)]
    pub api_address: ApiAddress,

    /// The address for the type fetcher RPC server is listening at.
    #[clap(flatten)]
    pub type_fetcher_address: TypeFetcherAddress,

    /// A regex which *new* Type System URLs are checked against. Trying to create new Types with
    /// a domain that doesn't satisfy the pattern will error.
    ///
    /// The regex must:
    ///
    /// - be in the standard format accepted by Rust's `regex` crate.
    ///
    /// - contain a capture group named "shortname" to identify a user's shortname, e.g.
    ///   `(?P<shortname>[\w-]+)`
    ///
    /// - contain a capture group named "kind" to identify the slug of the kind of ontology type
    ///   being hosted (data-type, property-type, entity-type, link-type), e.g.
    ///   `(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type))`
    #[clap(
        long,
        default_value_t = Regex::new(r"http://localhost:3000/@(?P<shortname>[\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type))/[\w\-_%]+/").unwrap(),
        env = "HASH_GRAPH_ALLOWED_URL_DOMAIN_PATTERN",
    )]
    pub allowed_url_domain: Regex,

    /// Runs the healthcheck for the REST Server.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,

    /// Starts a server that only serves the OpenAPI spec.
    #[clap(long, default_value_t = false)]
    pub write_openapi_specs: bool,

    /// Starts a server without connecting to the type fetcher
    #[clap(long, default_value_t = false, conflicts_with_all = ["type_fetcher_host", "type_fetcher_port"])]
    pub offline: bool,

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
    pub spicedb_grpc_preshared_key: Option<String>,
}

// TODO: Consider making this a refinery migration
/// A place to collect temporary implementations that are useful before stabilization of the Graph.
///
/// This will include things that are mocks or stubs to make up for missing pieces of infrastructure
/// that haven't been created yet.
#[expect(clippy::too_many_lines, reason = "temporary solution")]
async fn stop_gap_setup(pool: &PostgresStorePool<NoTls>) -> Result<(), GraphError> {
    // TODO: how do we make these URLs compliant
    let text = DataType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Text".to_owned(),
        Some("An ordered sequence of characters".to_owned()),
        "string".to_owned(),
        HashMap::default(),
    );

    let number = DataType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Number".to_owned(),
        Some("An arithmetical value (in the Real number system)".to_owned()),
        "number".to_owned(),
        HashMap::default(),
    );

    let boolean = DataType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Boolean".to_owned(),
        Some("A True or False value".to_owned()),
        "boolean".to_owned(),
        HashMap::default(),
    );

    let null = DataType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/null/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Null".to_owned(),
        Some("A placeholder value representing 'nothing'".to_owned()),
        "null".to_owned(),
        HashMap::default(),
    );

    let object = DataType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Object".to_owned(),
        Some("A plain JSON object with no pre-defined structure".to_owned()),
        "object".to_owned(),
        HashMap::default(),
    );

    let empty_list = DataType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/empty-list/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Empty List".to_owned(),
        Some("An Empty List".to_owned()),
        "array".to_owned(),
        HashMap::from([("const".to_owned(), json!([]))]),
    );

    // TODO: Revisit once an authentication and authorization setup is in place
    let root_account_id = AccountId::new(Uuid::nil());

    let mut connection = pool
        .acquire()
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!(?err, "Failed to acquire database connection");
            err
        })?;

    // TODO: When we improve error management we need to match on it here, this will continue
    //  normally even if the DB is down
    if connection
        .insert_account_id(root_account_id, &mut NoAuthorization, root_account_id)
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

        let data_type_metadata = PartialOntologyElementMetadata {
            record_id: data_type.id().clone().into(),
            custom: PartialCustomOntologyMetadata::External {
                fetched_at: OffsetDateTime::now_utc(),
            },
        };

        if let Err(error) = connection
            .create_data_type(
                root_account_id,
                &mut NoAuthorization,
                data_type,
                data_type_metadata,
            )
            .await
            .change_context(GraphError)
        {
            if error.contains::<VersionedUrlAlreadyExists>() {
                tracing::info!(%root_account_id, "tried to insert primitive {title} data type, but it already exists");
            } else {
                return Err(error.change_context(GraphError));
            }
        } else {
            tracing::info!(%root_account_id, "inserted the primitive {title} data type");
        }
    }
    let link_entity_type = EntityType::new(
        VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/entity-type/link/".to_owned(),
            )
            .expect("failed to construct base URL"),
            version: 1,
        },
        "Link".to_owned(),
        Some("A link".to_owned()),
        Object::new(HashMap::default(), Vec::default()).expect("invalid property object"),
        AllOf::new([]),
        Links::new(HashMap::default()),
        Vec::default(),
    );

    let link_entity_type_metadata = PartialEntityTypeMetadata {
        record_id: link_entity_type.id().clone().into(),
        label_property: None,
        icon: None,
        custom: PartialCustomOntologyMetadata::External {
            fetched_at: OffsetDateTime::now_utc(),
        },
    };

    let title = link_entity_type.title().to_owned();

    if let Err(error) = connection
        .create_entity_type(
            root_account_id,
            &mut NoAuthorization,
            link_entity_type,
            link_entity_type_metadata,
        )
        .await
    {
        if error.contains::<VersionedUrlAlreadyExists>() {
            tracing::info!(%root_account_id, "tried to insert {title} entity type, but it already exists");
        } else {
            return Err(error.change_context(GraphError));
        }
    } else {
        tracing::info!(%root_account_id, "inserted the {title} entity type");
    }

    Ok(())
}

pub async fn server(args: ServerArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);

    if args.healthcheck {
        return healthcheck(args.api_address)
            .await
            .change_context(GraphError);
    }

    if args.write_openapi_specs {
        let openapi_path = std::path::Path::new("openapi");
        let openapi_models_path = openapi_path.join("models");
        let openapi_json_path = openapi_path.join("openapi.json");
        for path in [openapi_models_path, openapi_json_path] {
            if !path.exists() {
                continue;
            }
            if path.is_file() {
                fs::remove_file(&path)
                    .change_context(GraphError)
                    .attach_printable("could not remove old OpenAPI file")
                    .attach_printable_lazy(|| path.display().to_string())?;
            } else {
                fs::remove_dir_all(&path)
                    .change_context(GraphError)
                    .attach_printable("could not remove old OpenAPI file")
                    .attach_printable_lazy(|| path.display().to_string())?;
            }
        }
        OpenApiDocumentation::write_openapi(openapi_path)
            .change_context(GraphError)
            .attach_printable("could not write OpenAPI spec")?;
        return Ok(());
    }

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;
    _ = pool
        .acquire()
        .await
        .change_context(GraphError)
        .attach_printable("Connection to database failed")?;

    let pool = if args.offline {
        stop_gap_setup(&pool).await?;

        FetchingPool::new_offline(pool)
    } else {
        FetchingPool::new(
            pool,
            (
                args.type_fetcher_address.type_fetcher_host,
                args.type_fetcher_address.type_fetcher_port,
            ),
            DomainValidator::new(args.allowed_url_domain.clone()),
        )
    };

    #[cfg(feature = "authorization")]
    let authorization_api = {
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
        ZanzibarClient::new(spicedb_client)
    };
    #[cfg(not(feature = "authorization"))]
    let authorization_api = NoAuthorization;

    let router = rest_api_router(RestRouterDependencies {
        store: Arc::new(pool),
        authorization_api: Arc::new(authorization_api),
        domain_regex: DomainValidator::new(args.allowed_url_domain),
    });

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
    let request_url = format!("http://{address}/api-doc/openapi.json");

    timeout(
        Duration::from_secs(10),
        Client::new().head(&request_url).send(),
    )
    .await
    .change_context(HealthcheckError::Timeout)?
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
