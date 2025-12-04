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
use futures::{FutureExt as _, StreamExt as _, channel::mpsc};
use harpc_codec::json::JsonCodec;
use harpc_server::Server;
use hash_codec::bytes::JsonLinesEncoder;
use hash_graph_api::{
    rest::{QueryLogger, RestRouterDependencies, rest_api_router},
    rpc::Dependencies,
};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_store::pool::StorePool;
use hash_graph_type_fetcher::FetchingPool;
use hash_temporal_client::TemporalClientConfig;
use multiaddr::{Multiaddr, Protocol};
use regex::Regex;
use reqwest::{Client, Url};
use tokio::{io, net::TcpListener, signal, time::timeout};
use tokio_postgres::NoTls;
use tokio_util::{codec::FramedWrite, sync::CancellationToken, task::TaskTracker};
use type_system::ontology::json_schema::DomainValidator;

use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::{type_fetcher::TypeFetcherAddress, wait_healthcheck},
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
    pub http_address: HttpAddress,

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

    /// Waits for the healthcheck to become healthy.
    #[clap(long, default_value_t = false, requires = "healthcheck")]
    pub wait: bool,

    /// Timeout for the wait flag in seconds.
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,

    /// Starts a server without connecting to the type fetcher.
    #[clap(long, default_value_t = false)]
    pub offline: bool,

    /// The URL of the Temporal server.
    ///
    /// If not set, the service will not trigger workflows.
    #[clap(long, env = "HASH_TEMPORAL_SERVER_HOST")]
    pub temporal_host: Option<String>,

    /// The port of the Temporal server.
    #[clap(long, env = "HASH_TEMPORAL_SERVER_PORT", default_value_t = 7233)]
    pub temporal_port: u16,

    /// Skips the validation of links when creating/updating entities.
    ///
    /// This should only be used in development environments.
    #[clap(long)]
    pub skip_link_validation: bool,

    /// Skips the creation of embeddings when creating/updating entities or types.
    #[clap(long, env = "HASH_GRAPH_SKIP_EMBEDDING_CREATION")]
    pub skip_embedding_creation: bool,

    /// Outputs the queries made to the graph to the specified file.
    #[clap(long)]
    pub log_queries: Option<PathBuf>,
}

#[derive(Debug)]
struct RpcServerTaskTracker {
    tracker: TaskTracker,
    cancellation_token: CancellationToken,
}

impl IntoFuture for RpcServerTaskTracker {
    type Output = ();

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            self.tracker.close();
            self.cancellation_token.cancel();
            self.tracker.wait().await;
        }
    }
}

fn server_rpc<S>(
    address: RpcAddress,
    dependencies: Dependencies<S, ()>,
) -> Result<RpcServerTaskTracker, Report<GraphError>>
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

    let tracker = TaskTracker::new();
    tracker.spawn(task.into_future());

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
    tracker.spawn(async move {
        let stream = server
            .listen(address)
            .await
            .expect("server should be able to listen on address");

        harpc_server::serve::serve(stream, router).await;
    });

    Ok(RpcServerTaskTracker {
        tracker,
        cancellation_token,
    })
}

#[expect(
    clippy::too_many_lines,
    reason = "This function should be split into multiple smaller parts"
)]
pub async fn server(args: ServerArgs) -> Result<(), Report<GraphError>> {
    if args.healthcheck {
        return wait_healthcheck(
            || healthcheck(args.http_address.clone()),
            args.wait,
            args.timeout.map(Duration::from_secs),
        )
        .await
        .change_context(GraphError);
    }

    let pool = PostgresStorePool::new(
        &args.db_info,
        &args.pool_config,
        NoTls,
        PostgresStoreSettings {
            validate_links: !args.skip_link_validation,
            skip_embedding_creation: args.skip_embedding_creation,
        },
    )
    .await
    .change_context(GraphError)
    .map_err(|report| {
        tracing::error!(error = ?report, "Failed to connect to database");
        report
    })?;

    let temporal_client_fn = |host: Option<String>, port: u16| async move {
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

    // Just test the connection; we don't need to use the store
    _ = pool
        .acquire(None)
        .await
        .change_context(GraphError)
        .attach("Connection to database failed")?;

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

    let (query_logger, log_queries_join_handle) = if let Some(query_log_file) = args.log_queries {
        let file = tokio::fs::File::create(query_log_file)
            .await
            .change_context(GraphError)?;
        let write = FramedWrite::new(io::BufWriter::new(file), JsonLinesEncoder::default());
        let (tx, rx) = mpsc::channel(1000);
        let handle = tokio::spawn(rx.map(Ok).forward(write));
        (Some(tx), Some(handle))
    } else {
        (None, None)
    };

    let (router, rpc_server_task_tracker) = {
        let dependencies = RestRouterDependencies {
            store: Arc::new(pool),
            domain_regex: DomainValidator::new(args.allowed_url_domain),
            temporal_client: temporal_client_fn(args.temporal_host.clone(), args.temporal_port)
                .await?,
            query_logger: query_logger.map(QueryLogger::new),
        };

        let rpc_server_task_tracker = if args.rpc_enabled {
            tracing::info!("Starting RPC server...");

            Some(server_rpc(
                args.rpc_address,
                Dependencies {
                    store: Arc::clone(&dependencies.store),
                    temporal_client: temporal_client_fn(args.temporal_host, args.temporal_port)
                        .await?,
                    codec: (),
                },
            )?)
        } else {
            None
        };

        (rest_api_router(dependencies), rpc_server_task_tracker)
    };

    tracing::info!("Listening on {}", args.http_address);
    axum::serve(
        TcpListener::bind((args.http_address.api_host, args.http_address.api_port))
            .await
            .change_context(GraphError)?,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(signal::ctrl_c().map(|result| match result {
        Ok(()) => (),
        Err(error) => {
            tracing::error!("Failed to install Ctrl+C handler: {error}");
            // Continue with shutdown even if signal handling had issues
        }
    }))
    .await
    .expect("failed to start server");

    if let Some(rpc_server_task_tracker) = rpc_server_task_tracker {
        rpc_server_task_tracker.await;
    }

    if let Some(log_queries_join_handle) = log_queries_join_handle
        && let Err(error) = log_queries_join_handle.await
    {
        tracing::error!("Failed to join log queries task: {error}");
    }

    Ok(())
}

pub async fn healthcheck(address: HttpAddress) -> Result<(), Report<HealthcheckError>> {
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
