use std::{
    fmt, fs,
    net::{AddrParseError, Ipv4Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use authorization::{
    backend::{SpiceDbOpenApi, ZanzibarBackend},
    zanzibar::ZanzibarClient,
    AuthorizationApi,
};
use clap::Parser;
use error_stack::{Report, Result, ResultExt};
use futures::future::select;
use graph::{
    logging::{init_logger, LoggingArgs},
    ontology::domain_validator::DomainValidator,
    store::{DatabaseConnectionInfo, FetchingPool, PostgresStorePool, StorePool},
};
use graph_api::{
    rest::{rest_api_router, OpenApiDocumentation, RestRouterDependencies},
    rpc::State,
};
use hash_graph_rpc::{harpc::server::ListenOn, TransportConfig};
use regex::Regex;
use reqwest::Client;
use tokio::{net::TcpListener, time::timeout};
use tokio_postgres::NoTls;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::type_fetcher::TypeFetcherAddress,
};

#[derive(Debug, Clone, Parser)]
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

    /// The host the RPC tcp server is listening at.
    #[clap(long, default_value_t = 4001, env = "HASH_GRAPH_RPC_TCP_PORT")]
    pub rpc_tcp_port: u16,

    /// The host the RPC websocket server is listening at.
    #[clap(long, default_value_t = 4002, env = "HASH_GRAPH_RPC_WEBSOCKET_PORT")]
    pub rpc_ws_port: u16,

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
    #[clap(long, default_value_t = false)]
    pub offline: bool,

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

#[allow(clippy::too_many_lines)]
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

    let pool = Arc::new(pool);
    let zanzibar_client = Arc::new(zanzibar_client);

    let router = rest_api_router(RestRouterDependencies {
        store: Arc::clone(&pool),
        authorization_api: Arc::clone(&zanzibar_client),
        domain_regex: DomainValidator::new(args.allowed_url_domain),
    });

    let api_address = args.api_address.clone();
    let listener = TcpListener::bind((args.api_address.api_host, args.api_address.api_port))
        .await
        .change_context(GraphError)?;

    let handle1 = tokio::spawn(async move {
        tracing::info!("Listening on {api_address}");
        axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .expect("failed to start server");
    });

    let server = graph_api::rpc::server(State::new(pool, zanzibar_client));

    let handle2 = tokio::spawn(async move {
        tracing::info!("Listening on {}/{}", args.rpc_tcp_port, args.rpc_ws_port);

        server
            .serve(
                ListenOn {
                    ip: Ipv4Addr::LOCALHOST,
                    tcp: args.rpc_tcp_port,
                    ws: args.rpc_ws_port,
                },
                TransportConfig::default(),
            )
            .expect("failed to start server")
            .await;
    });

    select(handle1, handle2).await;
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
