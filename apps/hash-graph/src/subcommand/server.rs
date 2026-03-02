use alloc::sync::Arc;
use core::{
    fmt,
    net::{AddrParseError, SocketAddr},
    str::FromStr as _,
    time::Duration,
};
use std::path::PathBuf;

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, channel::mpsc};
use harpc_codec::json::JsonCodec;
use harpc_server::Server;
use hash_codec::bytes::JsonLinesEncoder;
use hash_graph_api::{
    rest::{QueryLogger, RestApiStore, RestRouterDependencies, rest_api_router},
    rpc::Dependencies,
};
use hash_graph_authorization::policies::store::{PolicyStore, PrincipalStore};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_store::{filter::protection::PropertyProtectionFilterConfig, pool::StorePool};
use hash_graph_type_fetcher::FetchingPool;
use hash_temporal_client::{TemporalClient, TemporalClientConfig};
use multiaddr::{Multiaddr, Protocol};
use regex::Regex;
use reqwest::{Client, Url};
use tokio::{io, net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;
use tokio_util::{codec::FramedWrite, sync::CancellationToken};
use type_system::ontology::json_schema::DomainValidator;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{
        HealthcheckArgs, ServerTaskTracker,
        admin_server::{AdminConfig, start_admin_server},
        type_fetcher::{TypeFetcherConfig, start_type_fetcher},
        wait_healthcheck,
    },
};

#[derive(Debug, Clone, Parser)]
pub struct HttpAddress {
    /// The host the REST client is listening at.
    #[clap(long, default_value = "127.0.0.1", env = "HASH_GRAPH_HTTP_HOST")]
    pub api_host: String,

    /// The port the REST client is listening at.
    #[clap(long, default_value_t = 4000, env = "HASH_GRAPH_HTTP_PORT")]
    pub api_port: u16,
}

impl fmt::Display for HttpAddress {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.api_host, self.api_port)
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
        address.to_string().parse::<Self>().attach(address)
    }
}

#[derive(Debug, Clone, Parser)]
pub struct TemporalAddress {
    /// The URL of the Temporal server.
    ///
    /// If not set, the service will not trigger workflows.
    #[clap(long, env = "HASH_TEMPORAL_SERVER_HOST")]
    pub temporal_host: Option<String>,

    /// The port of the Temporal server.
    #[clap(long, env = "HASH_TEMPORAL_SERVER_PORT", default_value_t = 7233)]
    pub temporal_port: u16,
}

#[derive(Debug, Clone, Parser)]
pub struct TemporalConfig {
    #[clap(flatten)]
    pub address: TemporalAddress,
}

/// Configuration for the main graph API server.
///
/// Groups HTTP address, RPC address, temporal client, store behavior, and
/// domain validation — everything that defines the core server.
#[expect(
    clippy::struct_excessive_bools,
    reason = "CLI arguments are boolean flags."
)]
#[derive(Debug, Clone, Parser)]
pub struct ServerConfig {
    #[clap(flatten)]
    pub http_address: HttpAddress,

    /// Enable the experimental RPC server.
    #[clap(long, default_value_t = false, env = "HASH_GRAPH_RPC_ENABLED")]
    pub rpc_enabled: bool,

    #[clap(flatten)]
    pub rpc_address: RpcAddress,

    #[clap(flatten)]
    pub temporal: TemporalConfig,

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

    /// Skips the validation of links when creating/updating entities.
    ///
    /// This should only be used in development environments.
    #[clap(long)]
    pub skip_link_validation: bool,

    /// Skips the creation of embeddings when creating/updating entities or types.
    #[clap(long, env = "HASH_GRAPH_SKIP_EMBEDDING_CREATION")]
    pub skip_embedding_creation: bool,

    /// Disables filter protection that prevents enumeration attacks on protected properties.
    ///
    /// When enabled (protection disabled), queries filtering on protected properties like email
    /// will not automatically exclude sensitive entity types. This should only be used in
    /// development/testing environments.
    #[clap(long, env = "HASH_GRAPH_SKIP_FILTER_PROTECTION")]
    pub skip_filter_protection: bool,

    /// Outputs the queries made to the graph to the specified file.
    #[clap(long)]
    pub log_queries: Option<PathBuf>,
}

