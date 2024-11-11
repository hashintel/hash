use alloc::sync::Arc;
use core::{
    fmt,
    net::{AddrParseError, SocketAddr},
    str::FromStr as _,
    time::Duration,
};

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use harpc_codec::json::JsonCodec;
use harpc_server::Server;
use hash_graph_api::{
    rest::{RestRouterDependencies, rest_api_router},
    rpc::Dependencies,
};
use hash_graph_authorization::{
    AuthorizationApi as _, AuthorizationApiPool, NoAuthorization,
    backend::{SpiceDbOpenApi, ZanzibarBackend as _},
    zanzibar::ZanzibarClient,
};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool,
};
use hash_graph_store::pool::StorePool;
use hash_graph_type_fetcher::FetchingPool;
use hash_temporal_client::TemporalClientConfig;
use multiaddr::{Multiaddr, Protocol};
use regex::Regex;
use reqwest::{Client, Url};
use tokio::{net::TcpListener, time::timeout};
use tokio_postgres::NoTls;
use type_system::schema::DomainValidator;

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

    fn try_from(address: ApiAddress) -> Result<Self, Report<AddrParseError>> {
        address
            .to_string()
            .parse::<Self>()
            .attach_printable(address)
    }
}

#[derive(Debug, Clone, Parser)]
pub struct RpcAddress {
    /// The host the RPC client is listening at.
    #[clap(long, default_value = "127.0.0.1", env = "HASH_GRAPH_RPC_HOST")]
    pub rpc_host: String,

    /// The port the RPC client is listening at.
    #[clap(long, default_value_t = 4002, env = "HASH_GRAPH_RPC_PORT")]
    pub rpc_port: u16,
}

impl fmt::Display for RpcAddress {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.rpc_host, self.rpc_port)
    }
}

impl TryFrom<RpcAddress> for SocketAddr {
    type Error = Report<AddrParseError>;

    fn try_from(address: RpcAddress) -> Result<Self, Report<AddrParseError>> {
        address
            .to_string()
            .parse::<Self>()
            .attach_printable(address)
    }
}

#[expect(
    clippy::struct_excessive_bools,
    reason = "CLI arguments are boolean flags."
)]
#[derive(Debug, Parser)]
pub struct ServerArgs {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub pool_config: DatabasePoolConfig,

    /// The address the REST server is listening at.
    #[clap(flatten)]
    pub api_address: ApiAddress,

    /// Enable the experimental RPC server.
    #[clap(long, default_value_t = false, env = "HASH_GRAPH_RPC_ENABLED")]
    pub rpc_enabled: bool,

    /// The address the RPC server is listening at.
    #[clap(flatten)]
    pub rpc_address: RpcAddress,

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

fn server_rpc<S, A>(
    address: RpcAddress,
    dependencies: Dependencies<S, A, ()>,
) -> Result<(), Report<GraphError>>
where
    S: StorePool + Send + Sync + 'static,
    A: AuthorizationApiPool + Send + Sync + 'static,
{
    let server = Server::new(harpc_server::ServerConfig::default()).change_context(GraphError)?;

    let (router, task) = hash_graph_api::rpc::rpc_router(
        Dependencies {
            store: dependencies.store,
            authorization_api: dependencies.authorization_api,
            temporal_client: dependencies.temporal_client,
            codec: JsonCodec,
        },
        server.events(),
    );

    tokio::spawn(task.into_future());

    let socket_address: SocketAddr = SocketAddr::try_from(address).change_context(GraphError)?;
    let mut address = Multiaddr::empty();
    match socket_address {
        SocketAddr::V4(v4) => {
            address.push(Protocol::Ip4(*v4.ip()));
            address.push(Protocol::Tcp(v4.port()));
        }
        SocketAddr::V6(v6) => {
            address.push(Protocol::Ip6(*v6.ip()));
            address.push(Protocol::Tcp(v6.port()));
        }
    }

    #[expect(clippy::significant_drop_tightening, reason = "false positive")]
    tokio::spawn(async move {
        let stream = server
            .listen(address)
            .await
            .expect("server should be able to listen on address");

        harpc_server::serve::serve(stream, router).await;
    });

    Ok(())
}

pub async fn server(args: ServerArgs) -> Result<(), Report<GraphError>> {
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
            "../../../../libs/@local/graph/authorization/schemas/v1__initial_schema.zed"
        ))
        .await
        .change_context(GraphError)?;

    let mut zanzibar_client = ZanzibarClient::new(spicedb_client);
    zanzibar_client.seed().await.change_context(GraphError)?;

    let temporal_client_fn = async |host: Option<String>, port: u16| {
        if let Some(host) = host {
            TemporalClientConfig::new(
                Url::from_str(&format!("{host}:{port}")).change_context(GraphError)?,
            )
            .change_context(GraphError)?
            .await
            .map(Some)
            .change_context(GraphError)
        } else {
            Ok(None)
        }
    };

    let router = {
        let dependencies = RestRouterDependencies {
            store: Arc::new(pool),
            authorization_api: Arc::new(zanzibar_client),
            domain_regex: DomainValidator::new(args.allowed_url_domain),
            temporal_client: temporal_client_fn(args.temporal_host.clone(), args.temporal_port)
                .await?,
        };

        if args.rpc_enabled {
            tracing::info!("Starting RPC server...");

            server_rpc(args.rpc_address, Dependencies {
                store: Arc::clone(&dependencies.store),
                authorization_api: Arc::clone(&dependencies.authorization_api),
                temporal_client: temporal_client_fn(args.temporal_host, args.temporal_port).await?,
                codec: (),
            })?;
        }

        rest_api_router(dependencies)
    };

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

pub async fn healthcheck(address: ApiAddress) -> Result<(), Report<HealthcheckError>> {
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
