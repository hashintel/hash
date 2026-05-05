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
    rest::{ApiConfig, QueryLogger, RestApiStore, RestRouterDependencies, rest_api_router},
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
        HealthcheckArgs, ServerLifecycle,
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

    #[clap(flatten)]
    pub api_config: ApiConfig,

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

    // Ideally this would be `Option<AdminConfig>` and required if `embed_admin` is true, but clap
    // does not support optional flattened structs with required fields.
    // See <https://github.com/clap-rs/clap/issues/5092>.
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
    let listener = TcpListener::bind((&*address.api_host, address.api_port))
        .await
        .change_context(GraphError)?;
    tracing::info!("REST server listening on {address}");

    axum::serve(
        listener,
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

fn start_rest_server(router: axum::Router, address: HttpAddress, lifecycle: &ServerLifecycle) {
    let shutdown = lifecycle.shutdown.clone();
    lifecycle.spawn("REST server", async move {
        run_rest_server(router, address, shutdown).await
    });
}

fn start_rpc_server<S>(
    address: RpcAddress,
    dependencies: Dependencies<S, ()>,
    lifecycle: &ServerLifecycle,
) -> Result<(), Report<GraphError>>
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

    lifecycle.spawn("RPC task", async move {
        task.await;
        Ok(())
    });

    // Bridge: when our shutdown token fires, cancel the harpc server's internal token
    let shutdown = lifecycle.shutdown.clone();
    lifecycle.spawn("RPC shutdown bridge", async move {
        shutdown.cancelled().await;
        cancellation_token.cancel();
        Ok(())
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
    lifecycle.spawn("RPC server", async move {
        let stream = server.listen(address).await.change_context(GraphError)?;

        harpc_server::serve::serve(stream, router).await;
        Ok(())
    });

    Ok(())
}

/// Starts the main graph API server (REST + optional RPC).
async fn start_server<S>(
    pool: S,
    config: ServerConfig,
    query_logger: Option<QueryLogger>,
    lifecycle: &ServerLifecycle,
) -> Result<(), Report<GraphError>>
where
    S: StorePool + Send + Sync + 'static,
    for<'p> S::Store<'p>: RestApiStore + PrincipalStore + PolicyStore,
{
    let store = Arc::new(pool);
    let temporal_client = create_temporal_client(&config.temporal)
        .await?
        .map(Arc::new);

    if config.rpc_enabled {
        tracing::info!("Starting RPC server...");

        start_rpc_server(
            config.rpc_address,
            Dependencies {
                store: Arc::clone(&store),
                temporal_client: temporal_client.clone(),
                codec: (),
            },
            lifecycle,
        )?;
    }

    let router = rest_api_router(RestRouterDependencies {
        store,
        domain_regex: DomainValidator::new(config.allowed_url_domain),
        temporal_client,
        query_logger,
        api_config: config.api_config,
    });
    start_rest_server(router, config.http_address, lifecycle);

    Ok(())
}

#[expect(
    clippy::integer_division_remainder_used,
    reason = "False positive on tokio::select!"
)]
#[expect(
    clippy::exit,
    reason = "Force shutdown on double ctrl-c is intentional"
)]
#[expect(
    clippy::too_many_lines,
    reason = "Sequential startup flow, no natural split point"
)]
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

    let lifecycle = ServerLifecycle::new();

    if args.embed_admin {
        start_admin_server(pool.clone(), args.admin, &lifecycle);
    }

    if args.embed_type_fetcher {
        start_type_fetcher(args.type_fetcher.clone(), &lifecycle);
    }

    let pool = FetchingPool::new(
        pool,
        (
            args.type_fetcher.address.type_fetcher_host,
            args.type_fetcher.address.type_fetcher_port,
        ),
        DomainValidator::new(args.config.allowed_url_domain.clone()),
    );

    let log_queries = args.config.log_queries.take();

    let query_logger = if let Some(query_log_file) = log_queries {
        let file = tokio::fs::File::create(query_log_file)
            .await
            .change_context(GraphError)?;
        let write = FramedWrite::new(io::BufWriter::new(file), JsonLinesEncoder::default());
        let (tx, rx) = mpsc::channel(1000);
        lifecycle.spawn("Query logger", async move {
            if let Err(error) = rx.map(Ok).forward(write).await {
                tracing::error!("Failed to write query log: {error}");
            }
            Ok(())
        });
        Some(QueryLogger::new(tx))
    } else {
        None
    };

    if let Err(error) = start_server(pool, args.config, query_logger, &lifecycle).await {
        lifecycle.shutdown_and_wait().await;
        return Err(error);
    }

    // Wait for shutdown signal or unexpected server exit
    let aborted = tokio::select! {
        result = signal::ctrl_c() => {
            match result {
                Ok(()) => {
                    tracing::info!("Shutdown signal received, shutting down gracefully...");
                    false
                }
                Err(error) => {
                    tracing::error!("Failed to install Ctrl+C handler: {error}");
                    true
                }
            }
        }
        () = lifecycle.abort.cancelled() => {
            tracing::error!("Server component exited unexpectedly, initiating shutdown...");
            true
        }
    };

    // Double ctrl-c for force shutdown
    tokio::select! {
        () = lifecycle.shutdown_and_wait() => {}
        result = signal::ctrl_c() => {
            if let Err(error) = result {
                tracing::error!("Failed to install Ctrl+C handler: {error}");
            }
            tracing::warn!("Forced shutdown");
            std::process::exit(1);
        }
    }

    tracing::info!("Shutdown complete");

    if aborted {
        Err(GraphError.into())
    } else {
        Ok(())
    }
}

pub async fn healthcheck(address: HttpAddress) -> Result<(), Report<HealthcheckError>> {
    let request_url = format!("http://{address}/health");

    timeout(
        Duration::from_secs(10),
        Client::new().head(&request_url).send(),
    )
    .await
    .change_context(HealthcheckError::Timeout)?
    .change_context(HealthcheckError::NotHealthy)?
    .error_for_status()
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