/// CLI arguments for the `server` subcommand.
#[derive(Debug, Parser)]
pub struct ServerArgs {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub db_pool_config: DatabasePoolConfig,

    #[clap(flatten)]
    pub config: ServerConfig,

    #[clap(flatten)]
    pub healthcheck: HealthcheckArgs,

    /// Start an embedded admin server alongside the main API server.
    ///
    /// In production, prefer running `hash-graph admin-server` as a dedicated process.
    #[clap(long, default_value_t = false, env = "HASH_GRAPH_EMBED_ADMIN")]
    pub embed_admin: bool,

    #[clap(flatten)]
    pub admin: AdminConfig,

    /// Start an embedded type fetcher instead of connecting to an external one.
    ///
    /// Uses the address configured by `--type-fetcher-host` and `--type-fetcher-port`.
    #[clap(long, default_value_t = false, env = "HASH_GRAPH_EMBED_TYPE_FETCHER")]
    pub embed_type_fetcher: bool,

    #[clap(flatten)]
    pub type_fetcher: TypeFetcherConfig,
}

async fn run_rest_server(
    router: axum::Router,
    address: HttpAddress,
    shutdown: CancellationToken,
) -> Result<(), Report<GraphError>> {
    tracing::info!("REST server listening on {address}");
    axum::serve(
        TcpListener::bind((address.api_host, address.api_port))
            .await
            .change_context(GraphError)?,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown.cancelled_owned())
    .await
    .change_context(GraphError)?;

    Ok(())
}

async fn create_temporal_client(
    config: &TemporalConfig,
) -> Result<Option<TemporalClient>, Report<GraphError>> {
    if let Some(host) = &config.address.temporal_host {
        TemporalClientConfig::new(
            Url::from_str(&format!("{host}:{}", config.address.temporal_port))
                .change_context(GraphError)?,
        )
        .await
        .change_context(GraphError)
        .map(Some)
    } else {
        Ok(None)
    }
}

fn start_rest_server(router: axum::Router, address: HttpAddress) -> ServerTaskTracker {
    let (handle, shutdown) = ServerTaskTracker::new();
    handle.spawn(async move {
        if let Err(report) = run_rest_server(router, address, shutdown).await {
            tracing::error!(error = ?report, "REST server failed");
        }
    });
    handle
}

fn start_rpc_server<S>(
    address: RpcAddress,
    dependencies: Dependencies<S, ()>,
) -> Result<ServerTaskTracker, Report<GraphError>>
where
    S: StorePool + Send + Sync + 'static,
    for<'p> S::Store<'p>: PrincipalStore,
{
    let server = Server::new(harpc_server::ServerConfig::default()).change_context(GraphError)?;
    let cancellation_token = server.cancellation_token();

    let (router, task) = hash_graph_api::rpc::rpc_router(
        Dependencies {
            store: dependencies.store,
            temporal_client: dependencies.temporal_client,
            codec: JsonCodec,
        },
        server.events(),
    );

    let (handle, shutdown) = ServerTaskTracker::new();
    handle.spawn(task.into_future());

    // Bridge: when our shutdown token fires, cancel the harpc server's internal token
    handle.spawn(async move {
        shutdown.cancelled().await;
        cancellation_token.cancel();
    });

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
    handle.spawn(async move {
        let stream = server
            .listen(address)
            .await
            .expect("server should be able to listen on address");

        harpc_server::serve::serve(stream, router).await;
    });

    Ok(handle)
}

/// Starts the main graph API server (REST + optional RPC).
///
/// Returns handles for the REST server and the optional RPC server.
async fn start_server<S>(
    pool: S,
    config: ServerConfig,
    query_logger: Option<QueryLogger>,
) -> Result<(ServerTaskTracker, Option<ServerTaskTracker>), Report<GraphError>>
where
    S: StorePool + Send + Sync + 'static,
    for<'p> S::Store<'p>: RestApiStore + PrincipalStore + PolicyStore,
{
    let store = Arc::new(pool);

    let dependencies = RestRouterDependencies {
        store: Arc::clone(&store),
        domain_regex: DomainValidator::new(config.allowed_url_domain),
        temporal_client: create_temporal_client(&config.temporal).await?,
        query_logger,
    };

    let rpc_server_handle = if config.rpc_enabled {
        tracing::info!("Starting RPC server...");

        Some(start_rpc_server(
            config.rpc_address,
            Dependencies {
                store,
                temporal_client: create_temporal_client(&config.temporal).await?,
                codec: (),
            },
        )?)
    } else {
        None
    };

    let router = rest_api_router(dependencies);
    let rest_server_handle = start_rest_server(router, config.http_address);

    Ok((rest_server_handle, rpc_server_handle))
}

