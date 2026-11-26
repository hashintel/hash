//! The Graph, served by the test: Postgres from a container, migrated and seeded, and the Graph's
//! REST router on a free port.

use alloc::sync::Arc;
use core::{net::SocketAddr, num::NonZero, time::Duration};

use hash_crypto::Secret;
use hash_graph_api::rest::{
    self, CorsConfig, PublicApiConfig,
    authentication::KratosSessionConfig,
    legacy::{ApiConfig, entity::ClusteringContext, hashql::CompilerContext},
    rate_limit::RateLimitConfig,
};
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_graph_store::{
    filter::protection::PropertyProtectionFilterConfig, migration::StoreMigration as _,
    pool::StorePool as _,
};
use hash_graph_type_fetcher::FetchingPool;
use hash_middleware::rate_limit::{ClientIpSource, RateLimitMode};
use regex::Regex;
use testcontainers::{ContainerAsync, ImageExt as _, runners::AsyncRunner as _};
use testcontainers_modules::postgres::Postgres;
use tokio::net::TcpListener;
use type_system::{
    ontology::json_schema::DomainValidator,
    principal::{actor::ActorId, actor_group::WebId},
};
use url::Url;

use super::fixtures;

/// The secret the ledger's client authenticates to the Graph with.
pub(super) const SERVICE_SECRET: &str = "ledger-test-service-secret";

/// A running Graph and the web the aviation integration writes to.
pub(super) struct Graph {
    _postgres: ContainerAsync<Postgres>,
    pub pool: Arc<FetchingPool<PostgresStorePool>>,
    /// The URL of the Graph's REST API, ending in `/`.
    pub url: Url,
    /// The machine actor the integration writes as, an administrator of `web`.
    pub actor: ActorId,
    pub web: WebId,
}

impl Graph {
    /// Starts Postgres, migrates and seeds it with the aviation ontology, and serves the Graph.
    pub(super) async fn start() -> Self {
        let postgres = Postgres::default()
            .with_user("graph")
            .with_password("graph")
            .with_db_name("graph")
            .with_name("pgvector/pgvector")
            .with_tag("0.8.2-pg18-trixie")
            .start()
            .await
            .expect("the Postgres container should start");
        let host = postgres
            .get_host()
            .await
            .expect("the Postgres host should resolve")
            .to_string();
        let port = postgres
            .get_host_port_ipv4(5432)
            .await
            .expect("the Postgres port should be mapped");
        let pool = PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "graph".to_owned(),
                Secret::from_string("graph".to_owned()),
                host,
                port,
                "graph".to_owned(),
            ),
            &DatabasePoolConfig::default(),
            PostgresStoreSettings::default(),
        )
        .expect("the Postgres pool should be configured");
        let (actor, web) = {
            let mut store = pool
                .acquire(None)
                .await
                .expect("a database connection should open");
            store
                .run_migrations()
                .await
                .expect("the Graph's migrations should run");
            fixtures::seed(&mut store).await
        };
        let filter_protection = Arc::clone(&pool.settings.filter_protection);
        // Offline: the aviation ontology is seeded, so no type is fetched.
        let pool = Arc::new(FetchingPool::new_offline(pool));

        let url = Self::serve(Arc::clone(&pool), filter_protection).await;

        Self {
            _postgres: postgres,
            pool,
            url,
            actor,
            web,
        }
    }

    /// Serves the Graph's REST API on `pool`, on a free port, and returns its URL.
    async fn serve(
        pool: Arc<FetchingPool<PostgresStorePool>>,
        filter_protection: Arc<PropertyProtectionFilterConfig<'static>>,
    ) -> Url {
        let router = rest::router(rest::Dependencies {
            store: pool,
            temporal_client: None,
            embedding_client: None,
            domain_regex: DomainValidator::new(
                Regex::new(
                    r"https://example\.com/@(?P<shortname>[\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type))/[\w\-_%]+/",
                )
                .expect("the domain pattern should be valid"),
            ),
            query_logger: None,
            api_config: ApiConfig {
                query_entity_limit: 1000,
                query_ontology_limit: 1000,
            },
            public_api_config: PublicApiConfig {
                query_entity_limit: NonZero::new(100).expect("100 should not be zero"),
            },
            session_auth: KratosSessionConfig {
                // Not called: the ledger authenticates with the service secret.
                kratos_public_url: Url::parse("http://127.0.0.1:1/")
                    .expect("the Kratos URL should be valid"),
                http_timeout: Duration::from_secs(1),
                cache: None,
            },
            service_secret: Secret::from_string(SERVICE_SECRET.to_owned()).to_arc(),
            api_tokens: None,
            rate_limit: RateLimitConfig {
                rate_limit_mode: RateLimitMode::Observe,
                client_ip_source: ClientIpSource::ConnectInfo,
                rate_limit_gate_per_second: NonZero::new(1000).expect("should not be zero"),
                rate_limit_gate_burst: NonZero::new(1000).expect("should not be zero"),
                rate_limit_anonymous_per_hour: NonZero::new(100_000).expect("should not be zero"),
                rate_limit_anonymous_burst: NonZero::new(1000).expect("should not be zero"),
                rate_limit_actor_per_hour: NonZero::new(100_000).expect("should not be zero"),
                rate_limit_actor_burst: NonZero::new(1000).expect("should not be zero"),
            },
            cors: CorsConfig::default(),
            meter: opentelemetry::global::meter("ledger-test"),
            compiler: Arc::new(CompilerContext::new(None, None)),
            filter_protection,
            clustering: Arc::new(ClusteringContext::new(None)),
        });
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("the Graph should bind a port");
        let address = listener
            .local_addr()
            .expect("the Graph's address should resolve");
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .expect("the Graph should serve");
        });

        Url::parse(&format!("http://{address}/")).expect("the Graph URL should be valid")
    }
}
