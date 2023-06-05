use std::{
    fmt, fs,
    io::Cursor,
    net::{AddrParseError, SocketAddr},
    sync::Arc,
    time::Duration,
};

use clap::Parser;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use graph::{
    api::rest::{rest_api_router, OpenApiDocumentation, RestRouterDependencies},
    logging::{init_logger, LoggingArgs},
    ontology::domain_validator::DomainValidator,
    snapshot::{codec, SnapshotStore},
    store::{
        error::VersionedUrlAlreadyExists, AsClient, DatabaseConnectionInfo, FetchingPool,
        PostgresStorePool, StorePool,
    },
};
use regex::Regex;
use reqwest::Client;
use tokio::{io, time::timeout};
use tokio_postgres::NoTls;
use tokio_util::codec::FramedRead;

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
        let address = address.to_string();
        address.parse().into_report().attach_printable(address)
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
    ///   `(?P<shortname>[\w|-]+)`
    ///
    /// - contain a capture group named "kind" to identify the slug of the kind of ontology type
    ///   being hosted (data-type, property-type, entity-type, link-type), e.g.
    ///   `(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type)|(?:link-type))`
    #[clap(
        long,
        default_value_t = Regex::new(r"http://localhost:3000/@(?P<shortname>[\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type)|(?:link-type))/[\w\-_%]+/").unwrap(),
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
}

async fn restore_builtin_types<C: AsClient>(mut store: SnapshotStore<C>) -> Result<(), GraphError> {
    let restore_result = store
        .restore_snapshot(
            FramedRead::new(
                io::BufReader::new(Cursor::new(include_str!("../../built-in-types.jsonl"))),
                codec::JsonLinesDecoder::default(),
            ),
            10_000,
        )
        .await;

    if let Err(err) = restore_result {
        if err.contains::<VersionedUrlAlreadyExists>() {
            tracing::info!("tried to restore built-in type, but they already exist");
            return Ok(());
        }
        bail!(
            err.change_context(GraphError)
                .attach_printable("Failed to restore snapshot")
        )
    }

    tracing::info!("restored built-in types");

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
                    .into_report()
                    .change_context(GraphError)
                    .attach_printable("could not remove old OpenAPI file")
                    .attach_printable_lazy(|| path.display().to_string())?;
            } else {
                fs::remove_dir_all(&path)
                    .into_report()
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
    let store = pool
        .acquire()
        .await
        .change_context(GraphError)
        .attach_printable("Connection to database failed")?;

    let pool = if args.offline {
        restore_builtin_types(SnapshotStore::new(store)).await?;

        FetchingPool::new_offline(pool)
    } else {
        // `store` is bound to the lifetime of `pool`, which is moved into `FetchingPool`.
        // The acquire is done regardless to check for a valid database connection.
        drop(store);
        FetchingPool::new(
            pool,
            (
                args.type_fetcher_address.type_fetcher_host,
                args.type_fetcher_address.type_fetcher_port,
            ),
            DomainValidator::new(args.allowed_url_domain.clone()),
        )
    };

    let router = rest_api_router(RestRouterDependencies {
        store: Arc::new(pool),
        domain_regex: DomainValidator::new(args.allowed_url_domain),
    });

    tracing::info!("Listening on {}", args.api_address);
    axum::Server::bind(&args.api_address.try_into().change_context(GraphError)?)
        .serve(router.into_make_service_with_connect_info::<SocketAddr>())
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
    .into_report()
    .change_context(HealthcheckError::Timeout)?
    .into_report()
    .change_context(HealthcheckError::NotHealthy)?;

    Ok(())
}