#[expect(clippy::too_many_lines, reason = "Subcommand entrypoint")]
pub async fn server(mut args: ServerArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.config.http_address.clone()),
            &args.healthcheck,
        )
        .await
        .change_context(GraphError);
    }

    let pool = PostgresStorePool::new(
        &args.db_info,
        &args.db_pool_config,
        NoTls,
        PostgresStoreSettings {
            validate_links: !args.config.skip_link_validation,
            skip_embedding_creation: args.config.skip_embedding_creation,
            filter_protection: if args.config.skip_filter_protection {
                PropertyProtectionFilterConfig::new()
            } else {
                PropertyProtectionFilterConfig::hash_default()
            },
        },
    )
    .await
    .change_context(GraphError)
    .map_err(|report| {
        tracing::error!(error = ?report, "Failed to connect to database");
        report
    })?;

    // Just test the connection; we don't need to use the store
    _ = pool
        .acquire(None)
        .await
        .change_context(GraphError)
        .attach("Connection to database failed")?;

    let admin_server_handle = args
        .embed_admin
        .then(|| start_admin_server(pool.clone(), args.admin));

    let type_fetcher_handle = args
        .embed_type_fetcher
        .then(|| start_type_fetcher(args.type_fetcher.clone()));

    let pool = FetchingPool::new(
        pool,
        (
            args.type_fetcher.address.type_fetcher_host,
            args.type_fetcher.address.type_fetcher_port,
        ),
        DomainValidator::new(args.config.allowed_url_domain.clone()),
    );

    let log_queries = args.config.log_queries.take();

    let (query_logger, log_queries_handle) = if let Some(query_log_file) = log_queries {
        let file = tokio::fs::File::create(query_log_file)
            .await
            .change_context(GraphError)?;
        let write = FramedWrite::new(io::BufWriter::new(file), JsonLinesEncoder::default());
        let (tx, rx) = mpsc::channel(1000);
        let (handle, _shutdown) = ServerTaskTracker::new();
        handle.spawn(async move {
            if let Err(error) = rx.map(Ok).forward(write).await {
                tracing::error!("Failed to write query log: {error}");
            }
        });
        (Some(QueryLogger::new(tx)), Some(handle))
    } else {
        (None, None)
    };

    let (rest_server_handle, rpc_server_handle) =
        start_server(pool, args.config, query_logger).await?;

    // Wait for shutdown signal
    match signal::ctrl_c().await {
        Ok(()) => {}
        Err(error) => {
            tracing::error!("Failed to install Ctrl+C handler: {error}");
        }
    }

    tracing::info!("Shutting down...");

    // Graceful shutdown of all servers concurrently
    tokio::join!(
        async {
            rest_server_handle.await;
            tracing::info!("REST server shut down");
        },
        async {
            if let Some(handle) = rpc_server_handle {
                handle.await;
                tracing::info!("RPC server shut down");
            }
        },
        async {
            if let Some(handle) = admin_server_handle {
                handle.await;
                tracing::info!("Admin server shut down");
            }
        },
        async {
            if let Some(handle) = type_fetcher_handle {
                handle.await;
                tracing::info!("Type fetcher shut down");
            }
        },
        async {
            if let Some(handle) = log_queries_handle {
                handle.await;
                tracing::info!("Query logger shut down");
            }
        },
    );

    tracing::info!("Shutdown complete");

    Ok(())
}

pub async fn healthcheck(address: HttpAddress) -> Result<(), Report<HealthcheckError>> {
    let request_url = format!("http://{address}/health");

    timeout(
        Duration::from_secs(10),
        Client::new().head(&request_url).send(),
    )
    .await
    .change_context(HealthcheckError::Timeout)?
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
