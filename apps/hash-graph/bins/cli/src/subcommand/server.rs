use alloc::sync::Arc;
use core::{
    fmt,
    net::{AddrParseError, SocketAddr},
    str::FromStr,
    time::Duration,
};

use authorization::{
    AuthorizationApi, NoAuthorization,
    backend::{SpiceDbOpenApi, ZanzibarBackend},
    zanzibar::ZanzibarClient,
};
use clap::Parser;
use error_stack::{Report, Result, ResultExt};
use graph::{
    ontology::domain_validator::DomainValidator,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, FetchingPool, PostgresStorePool, StorePool,
    },
};
use graph_api::rest::{RestRouterDependencies, rest_api_router};
use regex::Regex;
use reqwest::{Client, Url};
use temporal_client::TemporalClientConfig;
use tokio::{net::TcpListener, time::timeout};
use tokio_postgres::NoTls;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{type_fetcher::TypeFetcherAddress, wait_healthcheck},
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
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub pool_config: DatabasePoolConfig,

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

    /// Waits for the healthcheck to become healthy
    #[clap(long, default_value_t = false, requires = "healthcheck")]
    pub wait: bool,

    /// Timeout for the wait flag in seconds
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,

    /// Starts a server without connecting to the type fetcher
    #[clap(long, default_value_t = false)]
    pub offline: bool,

    /// The host the Spice DB server is listening at.
    #[clap(long, env = "HASH_SPICEDB_HOST")]
    pub spicedb_host: String,

    /// The port the Spice DB server is listening at.
    #[clap(long, env = "HASH_SPICEDB_HTTP_PORT", default_value_t = 8443)]
    pub spicedb_http_port: u16,

    /// The secret key used to authenticate with the Spice DB server.
    #[clap(long, env = "HASH_SPICEDB_GRPC_PRESHARED_KEY")]
    pub spicedb_grpc_preshared_key: Option<String>,

    /// The URL of the Temporal server.
    ///
    /// If not set, the service will not trigger workflows.
    #[clap(long, env = "HASH_TEMPORAL_SERVER_HOST")]
    pub temporal_host: Option<String>,

    /// The port of the Temporal server.
    #[clap(long, env = "HASH_TEMPORAL_SERVER_PORT", default_value_t = 7233)]
    pub temporal_port: u16,
}

pub async fn server(args: ServerArgs) -> Result<(), GraphError> {
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
    _ = pool
        .acquire(NoAuthorization, None)
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

    let router = rest_api_router(RestRouterDependencies {
        store: Arc::new(pool),
        authorization_api: Arc::new(zanzibar_client),
        domain_regex: DomainValidator::new(args.allowed_url_domain),
        temporal_client: if let Some(host) = args.temporal_host {
            Some(
                TemporalClientConfig::new(
                    Url::from_str(&format!("{}:{}", host, args.temporal_port))
                        .change_context(GraphError)?,
                )
                .change_context(GraphError)?
                .await
                .change_context(GraphError)?,
            )
        } else {
            None
        },
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
